import { RedisService } from './redis-service';

export interface IntentDefinition {
  name: string;
  keywords: string[];
  patterns: string[];
  confidence: number;
  context: string;
  subIntents?: IntentDefinition[];
  parameters?: string[];
  examples: string[];
}

export interface IntentMatch {
  intent: string;
  confidence: number;
  matchedKeywords: string[];
  extractedParameters: Record<string, any>;
  suggestedActions: string[];
  context: string;
}

export interface IntentCorpus {
  intents: IntentDefinition[];
  globalKeywords: Set<string>;
  idfScores: Record<string, number>;
}

export class IntentDetector {
  private redisService: RedisService;
  private corpus: IntentCorpus;
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(redisService: RedisService) {
    this.redisService = redisService;
    this.corpus = {
      intents: [],
      globalKeywords: new Set(),
      idfScores: {},
    };
  }

  async initialize(): Promise<void> {
    // Load intent definitions from cache or default
    const cachedCorpus = await this.redisService.getCache<IntentCorpus>('intent-corpus');
    if (cachedCorpus) {
      this.corpus = cachedCorpus;
    } else {
      await this.loadDefaultIntents();
      await this.calculateIDFScores();
      await this.redisService.setCache('intent-corpus', this.corpus, this.CACHE_TTL);
    }
  }

  private async loadDefaultIntents(): Promise<void> {
    console.log('Loading default intents...');
    this.corpus.intents = [
      {
        name: 'greeting',
        keywords: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
        patterns: ['hello', 'hi there', 'how are you'],
        confidence: 0.9,
        context: 'general',
        examples: ['Hello!', 'Hi there', 'Good morning'],
        parameters: [],
      },
      {
        name: 'account_inquiry',
        keywords: ['account', 'balance', 'statement', 'transaction', 'deposit', 'withdrawal'],
        patterns: ['check my account', 'what is my balance', 'show transactions'],
        confidence: 0.85,
        context: 'banking',
        examples: ['What is my account balance?', 'Show me my recent transactions'],
        parameters: ['account_number', 'date_range'],
      },
      {
        name: 'technical_support',
        keywords: ['help', 'support', 'issue', 'problem', 'error', 'broken', 'not working'],
        patterns: ['I need help', 'there is a problem', 'something is not working'],
        confidence: 0.8,
        context: 'support',
        examples: ['I need help with my account', 'There is a problem with the app'],
        parameters: ['issue_type', 'device', 'error_message'],
      },
      {
        name: 'product_inquiry',
        keywords: ['product', 'service', 'feature', 'price', 'cost', 'plan', 'package'],
        patterns: ['tell me about', 'what is the price', 'what features'],
        confidence: 0.8,
        context: 'sales',
        examples: ['Tell me about your services', 'What is the price?'],
        parameters: ['product_name', 'service_type'],
      },
      {
        name: 'complaint',
        keywords: ['complaint', 'unhappy', 'dissatisfied', 'wrong', 'mistake', 'angry'],
        patterns: ['I want to complain', 'I am not happy', 'this is wrong'],
        confidence: 0.9,
        context: 'support',
        examples: ['I want to file a complaint', 'I am not happy with the service'],
        parameters: ['complaint_type', 'incident_date', 'reference_number'],
      },
      {
        name: 'appointment',
        keywords: ['appointment', 'schedule', 'booking', 'meeting', 'reservation', 'time'],
        patterns: ['I want to schedule', 'book an appointment', 'make a reservation'],
        confidence: 0.85,
        context: 'scheduling',
        examples: ['I want to schedule an appointment', 'Book me for next week'],
        parameters: ['date', 'time', 'service_type', 'duration'],
      },
      {
        name: 'general_inquiry',
        keywords: ['what', 'how', 'when', 'where', 'why', 'information', 'question'],
        patterns: ['what is', 'how do I', 'when can I'],
        confidence: 0.7,
        context: 'general',
        examples: ['What is this?', 'How do I use this?'],
        parameters: [],
      },
    ];

    // Build global keyword set
    this.corpus.globalKeywords = new Set();
    this.corpus.intents.forEach(intent => {
      intent.keywords.forEach(keyword => {
        this.corpus.globalKeywords.add(keyword.toLowerCase());
      });
    });
    
    console.log('Loaded intents:', this.corpus.intents.map(i => ({ name: i.name, keywords: i.keywords })));
    console.log('Global keywords:', Array.from(this.corpus.globalKeywords));
  }

  private async calculateIDFScores(): Promise<void> {
    const totalIntents = this.corpus.intents.length;
    const wordFrequency: Record<string, number> = {};

    // Count how many intents contain each word
    this.corpus.intents.forEach(intent => {
      const intentWords = new Set<string>();
      intent.keywords.forEach(keyword => {
        const words = keyword.toLowerCase().split(/\s+/);
        words.forEach(word => intentWords.add(word));
      });
      
      intentWords.forEach(word => {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      });
    });

    // Calculate IDF scores
    Object.keys(wordFrequency).forEach(word => {
      this.corpus.idfScores[word] = Math.log(totalIntents / wordFrequency[word]);
    });
  }

  async detectIntent(message: string, context?: string): Promise<IntentMatch> {
    const normalizedMessage = message.toLowerCase();
    const words = this.tokenize(normalizedMessage);
    
    console.log('Tokenized words:', words);
    console.log('Available intents:', this.corpus.intents.map(i => i.name));
    
    let bestMatch: IntentMatch | null = null;
    let highestScore = 0;

    for (const intent of this.corpus.intents) {
      // Skip if context doesn't match (if context is specified)
      // Allow intents that match the specified context OR are general
      if (context && context !== 'general' && intent.context !== context && intent.context !== 'general') {
        console.log(`Skipping intent ${intent.name} due to context mismatch`);
        continue;
      }

      const score = this.calculateBM25Score(words, intent);
      console.log(`Intent ${intent.name} score: ${score}`);
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = {
          intent: intent.name,
          confidence: Math.min(score / 5, 0.95), // Normalize confidence (less aggressive)
          matchedKeywords: this.findMatchedKeywords(words, intent),
          extractedParameters: this.extractParameters(normalizedMessage, intent),
          suggestedActions: this.getSuggestedActions(intent),
          context: intent.context,
        };
      }
    }

    // Fallback to general inquiry if no good match
    if (!bestMatch || bestMatch.confidence < 0.3) {
      bestMatch = {
        intent: 'general_inquiry',
        confidence: 0.5,
        matchedKeywords: [],
        extractedParameters: {},
        suggestedActions: ['ask_for_clarification', 'provide_general_info'],
        context: 'general',
      };
    }

    return bestMatch;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  private calculateBM25Score(words: string[], intent: IntentDefinition): number {
    const k1 = 1.2; // BM25 parameter
    const b = 0.75; // BM25 parameter
    const avgDocLength = 10; // Average document length
    
    let score = 0;
    const docLength = intent.keywords.length;

    console.log(`Calculating BM25 score for intent: ${intent.name}`);
    console.log(`Intent keywords: ${intent.keywords.join(', ')}`);
    console.log(`Input words: ${words.join(', ')}`);

    words.forEach(word => {
      const tf = this.calculateTermFrequency(word, intent);
      const idf = this.corpus.idfScores[word] || 0;
      
      console.log(`Word: ${word}, TF: ${tf}, IDF: ${idf}`);
      
      if (tf > 0) {
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
        const wordScore = (idf * numerator) / denominator;
        score += wordScore;
        console.log(`Word score: ${wordScore}, Total score: ${score}`);
      }
    });

    console.log(`Final BM25 score for ${intent.name}: ${score}`);
    return score;
  }

  private calculateTermFrequency(term: string, intent: IntentDefinition): number {
    let frequency = 0;
    
    intent.keywords.forEach(keyword => {
      const words = keyword.toLowerCase().split(/\s+/);
      words.forEach(word => {
        // Exact match or if the term is contained in the keyword word
        if (word === term || word.includes(term) || term.includes(word)) {
          frequency++;
        }
      });
    });

    return frequency;
  }

  private findMatchedKeywords(words: string[], intent: IntentDefinition): string[] {
    const matched: string[] = [];
    
    intent.keywords.forEach(keyword => {
      const keywordWords = keyword.toLowerCase().split(/\s+/);
      const isMatch = keywordWords.some(kw => 
        words.some(word => word.includes(kw) || kw.includes(word))
      );
      
      if (isMatch) {
        matched.push(keyword);
      }
    });

    return matched;
  }

  private extractParameters(message: string, intent: IntentDefinition): Record<string, any> {
    const parameters: Record<string, any> = {};
    
    if (!intent.parameters) return parameters;

    // Simple parameter extraction based on patterns
    intent.parameters.forEach(param => {
      switch (param) {
        case 'account_number':
          const accountMatch = message.match(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/);
          if (accountMatch) parameters[param] = accountMatch[0];
          break;
        case 'date':
          const dateMatch = message.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
          if (dateMatch) parameters[param] = dateMatch[0];
          break;
        case 'time':
          const timeMatch = message.match(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/i);
          if (timeMatch) parameters[param] = timeMatch[0];
          break;
        case 'email':
          const emailMatch = message.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
          if (emailMatch) parameters[param] = emailMatch[0];
          break;
        case 'phone':
          const phoneMatch = message.match(/\b\d{3}[\s\-]?\d{3}[\s\-]?\d{4}\b/);
          if (phoneMatch) parameters[param] = phoneMatch[0];
          break;
      }
    });

    return parameters;
  }

  private getSuggestedActions(intent: IntentDefinition): string[] {
    const actionMap: Record<string, string[]> = {
      greeting: ['provide_welcome_message', 'ask_how_can_help'],
      account_inquiry: ['fetch_account_info', 'ask_for_account_number'],
      technical_support: ['create_support_ticket', 'escalate_to_human'],
      product_inquiry: ['provide_product_info', 'connect_to_sales'],
      complaint: ['apologize', 'escalate_to_supervisor'],
      appointment: ['check_availability', 'confirm_details'],
      general_inquiry: ['ask_for_clarification', 'provide_general_info'],
    };

    return actionMap[intent.name] || ['ask_for_clarification'];
  }

  async updateIntents(intents: IntentDefinition[]): Promise<void> {
    this.corpus.intents = intents;
    await this.calculateIDFScores();
    await this.redisService.setCache('intent-corpus', this.corpus, this.CACHE_TTL);
  }

  async getIntentDefinitions(): Promise<IntentDefinition[]> {
    return this.corpus.intents;
  }
}
