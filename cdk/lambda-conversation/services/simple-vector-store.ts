import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
  source: 'faq' | 'knowledge_base' | 'url' | 'api';
  url?: string;
  lastUpdated: string;
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  score: number;
  source: string;
}

export class SimpleVectorStore {
  private documents: Map<string, Document> = new Map();
  private bedrockClient: BedrockRuntimeClient;

  constructor() {
    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.REGION || 'us-east-1',
    });
  }

  async initialize(): Promise<void> {
    try {
      // Add some sample documents for testing
      await this.addSampleDocuments();
      console.log('Simple vector store initialized with sample documents');
    } catch (error) {
      console.error('Error initializing simple vector store:', error);
      // Continue without sample documents
      console.log('Simple vector store initialized without sample documents');
    }
  }

  private async addSampleDocuments(): Promise<void> {
    const sampleDocuments = [
      {
        id: 'faq-1',
        content: 'How do I check my account balance? You can check your account balance by logging into your online banking portal, using the mobile app, or calling our customer service number.',
        metadata: { category: 'banking', type: 'faq' },
        source: 'faq' as const,
        url: 'https://example.com/banking/balance',
      },
      {
        id: 'faq-2',
        content: 'What are the fees for international wire transfers? International wire transfers typically cost $25-45 depending on the destination country and amount.',
        metadata: { category: 'banking', type: 'faq' },
        source: 'faq' as const,
        url: 'https://example.com/banking/wire-fees',
      },
      {
        id: 'faq-3',
        content: 'How do I reset my password? To reset your password, go to the login page and click "Forgot Password", then follow the instructions sent to your email.',
        metadata: { category: 'technical', type: 'faq' },
        source: 'faq' as const,
        url: 'https://example.com/support/password-reset',
      },
      {
        id: 'kb-1',
        content: 'Account security best practices: Use strong passwords, enable two-factor authentication, never share your credentials, and regularly monitor your account activity.',
        metadata: { category: 'security', type: 'knowledge_base' },
        source: 'knowledge_base' as const,
        url: 'https://example.com/security/best-practices',
      },
      {
        id: 'kb-2',
        content: 'Mobile app features: Our mobile app allows you to check balances, transfer funds, pay bills, deposit checks, and manage your account settings.',
        metadata: { category: 'mobile', type: 'knowledge_base' },
        source: 'knowledge_base' as const,
        url: 'https://example.com/mobile/features',
      },
    ];

    for (const doc of sampleDocuments) {
      try {
        // Try to generate embedding, fall back to placeholder if it fails
        const embedding = await this.generateEmbedding(doc.content);
        const document: Document = {
          ...doc,
          embedding,
          lastUpdated: new Date().toISOString(),
        };
        this.documents.set(doc.id, document);
      } catch (error) {
        console.error(`Error generating embedding for document ${doc.id}:`, error);
        // Use placeholder embedding if generation fails
        const document: Document = {
          ...doc,
          embedding: new Array(1536).fill(0), // Placeholder embedding for Titan
          lastUpdated: new Date().toISOString(),
        };
        this.documents.set(doc.id, document);
      }
    }
  }

  async addDocument(document: Document): Promise<void> {
    if (!document.embedding) {
      document.embedding = await this.generateEmbedding(document.content);
    }
    this.documents.set(document.id, document);
    console.log(`Added document to simple vector store: ${document.id}`);
  }

  async searchSimilar(query: string, embedding: number[], limit: number = 5): Promise<SearchResult[]> {
    const queryEmbedding = embedding.length > 0 ? embedding : await this.generateEmbedding(query);
    
    const results: Array<SearchResult & { similarity: number }> = [];

    for (const [id, doc] of this.documents) {
      if (doc.embedding) {
        const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
        results.push({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          score: similarity,
          source: doc.source,
          similarity,
        });
      }
    }

    // Sort by similarity score (descending) and return top results
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(({ similarity, ...result }) => result);
  }

  async searchBySource(source: string, limit: number = 10): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    for (const [id, doc] of this.documents) {
      if (doc.source === source) {
        results.push({
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
          score: 1.0, // Default score for source-based search
          source: doc.source,
        });
      }
    }

    return results.slice(0, limit);
  }

  async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id);
    console.log(`Deleted document from simple vector store: ${id}`);
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<void> {
    const existing = this.documents.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, lastUpdated: new Date().toISOString() };
      this.documents.set(id, updated);
      console.log(`Updated document in simple vector store: ${id}`);
    }
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

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getDocumentCount(): number {
    return this.documents.size;
  }
}
