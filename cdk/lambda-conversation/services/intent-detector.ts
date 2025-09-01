import { RedisService } from './redis-service';
import { configService } from './config-service';
import { IntentConfig, ParameterConfig } from '../config/intent-config';

export interface IntentDefinition {
  name: string;
  keywords: string[];
  patterns: string[];
  confidence: number;
  context: string;
  examples: string[];
  parameters: string[];
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
    console.log('Loading intents from configuration service...');
    await this.loadIntentsFromConfig();
    await this.calculateIDFScores();
    await this.redisService.setCache('intent-corpus-v2', this.corpus, this.CACHE_TTL);
    console.log('Loaded and cached', this.corpus.intents.length, 'intents from configuration');
    
    // Debug: Log all loaded intents
    console.log('Available intents:', this.corpus.intents.map(i => i.name).join(', '));
  }

  private async loadIntentsFromConfig(): Promise<void> {
    console.log('Loading intents from configuration service...');
    
    try {
      // Get all intents from the configuration service
      const configIntents = configService.getAllIntents();
      
      // Convert configuration intents to IntentDefinition format
      this.corpus.intents = configIntents.map(configIntent => ({
        name: configIntent.id,
        keywords: configIntent.keyPhrases,
        patterns: configIntent.keyPhrases, // Use key phrases as patterns for now
        confidence: configIntent.priority / 10, // Convert priority (1-10) to confidence (0.1-1.0)
        context: configIntent.category,
        examples: configIntent.responseTemplates,
        parameters: configIntent.parameters.map(param => param.name),
      }));

      // Build global keyword set
      this.corpus.globalKeywords = new Set();
      this.corpus.intents.forEach(intent => {
        intent.keywords.forEach(keyword => {
          this.corpus.globalKeywords.add(keyword.toLowerCase());
        });
      });
      
      console.log('Loaded intents from config:', this.corpus.intents.map(i => ({ name: i.name, keywords: i.keywords })));
      console.log('Global keywords:', Array.from(this.corpus.globalKeywords));
    } catch (error) {
      console.error('Error loading intents from configuration:', error);
      // Fallback to empty intents if configuration fails
      this.corpus.intents = [];
      this.corpus.globalKeywords = new Set();
    }
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

    // Check for exact keyword matches first (highest priority)
    const exactMatches = this.findExactKeywordMatches(words, intent);
    if (exactMatches.length > 0) {
      score += exactMatches.length * 10; // High bonus for exact matches
      console.log(`Exact keyword matches: ${exactMatches.join(', ')}, Bonus score: ${exactMatches.length * 10}`);
    }

    // Check for pattern matches (medium priority)
    const patternMatches = this.findPatternMatches(words, intent);
    if (patternMatches.length > 0) {
      score += patternMatches.length * 5; // Medium bonus for pattern matches
      console.log(`Pattern matches: ${patternMatches.join(', ')}, Bonus score: ${patternMatches.length * 5}`);
    }

    // Standard BM25 scoring for word-level matches
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

    // Add intent confidence bonus
    score += intent.confidence * 2;
    console.log(`Intent confidence bonus: ${intent.confidence * 2}`);

    console.log(`Final BM25 score for ${intent.name}: ${score}`);
    return score;
  }

  private findExactKeywordMatches(words: string[], intent: IntentDefinition): string[] {
    const matches: string[] = [];
    const messageText = words.join(' ').toLowerCase();
    
    intent.keywords.forEach(keyword => {
      if (messageText.includes(keyword.toLowerCase())) {
        matches.push(keyword);
      }
    });
    
    return matches;
  }

  private findPatternMatches(words: string[], intent: IntentDefinition): string[] {
    const matches: string[] = [];
    const messageText = words.join(' ').toLowerCase();
    
    intent.patterns.forEach(pattern => {
      if (messageText.includes(pattern.toLowerCase())) {
        matches.push(pattern);
      }
    });
    
    return matches;
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

  private extractParameters(message: string, intent: IntentDefinition): Record<string, any> {
    const extractedParams: Record<string, any> = {};
    
    // Simple parameter extraction based on patterns
    if (intent.parameters) {
      intent.parameters.forEach(param => {
        switch (param) {
          case 'account_number':
            const accountMatch = message.match(/\b\d{8,12}\b/);
            if (accountMatch) {
              extractedParams[param] = accountMatch[0];
              console.log(`Extracted account_number: ${accountMatch[0]}`);
            }
            break;
          case 'amount':
            const amountMatch = message.match(/\$?\d+(?:,\d{3})*(?:\.\d{2})?/);
            if (amountMatch) {
              extractedParams[param] = amountMatch[0].replace(/[$,]/g, '');
              console.log(`Extracted amount: ${amountMatch[0]}`);
            }
            break;
          case 'date':
            const dateMatch = message.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/);
            if (dateMatch) {
              extractedParams[param] = dateMatch[0];
              console.log(`Extracted date: ${dateMatch[0]}`);
            }
            break;
          case 'time':
            const timeMatch = message.match(/\b\d{1,2}:\d{2}\s*(am|pm)?\b/i);
            if (timeMatch) {
              extractedParams[param] = timeMatch[0];
              console.log(`Extracted time: ${timeMatch[0]}`);
            }
            break;
        }
      });
    }
    
    return extractedParams;
  }

  private findMatchedKeywords(words: string[], intent: IntentDefinition): string[] {
    const matched: string[] = [];
    
    intent.keywords.forEach(keyword => {
      const keywordWords = keyword.toLowerCase().split(/\s+/);
      const isMatch = keywordWords.some(kw => 
        words.some(word => {
          // More precise matching to avoid false positives
          if (word === kw) return true; // Exact match
          if (kw.length > 3 && word.length > 3) {
            // Only allow partial matching for longer words to avoid "how" matching "how much"
            return word.includes(kw) || kw.includes(word);
          }
          return false; // No partial matching for short words
        })
      );
      
      if (isMatch) {
        matched.push(keyword);
      }
    });

    return matched;
  }

  private getSuggestedActions(intent: IntentDefinition): string[] {
    try {
      // Get suggested actions from the configuration service
      const configIntent = configService.getIntentById(intent.name);
      if (configIntent) {
        return configIntent.suggestedActions;
      }
    } catch (error) {
      console.error('Error getting suggested actions from config:', error);
    }
    
    // Fallback to default actions if configuration fails
    return ['ask_for_clarification'];
  }

  async updateIntents(intents: IntentDefinition[]): Promise<void> {
    this.corpus.intents = intents;
    await this.calculateIDFScores();
    await this.redisService.setCache('intent-corpus', this.corpus, this.CACHE_TTL);
  }

  async refreshFromConfig(): Promise<void> {
    console.log('Refreshing intents from configuration...');
    await this.loadIntentsFromConfig();
    await this.calculateIDFScores();
    await this.redisService.setCache('intent-corpus-v2', this.corpus, this.CACHE_TTL);
    console.log('Refreshed intents from configuration');
  }

  async getIntentDefinitions(): Promise<IntentDefinition[]> {
    return this.corpus.intents;
  }
}
