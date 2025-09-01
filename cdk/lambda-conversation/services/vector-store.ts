import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

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

export class VectorStoreService {
  private client: Client;
  private indexName: string;

  constructor() {
    const endpoint = process.env.OPENSEARCH_ENDPOINT;
    const region = process.env.REGION || 'us-east-1';
    
    if (!endpoint) {
      throw new Error('OPENSEARCH_ENDPOINT environment variable is required');
    }

    this.indexName = process.env.OPENSEARCH_INDEX || 'conversation-knowledge';
    
    this.client = new Client({
      ...AwsSigv4Signer({
        region,
        service: 'es',
        getCredentials: () => defaultProvider()(),
      }),
      node: `https://${endpoint}`,
    });
  }

  async initialize(): Promise<void> {
    try {
      // Check if index exists
      const indexExists = await this.client.indices.exists({
        index: this.indexName,
      });

      if (!indexExists.body) {
        // Create index with mapping for vector search
        await this.client.indices.create({
          index: this.indexName,
          body: {
            mappings: {
              properties: {
                content: {
                  type: 'text',
                  analyzer: 'standard',
                },
                metadata: {
                  type: 'object',
                },
                embedding: {
                  type: 'knn_vector',
                  dimension: 1536, // OpenAI embedding dimension
                  method: {
                    name: 'hnsw',
                    space_type: 'cosinesimil',
                    engine: 'nmslib',
                  },
                },
                source: {
                  type: 'keyword',
                },
                url: {
                  type: 'keyword',
                },
                lastUpdated: {
                  type: 'date',
                },
              },
            },
            settings: {
              index: {
                knn: true,
                'knn.algo_param.ef_search': 100,
              },
            },
          },
        });
        console.log(`Created OpenSearch index: ${this.indexName}`);
      } else {
        console.log(`OpenSearch index already exists: ${this.indexName}`);
      }
    } catch (error) {
      console.error('Error initializing vector store:', error);
      throw error;
    }
  }

  async addDocument(document: Document): Promise<void> {
    try {
      await this.client.index({
        index: this.indexName,
        id: document.id,
        body: {
          content: document.content,
          metadata: document.metadata,
          embedding: document.embedding,
          source: document.source,
          url: document.url,
          lastUpdated: document.lastUpdated,
        },
      });
      console.log(`Added document to vector store: ${document.id}`);
    } catch (error) {
      console.error('Error adding document to vector store:', error);
      throw error;
    }
  }

  async searchSimilar(query: string, embedding: number[], limit: number = 5): Promise<SearchResult[]> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        body: {
          query: {
            bool: {
              must: [
                {
                  knn: {
                    embedding: {
                      vector: embedding,
                      k: limit,
                    },
                  },
                },
              ],
              should: [
                {
                  match: {
                    content: {
                      query: query,
                      boost: 0.3,
                    },
                  },
                },
              ],
            },
          },
          size: limit,
        },
      });

      const hits = response.body.hits.hits;
      return hits.map((hit: any) => ({
        id: hit._id,
        content: hit._source.content,
        metadata: hit._source.metadata,
        score: hit._score,
        source: hit._source.source,
      }));
    } catch (error) {
      console.error('Error searching vector store:', error);
      throw error;
    }
  }

  async searchBySource(source: string, limit: number = 10): Promise<SearchResult[]> {
    try {
      const response = await this.client.search({
        index: this.indexName,
        body: {
          query: {
            term: {
              source: source,
            },
          },
          size: limit,
          sort: [
            {
              lastUpdated: {
                order: 'desc',
              },
            },
          ],
        },
      });

      const hits = response.body.hits.hits;
      return hits.map((hit: any) => ({
        id: hit._id,
        content: hit._source.content,
        metadata: hit._source.metadata,
        score: hit._score,
        source: hit._source.source,
      }));
    } catch (error) {
      console.error('Error searching by source:', error);
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.indexName,
        id: id,
      });
      console.log(`Deleted document from vector store: ${id}`);
    } catch (error) {
      console.error('Error deleting document from vector store:', error);
      throw error;
    }
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<void> {
    try {
      await this.client.update({
        index: this.indexName,
        id: id,
        body: {
          doc: {
            ...updates,
            lastUpdated: new Date().toISOString(),
          },
        },
      });
      console.log(`Updated document in vector store: ${id}`);
    } catch (error) {
      console.error('Error updating document in vector store:', error);
      throw error;
    }
  }
}



