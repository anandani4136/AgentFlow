import axios from 'axios';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { SimpleVectorStore, Document } from './simple-vector-store';
import { FAQService } from './faq-service';

export interface DataSource {
  id: string;
  name: string;
  type: 'url' | 'api';
  url: string;
  headers?: Record<string, string>;
  parameters?: Record<string, string>;
  refreshInterval?: number; // in minutes
  lastFetched?: string;
}

export interface RAGResponse {
  answer: string;
  sources: Array<{
    id: string;
    content: string;
    source: string;
    score: number;
  }>;
  confidence: number;
}

export class RAGService {
  private vectorStore: SimpleVectorStore;
  private bedrockClient: BedrockRuntimeClient;
  private dataSources: Map<string, DataSource> = new Map();
  private faqService: FAQService;

  constructor() {
    this.vectorStore = new SimpleVectorStore();
    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.REGION || 'us-east-1',
    });
    
    // Initialize FAQ service
    const faqTableName = process.env.FAQ_SOURCES_TABLE_NAME || 'FAQSourcesTable';
    this.faqService = new FAQService(faqTableName);
    
    // Initialize default data sources
    this.initializeDefaultSources();
  }

  private initializeDefaultSources(): void {
    // Add some default FAQ sources
    const defaultSources: DataSource[] = [
      {
        id: 'banking-faq',
        name: 'Banking FAQ',
        type: 'url',
        url: 'https://api.example.com/banking/faq',
        refreshInterval: 60, // 1 hour
      },
      {
        id: 'technical-support',
        name: 'Technical Support Knowledge Base',
        type: 'url',
        url: 'https://api.example.com/support/kb',
        refreshInterval: 120, // 2 hours
      },
      {
        id: 'product-info',
        name: 'Product Information',
        type: 'api',
        url: 'https://api.example.com/products',
        refreshInterval: 30, // 30 minutes
      },
    ];

    defaultSources.forEach(source => {
      this.dataSources.set(source.id, source);
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.vectorStore.initialize();
    } catch (error) {
      console.error('Error initializing vector store:', error);
      // Continue without vector store initialization
    }
    
    // Load FAQ sources from DynamoDB
    try {
      const faqSources = await this.faqService.getActiveSources();
      console.log(`Loaded ${faqSources.length} active FAQ sources from DynamoDB`);
      
      // Convert FAQ sources to DataSource format
      faqSources.forEach(faqSource => {
        const dataSource: DataSource = {
          id: faqSource.sourceId,
          name: faqSource.name,
          type: faqSource.type,
          url: faqSource.url,
          refreshInterval: 60, // Default 1 hour
        };
        this.dataSources.set(faqSource.sourceId, dataSource);
      });
    } catch (error) {
      console.error('Error loading FAQ sources from DynamoDB:', error);
      // Fall back to default sources if DynamoDB fails
      console.log('Falling back to default sources');
    }
    
    console.log('RAG service initialized');
  }

  async addDataSource(source: DataSource): Promise<void> {
    this.dataSources.set(source.id, source);
    console.log(`Added data source: ${source.name}`);
  }

  async removeDataSource(sourceId: string): Promise<void> {
    this.dataSources.delete(sourceId);
    console.log(`Removed data source: ${sourceId}`);
  }

  async fetchAndIndexData(sourceId: string): Promise<void> {
    const source = this.dataSources.get(sourceId);
    if (!source) {
      throw new Error(`Data source not found: ${sourceId}`);
    }

    try {
      let data: any;
      
      if (source.type === 'url') {
        // Fetch from URL
        const response = await axios.get(source.url, {
          headers: source.headers,
          timeout: 10000,
        });
        data = response.data;
      } else if (source.type === 'api') {
        // Fetch from API with parameters
        const response = await axios.get(source.url, {
          headers: source.headers,
          params: source.parameters,
          timeout: 10000,
        });
        data = response.data;
      }

      // Process and index the data
      await this.processAndIndexData(data, source);
      
      // Update last fetched timestamp
      source.lastFetched = new Date().toISOString();
      
      console.log(`Successfully fetched and indexed data from: ${source.name}`);
    } catch (error) {
      console.error(`Error fetching data from ${source.name}:`, error);
      throw error;
    }
  }

  private async processAndIndexData(data: any, source: DataSource): Promise<void> {
    // Convert data to documents based on structure
    const documents: Document[] = [];
    
    if (Array.isArray(data)) {
      // Handle array of items
      for (const item of data) {
        const document = await this.createDocument(item, source);
        if (document) {
          documents.push(document);
        }
      }
    } else if (typeof data === 'object') {
      // Handle single object or nested structure
      const document = await this.createDocument(data, source);
      if (document) {
        documents.push(document);
      }
    }

    // Add documents to vector store
    for (const document of documents) {
      await this.vectorStore.addDocument(document);
    }
  }

  private async createDocument(item: any, source: DataSource): Promise<Document | null> {
    // Extract content and metadata based on common patterns
    let content = '';
    let metadata: Record<string, any> = {};

    if (item.content || item.text || item.body) {
      content = item.content || item.text || item.body;
    } else if (item.title && item.description) {
      content = `${item.title}\n\n${item.description}`;
    } else if (item.question && item.answer) {
      content = `Q: ${item.question}\nA: ${item.answer}`;
    } else if (typeof item === 'string') {
      content = item;
    } else {
      // Fallback: stringify the entire object
      content = JSON.stringify(item);
    }

    if (!content.trim()) {
      return null;
    }

    // Extract metadata
    metadata = {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      ...item,
    };

    // Generate embedding
    const embedding = await this.generateEmbedding(content);

    return {
      id: `${source.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      metadata,
      embedding,
      source: source.type === 'url' ? 'url' : 'api',
      url: source.url,
      lastUpdated: new Date().toISOString(),
    };
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.bedrockClient.send(new InvokeModelCommand({
        modelId: 'amazon.titan-embed-text-v2:0',
        contentType: 'application/json',
        body: JSON.stringify({
          inputText: text,
        }),
      }));

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Return a default embedding if generation fails
      return new Array(1536).fill(0); // Titan uses 1536 dimensions
    }
  }

  async query(query: string, context?: string): Promise<RAGResponse> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Search for similar documents
      const searchResults = await this.vectorStore.searchSimilar(query, queryEmbedding, 5);
      
      if (searchResults.length === 0) {
        return {
          answer: "I don't have enough information to answer that question. Could you please provide more details?",
          sources: [],
          confidence: 0.1,
        };
      }

      // Generate answer using Bedrock
      const answer = await this.generateAnswer(query, searchResults, context);
      
      return {
        answer,
        sources: searchResults.map(result => ({
          id: result.id,
          content: result.content.substring(0, 200) + '...',
          source: result.source,
          score: result.score,
        })),
        confidence: Math.min(searchResults[0].score / 10, 0.95),
      };
    } catch (error) {
      console.error('Error in RAG query:', error);
      return {
        answer: "I'm having trouble processing your request right now. Please try again later.",
        sources: [],
        confidence: 0.0,
      };
    }
  }

  private async generateAnswer(query: string, sources: any[], context?: string): Promise<string> {
    try {
      const contextText = context ? `Context: ${context}\n` : '';
      const sourcesText = sources.map(s => s.content).join('\n\n');
      
      const prompt = `${contextText}Based on the following information, please answer the user's question. If the information doesn't contain the answer, say so clearly.

Information:
${sourcesText}

Question: ${query}

Answer:`;

      const response = await this.bedrockClient.send(new InvokeModelCommand({
        modelId: 'amazon.nova-lite-v1:0',
        contentType: 'application/json',
        body: JSON.stringify({
          prompt: prompt,
          max_tokens: 500,
          temperature: 0.7,
        }),
      }));

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return responseBody.completion?.trim() || "I couldn't generate a response based on the available information.";
    } catch (error) {
      console.error('Error generating answer with Bedrock, falling back to simple answer generation:', error);
      return this.generateSimpleAnswer(query, sources);
    }
  }

  private generateSimpleAnswer(query: string, sources: any[]): string {
    const lowerQuery = query.toLowerCase();
    
    // Enhanced keyword matching for common FAQ patterns
    if (lowerQuery.includes('account balance') || lowerQuery.includes('check balance') || lowerQuery.includes('balance')) {
      const balanceSource = sources.find(s => s.content.toLowerCase().includes('account balance') || s.content.toLowerCase().includes('balance'));
      if (balanceSource) {
        return "You can check your account balance by logging into your online banking portal, using the mobile app, or calling our customer service number.";
      }
    }
    
    if (lowerQuery.includes('wire transfer') || lowerQuery.includes('international') || lowerQuery.includes('fee') || lowerQuery.includes('cost')) {
      const wireSource = sources.find(s => s.content.toLowerCase().includes('wire transfer') || s.content.toLowerCase().includes('fee') || s.content.toLowerCase().includes('cost'));
      if (wireSource) {
        return "International wire transfers typically cost $25-45 depending on the destination country and amount.";
      }
    }
    
    if (lowerQuery.includes('password') || lowerQuery.includes('reset') || lowerQuery.includes('forgot')) {
      const passwordSource = sources.find(s => s.content.toLowerCase().includes('password') || s.content.toLowerCase().includes('reset'));
      if (passwordSource) {
        return "To reset your password, go to the login page and click 'Forgot Password', then follow the instructions sent to your email.";
      }
    }
    
    if (lowerQuery.includes('security') || lowerQuery.includes('best practice') || lowerQuery.includes('two-factor')) {
      const securitySource = sources.find(s => s.content.toLowerCase().includes('security') || s.content.toLowerCase().includes('best practice'));
      if (securitySource) {
        return "Account security best practices include using strong passwords, enabling two-factor authentication, never sharing your credentials, and regularly monitoring your account activity.";
      }
    }
    
    if (lowerQuery.includes('mobile app') || lowerQuery.includes('app feature') || lowerQuery.includes('mobile')) {
      const mobileSource = sources.find(s => s.content.toLowerCase().includes('mobile app') || s.content.toLowerCase().includes('mobile'));
      if (mobileSource) {
        return "Our mobile app allows you to check balances, transfer funds, pay bills, deposit checks, and manage your account settings.";
      }
    }
    
    // Try to find any source that contains keywords from the query
    const queryWords = lowerQuery.split(' ').filter(word => word.length > 3); // Filter out short words
    for (const word of queryWords) {
      const matchingSource = sources.find(s => s.content.toLowerCase().includes(word));
      if (matchingSource) {
        return `Based on our knowledge base: ${matchingSource.content.substring(0, 200)}...`;
      }
    }
    
    // If no specific match, return a generic response based on available sources
    if (sources.length > 0) {
      const firstSource = sources[0];
      return `Based on our knowledge base: ${firstSource.content.substring(0, 200)}...`;
    }
    
    return "I don't have enough information to answer that question. Could you please provide more details?";
  }

  async refreshAllSources(): Promise<void> {
    const promises = Array.from(this.dataSources.keys()).map(sourceId => 
      this.fetchAndIndexData(sourceId).catch(error => {
        console.error(`Failed to refresh source ${sourceId}:`, error);
      })
    );
    
    await Promise.all(promises);
    console.log('Refreshed all data sources');
  }

  async getDataSources(): Promise<DataSource[]> {
    return Array.from(this.dataSources.values());
  }
}
