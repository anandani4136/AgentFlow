import Redis from 'ioredis';

export interface ConversationSession {
  sessionId: string;
  userId: string;
  context: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  currentIntent?: string;
  extractedParameters: Record<string, any>;
  createdAt: number;
  lastActivity: number;
}

export interface CacheConfig {
  host: string;
  port: number;
}

export class RedisService {
  private redis: Redis;
  private readonly SESSION_TTL = 3600; // 1 hour
  private readonly CACHE_TTL = 1800; // 30 minutes

  constructor(config: CacheConfig) {
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis');
    });
  }

  async createSession(session: ConversationSession): Promise<void> {
    const key = `session:${session.sessionId}`;
    await this.redis.setex(key, this.SESSION_TTL, JSON.stringify(session));
    
    // Index session by user
    await this.redis.sadd(`user_sessions:${session.userId}`, session.sessionId);
  }

  async getSession(sessionId: string): Promise<ConversationSession | null> {
    const key = `session:${sessionId}`;
    const data = await this.redis.get(key);
    
    if (!data) return null;
    
    const session = JSON.parse(data) as ConversationSession;
    
    // Update last activity
    session.lastActivity = Date.now();
    await this.redis.setex(key, this.SESSION_TTL, JSON.stringify(session));
    
    return session;
  }

  async updateSession(sessionId: string, updates: Partial<ConversationSession>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    
    const updatedSession = { ...session, ...updates, lastActivity: Date.now() };
    const key = `session:${sessionId}`;
    await this.redis.setex(key, this.SESSION_TTL, JSON.stringify(updatedSession));
  }

  async addMessageToHistory(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    
    session.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
    });
    
    // Keep only last 50 messages to prevent memory issues
    if (session.conversationHistory.length > 50) {
      session.conversationHistory = session.conversationHistory.slice(-50);
    }
    
    await this.updateSession(sessionId, { conversationHistory: session.conversationHistory });
  }

  async getUserSessions(userId: string): Promise<string[]> {
    return await this.redis.smembers(`user_sessions:${userId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;
    
    const key = `session:${sessionId}`;
    await this.redis.del(key);
    await this.redis.srem(`user_sessions:${session.userId}`, sessionId);
  }

  async setCache(key: string, value: any, ttl?: number): Promise<void> {
    const cacheKey = `cache:${key}`;
    const ttlSeconds = ttl || this.CACHE_TTL;
    await this.redis.setex(cacheKey, ttlSeconds, JSON.stringify(value));
  }

  async getCache<T>(key: string): Promise<T | null> {
    const cacheKey = `cache:${key}`;
    const data = await this.redis.get(cacheKey);
    return data ? JSON.parse(data) : null;
  }

  async invalidateCache(pattern: string): Promise<void> {
    const keys = await this.redis.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
