import { intentConfigManager, IntentConfig, SystemConfig, ParameterConfig } from '../config/intent-config';

export class ConfigService {
  private static instance: ConfigService;
  private configManager = intentConfigManager;

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  // Intent Management
  getAllIntents(): IntentConfig[] {
    return this.configManager.getAllIntents();
  }

  getIntentById(id: string): IntentConfig | undefined {
    return this.configManager.getIntentById(id);
  }

  getIntentsByCategory(category: string): IntentConfig[] {
    return this.configManager.getIntentsByCategory(category);
  }

  getActiveIntents(): IntentConfig[] {
    return this.configManager.getAllIntents().filter(intent => intent.isActive);
  }

  // Category Management
  getAllCategories() {
    return this.configManager.getAllCategories();
  }

  getCategoryById(id: string) {
    return this.configManager.getAllCategories().find(cat => cat.id === id);
  }

  // Global Settings
  getGlobalSettings() {
    return this.configManager.getGlobalSettings();
  }

  getConfidenceThreshold(): number {
    return this.configManager.getGlobalSettings().defaultConfidenceThreshold;
  }

  getMaxAlternatives(): number {
    return this.configManager.getGlobalSettings().maxAlternatives;
  }

  // Training Configuration
  getTrainingDefaults() {
    return this.configManager.getTrainingDefaults();
  }

  getBaseModel(): string {
    return this.configManager.getTrainingDefaults().baseModel;
  }

  getLearningRate(): number {
    return this.configManager.getTrainingDefaults().learningRate;
  }

  getNumEpochs(): number {
    return this.configManager.getTrainingDefaults().numEpochs;
  }

  // Intent Matching
  findMatchingIntents(input: string, threshold?: number): Array<{ intent: IntentConfig; confidence: number; matchedPhrases: string[] }> {
    const confidenceThreshold = threshold || this.getConfidenceThreshold();
    const results: Array<{ intent: IntentConfig; confidence: number; matchedPhrases: string[] }> = [];

    this.getAllIntents().forEach(intent => {
      const matchedPhrases = this.findMatchingPhrases(input, intent.keyPhrases);
      if (matchedPhrases.length > 0) {
        const confidence = this.calculateConfidence(input, intent.keyPhrases, matchedPhrases);
        if (confidence >= confidenceThreshold) {
          results.push({ intent, confidence, matchedPhrases });
        }
      }
    });

    // Sort by confidence (highest first) and then by priority
    return results.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) < 0.01) {
        return a.intent.priority - b.intent.priority;
      }
      return b.confidence - a.confidence;
    });
  }

  private findMatchingPhrases(input: string, keyPhrases: string[]): string[] {
    const normalizedInput = input.toLowerCase().trim();
    return keyPhrases.filter(phrase => 
      normalizedInput.includes(phrase.toLowerCase())
    );
  }

  private calculateConfidence(input: string, keyPhrases: string[], matchedPhrases: string[]): number {
    if (matchedPhrases.length === 0) return 0;

    // Calculate confidence based on:
    // 1. Number of matched phrases
    // 2. Length of matched phrases (longer = more specific)
    // 3. Input length vs phrase length ratio
    
    const totalPhrases = keyPhrases.length;
    const matchedCount = matchedPhrases.length;
    
    // Base confidence from match ratio
    let confidence = matchedCount / totalPhrases;
    
    // Boost confidence for longer/more specific phrases
    const avgMatchedLength = matchedPhrases.reduce((sum, phrase) => sum + phrase.length, 0) / matchedPhrases.length;
    const avgTotalLength = keyPhrases.reduce((sum, phrase) => sum + phrase.length, 0) / totalPhrases;
    
    if (avgMatchedLength > avgTotalLength) {
      confidence += 0.1; // Boost for more specific matches
    }
    
    // Boost for exact matches
    const exactMatches = matchedPhrases.filter(phrase => 
      input.toLowerCase().includes(phrase.toLowerCase())
    ).length;
    
    if (exactMatches > 0) {
      confidence += 0.2; // Significant boost for exact matches
    }
    
    return Math.min(confidence, 1.0); // Cap at 1.0
  }

  // Parameter Extraction
  extractParameters(input: string, intent: IntentConfig): Record<string, any> {
    const parameters: Record<string, any> = {};
    
    intent.parameters.forEach(param => {
      const value = this.extractParameterValue(input, param);
      if (value !== null) {
        parameters[param.name] = value;
      }
    });
    
    return parameters;
  }

  private extractParameterValue(input: string, param: ParameterConfig): any {
    const normalizedInput = input.toLowerCase();
    
    switch (param.type) {
      case 'number':
        // Look for numbers in the input
        const numberMatch = input.match(/\d+(?:\.\d+)?/);
        if (numberMatch) {
          const value = parseFloat(numberMatch[0]);
          if (param.validation) {
            if (param.validation.minValue !== undefined && value < param.validation.minValue) return null;
            if (param.validation.maxValue !== undefined && value > param.validation.maxValue) return null;
          }
          return value;
        }
        break;
        
      case 'email':
        const emailMatch = input.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
        if (emailMatch) return emailMatch[0];
        break;
        
      case 'phone':
        const phoneMatch = input.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
        if (phoneMatch) return phoneMatch[0];
        break;
        
      case 'date':
        // Simple date extraction - could be enhanced with more sophisticated parsing
        const dateMatch = input.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);
        if (dateMatch) return dateMatch[0];
        break;
        
      case 'boolean':
        const positiveWords = ['yes', 'true', 'correct', 'right', 'okay', 'ok'];
        const negativeWords = ['no', 'false', 'incorrect', 'wrong', 'not'];
        
        if (positiveWords.some(word => normalizedInput.includes(word))) return true;
        if (negativeWords.some(word => normalizedInput.includes(word))) return false;
        break;
        
      case 'string':
      default:
        // For string parameters, look for examples or patterns
        if (param.examples && param.examples.length > 0) {
          for (const example of param.examples) {
            if (normalizedInput.includes(example.toLowerCase())) {
              return example;
            }
          }
        }
        
        // If no examples match, try to extract based on context
        // This is a simple implementation - could be enhanced with NLP
        if (param.name === 'accountId') {
          const accountMatch = input.match(/\b[A-Z]{3}\d{6}\b/);
          if (accountMatch) return accountMatch[0];
        }
        break;
    }
    
    return null;
  }

  // Configuration Management
  addIntent(intent: IntentConfig): boolean {
    try {
      this.configManager.addIntent(intent);
      return true;
    } catch (error) {
      console.error('Error adding intent:', error);
      return false;
    }
  }

  updateIntent(id: string, updates: Partial<IntentConfig>): boolean {
    try {
      return this.configManager.updateIntent(id, updates);
    } catch (error) {
      console.error('Error updating intent:', error);
      return false;
    }
  }

  removeIntent(id: string): boolean {
    try {
      return this.configManager.removeIntent(id);
    } catch (error) {
      console.error('Error removing intent:', error);
      return false;
    }
  }

  // Configuration Import/Export
  exportConfiguration(): SystemConfig {
    return this.configManager.exportConfig();
  }

  importConfiguration(config: SystemConfig): boolean {
    try {
      this.configManager.importConfig(config);
      return true;
    } catch (error) {
      console.error('Error importing configuration:', error);
      return false;
    }
  }

  // Validation
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    return this.configManager.validateConfig();
  }

  // FAQ Methods
  getFAQIntents(): IntentConfig[] {
    return this.getAllIntents().filter(intent => intent.isFAQ === true);
  }

  findFAQResponse(message: string): { response: string; intent: string; confidence: number } | null {
    const faqIntents = this.getFAQIntents();
    const lowerMessage = message.toLowerCase();
    
    let bestMatch: { response: string; intent: string; confidence: number } | null = null;
    let highestConfidence = 0;

    for (const intent of faqIntents) {
      if (intent.faqResponses) {
        for (const faqResponse of intent.faqResponses) {
          // Check if any trigger phrase matches
          const hasMatch = faqResponse.triggerPhrases.some(phrase => 
            lowerMessage.includes(phrase.toLowerCase())
          );
          
          if (hasMatch) {
            const confidence = this.calculateFAQConfidence(message, faqResponse);
            if (confidence > highestConfidence) {
              highestConfidence = confidence;
              bestMatch = {
                response: faqResponse.response,
                intent: intent.id,
                confidence: confidence
              };
            }
          }
        }
      }
    }

    return bestMatch;
  }

  private calculateFAQConfidence(message: string, faqResponse: any): number {
    const lowerMessage = message.toLowerCase();
    let confidence = 0;
    
    // Count matching trigger phrases
    const matchingPhrases = faqResponse.triggerPhrases.filter((phrase: string) => 
      lowerMessage.includes(phrase.toLowerCase())
    );
    
    if (matchingPhrases.length > 0) {
      confidence += (matchingPhrases.length / faqResponse.triggerPhrases.length) * 0.8;
      
      // Bonus for exact matches
      const exactMatches = matchingPhrases.filter((phrase: string) => 
        lowerMessage.includes(phrase.toLowerCase())
      );
      if (exactMatches.length > 0) {
        confidence += 0.2;
      }
    }
    
    return Math.min(confidence, 1.0);
  }

  // Utility Methods
  getIntentNames(): string[] {
    return this.getAllIntents().map(intent => intent.name);
  }

  getIntentIds(): string[] {
    return this.getAllIntents().map(intent => intent.id);
  }

  getKeyPhrasesForIntent(intentId: string): string[] {
    const intent = this.getIntentById(intentId);
    return intent ? intent.keyPhrases : [];
  }

  getSuggestedActionsForIntent(intentId: string): string[] {
    const intent = this.getIntentById(intentId);
    return intent ? intent.suggestedActions : [];
  }

  getResponseTemplatesForIntent(intentId: string): string[] {
    const intent = this.getIntentById(intentId);
    return intent ? intent.responseTemplates : [];
  }

  // Dynamic Configuration Updates
  updateGlobalSettings(settings: Partial<SystemConfig['globalSettings']>): boolean {
    try {
      const currentSettings = this.configManager.getGlobalSettings();
      const updatedSettings = { ...currentSettings, ...settings };
      
      // Update the configuration
      this.configManager.updateIntent('global_settings', { 
        metadata: { globalSettings: updatedSettings } 
      } as any);
      
      return true;
    } catch (error) {
      console.error('Error updating global settings:', error);
      return false;
    }
  }

  updateTrainingDefaults(defaults: Partial<SystemConfig['trainingDefaults']>): boolean {
    try {
      const currentDefaults = this.configManager.getTrainingDefaults();
      const updatedDefaults = { ...currentDefaults, ...defaults };
      
      // Update the configuration
      this.configManager.updateIntent('training_defaults', { 
        metadata: { trainingDefaults: updatedDefaults } 
      } as any);
      
      return true;
    } catch (error) {
      console.error('Error updating training defaults:', error);
      return false;
    }
  }
}

// Export singleton instance
export const configService = ConfigService.getInstance();
