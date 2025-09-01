import { IntentDetector } from './intent-detector';
import { ContextManager } from './context-manager';
import { RedisService } from './redis-service';
import { HuggingFaceFineTuner, FineTuningConfig, TrainingData } from './huggingface-finetuner';
import { ModelIntegrationService } from './model-integration-service';

// Simplified LangChain-like implementation without external dependencies
export interface ChainResult {
  intent: string;
  confidence: number;
  response: string;
  context: string;
  extractedParameters: Record<string, any>;
  suggestedActions: string[];
  chainType: 'intent_detection' | 'retrieval' | 'api_call' | 'conversation';
}

export interface IntentDetectionChainResult {
  intent: string;
  confidence: number;
  matchedKeywords: string[];
  context: string;
  extractedParameters: Record<string, any>;
}

export interface RetrievalChainResult {
  answer: string;
  sources: Array<{
    content: string;
    source: string;
    score: number;
  }>;
  confidence: number;
}

export interface APICallChainResult {
  success: boolean;
  data: any;
  error?: string;
  action: string;
}

export class LangChainOrchestrator {
  private intentDetector: IntentDetector;
  private contextManager: ContextManager;
  private redisService: RedisService;
  private huggingFaceFineTuner: HuggingFaceFineTuner;
  private modelIntegrationService: ModelIntegrationService;
  private conversationMemory: Map<string, Array<{ role: string; content: string }>>;

  constructor(
    intentDetector: IntentDetector,
    contextManager: ContextManager,
    redisService: RedisService
  ) {
    this.intentDetector = intentDetector;
    this.contextManager = contextManager;
    this.redisService = redisService;
    this.huggingFaceFineTuner = new HuggingFaceFineTuner(redisService);
    this.modelIntegrationService = new ModelIntegrationService();
    this.conversationMemory = new Map();
  }

  /**
   * Main orchestration method that routes requests through appropriate chains
   */
  async processMessage(
    message: string,
    sessionId: string,
    userId: string
  ): Promise<ChainResult> {
    try {
      // Step 1: Intent Detection Chain
      const intentResult = await this.runIntentDetectionChain(message, sessionId);
      
      // Step 2: Context Management
      const contextState = await this.contextManager.getContextState(sessionId);
      
      // Step 3: Route to appropriate chain based on intent and context
      let chainResult: ChainResult;
      
      if (intentResult.intent === 'faq_question' || this.isFAQQuestion(message)) {
        // Use Retrieval Chain for FAQ questions
        const retrievalResult = await this.runRetrievalChain(message, sessionId);
        chainResult = {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          response: retrievalResult.answer,
          context: contextState.currentContext,
          extractedParameters: intentResult.extractedParameters,
          suggestedActions: ['provide_information', 'ask_follow_up'],
          chainType: 'retrieval',
        };
      } else if (intentResult.intent === 'api_call' || this.requiresAPICall(intentResult.intent)) {
        // Use API Call Chain for actions requiring external APIs
        const apiResult = await this.runAPICallChain(message, intentResult, sessionId);
        chainResult = {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          response: apiResult.success ? 'Action completed successfully' : apiResult.error || 'Action failed',
          context: contextState.currentContext,
          extractedParameters: intentResult.extractedParameters,
          suggestedActions: apiResult.success ? ['continue_conversation'] : ['retry_action', 'escalate'],
          chainType: 'api_call',
        };
      } else {
        // Use Conversation Chain for general conversation
        const conversationResult = await this.runConversationChain(message, sessionId, intentResult);
        chainResult = {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          response: conversationResult.response,
          context: contextState.currentContext,
          extractedParameters: intentResult.extractedParameters,
          suggestedActions: conversationResult.suggestedActions,
          chainType: 'conversation',
        };
      }

      // Step 4: Update memory and context
      await this.updateMemory(sessionId, message, chainResult.response);
      
      return chainResult;
    } catch (error) {
      console.error('Error in LangChain orchestration:', error);
      throw error;
    }
  }

  /**
   * Intent Detection Chain using enhanced logic and fine-tuned models
   */
  private async runIntentDetectionChain(
    message: string,
    sessionId: string
  ): Promise<IntentDetectionChainResult> {
    try {
      // Get available fine-tuned models
      const availableModels = await this.huggingFaceFineTuner.getFineTunedModels();
      
      // Use fine-tuned models for intent detection if available
      if (availableModels.length > 0) {
        console.log(`🤖 Using fine-tuned models for intent detection. Available: ${availableModels.length} models`);
        
        const enhancedResult = await this.modelIntegrationService.detectIntentWithFineTunedModel(
          message,
          availableModels
        );
        
        return {
          intent: enhancedResult.intent,
          confidence: enhancedResult.confidence,
          matchedKeywords: [], // Will be populated by the model
          context: 'general',
          extractedParameters: enhancedResult.extractedParameters,
        };
      } else {
        console.log('🔄 No fine-tuned models available, using fallback intent detection');
        
        // Use existing intent detector as base
        const intentMatch = await this.intentDetector.detectIntent(message, 'general');
        
        // Enhanced intent detection with LangChain-like logic
        const enhancedIntent = await this.enhanceIntentDetection(message, intentMatch);
        
        return {
          intent: enhancedIntent.intent,
          confidence: enhancedIntent.confidence,
          matchedKeywords: enhancedIntent.matchedKeywords,
          context: enhancedIntent.context,
          extractedParameters: enhancedIntent.extractedParameters,
        };
      }
    } catch (error) {
      console.error('Error in enhanced intent detection chain:', error);
      
      // Fallback to basic intent detection
      const intentMatch = await this.intentDetector.detectIntent(message, 'general');
      return {
        intent: intentMatch.intent,
        confidence: intentMatch.confidence,
        matchedKeywords: intentMatch.matchedKeywords || [],
        context: 'general',
        extractedParameters: intentMatch.extractedParameters || {},
      };
    }
  }

  /**
   * Retrieval Chain for FAQ questions
   */
  private async runRetrievalChain(
    message: string,
    sessionId: string
  ): Promise<RetrievalChainResult> {
    // Enhanced FAQ response using conversation context
    const conversationHistory = await this.getConversationHistory(sessionId);
    const contextualAnswer = await this.generateContextualAnswer(message, conversationHistory);
    
    return {
      answer: contextualAnswer,
      sources: [], // TODO: Integrate with vector store
      confidence: 0.8,
    };
  }

  /**
   * API Call Chain for external actions
   */
  private async runAPICallChain(
    message: string,
    intentResult: IntentDetectionChainResult,
    sessionId: string
  ): Promise<APICallChainResult> {
    // Enhanced API call logic based on intent and context
    const apiAction = await this.determineAPIAction(intentResult.intent, message, intentResult.extractedParameters);
    
    return {
      success: apiAction.success,
      data: apiAction.data,
      error: apiAction.error,
      action: apiAction.action,
    };
  }

  /**
   * Conversation Chain for general conversation using fine-tuned models
   */
  private async runConversationChain(
    message: string,
    sessionId: string,
    intentResult: IntentDetectionChainResult
  ): Promise<{ response: string; suggestedActions: string[] }> {
    try {
      // Get available fine-tuned models
      const availableModels = await this.huggingFaceFineTuner.getFineTunedModels();
      
      // Use fine-tuned models for response generation if available
      if (availableModels.length > 0) {
        console.log(`🤖 Using fine-tuned models for response generation`);
        
        const response = await this.modelIntegrationService.generateResponseWithFineTunedModel(
          intentResult.intent,
          message,
          'general',
          availableModels
        );
        
        // Generate suggested actions
        const suggestedActions = this.generateSuggestedActions(intentResult.intent, intentResult.confidence);
        
        return { response, suggestedActions };
      } else {
        console.log('🔄 No fine-tuned models available, using fallback response generation');
        
        // Enhanced conversation response using context and memory
        const conversationHistory = await this.getConversationHistory(sessionId);
        const contextualResponse = await this.generateContextualResponse(message, intentResult, conversationHistory);
        
        return {
          response: contextualResponse,
          suggestedActions: ['continue_conversation', 'ask_for_more_info'],
        };
      }
    } catch (error) {
      console.error('Error in enhanced conversation chain:', error);
      
      // Fallback to basic response generation
      const conversationHistory = await this.getConversationHistory(sessionId);
      const contextualResponse = await this.generateContextualResponse(message, intentResult, conversationHistory);
      
      return {
        response: contextualResponse,
        suggestedActions: ['continue_conversation', 'ask_for_more_info'],
      };
    }
  }

  /**
   * Update conversation memory
   */
  private async updateMemory(
    sessionId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    if (!this.conversationMemory.has(sessionId)) {
      this.conversationMemory.set(sessionId, []);
    }
    
    const history = this.conversationMemory.get(sessionId)!;
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: assistantResponse });
    
    // Keep only last 10 messages to prevent memory bloat
    if (history.length > 10) {
      this.conversationMemory.set(sessionId, history.slice(-10));
    }
  }

  /**
   * Check if message is an FAQ question
   */
  private isFAQQuestion(message: string): boolean {
    const faqKeywords = ['what', 'how', 'when', 'where', 'why', 'explain', 'tell me'];
    const lowerMessage = message.toLowerCase();
    return faqKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Check if intent requires API call
   */
  private requiresAPICall(intent: string): boolean {
    const apiIntents = ['check_balance', 'transfer_funds', 'get_account_info', 'create_support_ticket'];
    return apiIntents.includes(intent);
  }

  /**
   * Fallback to existing intent detector
   */
  private async fallbackIntentDetection(message: string): Promise<IntentDetectionChainResult> {
    const intentMatch = await this.intentDetector.detectIntent(message, 'general');
    return {
      intent: intentMatch.intent,
      confidence: intentMatch.confidence,
      matchedKeywords: intentMatch.matchedKeywords,
      context: intentMatch.context,
      extractedParameters: intentMatch.extractedParameters,
    };
  }

  /**
   * Get conversation history from memory
   */
  async getConversationHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    return this.conversationMemory.get(sessionId) || [];
  }

  /**
   * Clear conversation memory
   */
  async clearMemory(): Promise<void> {
    this.conversationMemory.clear();
  }

  // HuggingFace Fine-tuning Methods
  /**
   * Initialize HuggingFace fine-tuning environment
   */
  async initializeFineTuning(): Promise<void> {
    await this.huggingFaceFineTuner.initialize();
  }

  /**
   * Start fine-tuning a model
   */
  async startModelFineTuning(
    config: FineTuningConfig,
    trainingData: TrainingData[]
  ): Promise<string> {
    return await this.huggingFaceFineTuner.startFineTuning(config, trainingData);
  }

  /**
   * Get fine-tuning job status
   */
  async getFineTuningStatus(jobId: string): Promise<any> {
    return await this.huggingFaceFineTuner.getTrainingJobStatus(jobId);
  }

  /**
   * Get all fine-tuned models
   */
  async getFineTunedModels(): Promise<any[]> {
    return await this.huggingFaceFineTuner.getFineTunedModels();
  }

  /**
   * Generate training data from conversations
   */
  async generateTrainingData(sessionIds: string[]): Promise<TrainingData[]> {
    return await this.huggingFaceFineTuner.generateTrainingDataFromConversations(sessionIds);
  }

  /**
   * Get recommended fine-tuning configuration
   */
  getRecommendedFineTuningConfig(): FineTuningConfig {
    return this.huggingFaceFineTuner.getRecommendedConfig();
  }

  /**
   * Test model accuracy
   */
  async testModelAccuracy(modelId: string, testData: any[]): Promise<any> {
    return await this.huggingFaceFineTuner.testModelAccuracy(modelId, testData);
  }

  /**
   * Use model for inference
   */
  async useModelForInference(modelId: string, input: string): Promise<any> {
    return await this.huggingFaceFineTuner.useModelForInference(modelId, input);
  }

  /**
   * Compare multiple models
   */
  async compareModels(modelIds: string[], testData: any[]): Promise<any> {
    return await this.huggingFaceFineTuner.compareModels(modelIds, testData);
  }

  /**
   * Get model performance summary
   */
  async getModelPerformanceSummary(): Promise<any> {
    const availableModels = await this.huggingFaceFineTuner.getFineTunedModels();
    return await this.modelIntegrationService.getModelPerformanceSummary(availableModels);
  }

  /**
   * Generate suggested actions based on intent and confidence
   */
  private generateSuggestedActions(intent: string, confidence: number): string[] {
    const actions: string[] = [];
    
    if (confidence < 0.7) {
      actions.push('ask_for_clarification');
      actions.push('provide_general_help');
    } else {
      // Get suggested actions from configuration service
      try {
        const { configService } = require('./config-service');
        const configIntent = configService.getIntentById(intent);
        
        if (configIntent && configIntent.suggestedActions.length > 0) {
          // Use configured suggested actions
          actions.push(...configIntent.suggestedActions);
          console.log(`Using configured actions for intent ${intent}:`, configIntent.suggestedActions);
        } else {
          // Fallback to default actions if no configuration found
          console.log(`No configuration found for intent ${intent}, using fallback actions`);
          actions.push('provide_general_help');
          actions.push('escalate_to_agent');
        }
      } catch (error) {
        console.error('Error getting suggested actions from configuration:', error);
        // Fallback to default actions if configuration fails
        actions.push('provide_general_help');
        actions.push('escalate_to_agent');
      }
    }
    
    return actions;
  }

  // Helper methods for enhanced functionality
  private async enhanceIntentDetection(message: string, intentMatch: any): Promise<any> {
    // Enhanced intent detection logic
    const lowerMessage = message.toLowerCase();
    
    // Check for FAQ patterns
    if (this.isFAQQuestion(message)) {
      return {
        ...intentMatch,
        intent: 'faq_question',
        confidence: Math.max(intentMatch.confidence, 0.7),
      };
    }
    
    // Check for API call patterns
    if (this.requiresAPICall(intentMatch.intent)) {
      return {
        ...intentMatch,
        intent: 'api_call',
        confidence: Math.max(intentMatch.confidence, 0.8),
      };
    }
    
    return intentMatch;
  }

  private async generateContextualAnswer(message: string, conversationHistory: Array<{ role: string; content: string }>): Promise<string> {
    // Generate contextual answer based on conversation history
    const recentContext = conversationHistory.slice(-4).map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
    // Use configuration service for contextual responses
    try {
      const { configService } = require('./config-service');
      const faqResponse = configService.findFAQResponse(message);
      
      if (faqResponse && faqResponse.confidence > 0.6) {
        return faqResponse.response;
      }
    } catch (error) {
      console.error('Error getting contextual response from configuration:', error);
    }
    
    // Fallback to generic response if no configuration match
    return 'I understand your question. Let me help you with that. Could you provide more details?';
  }

  private async generateContextualResponse(
    message: string, 
    intentResult: IntentDetectionChainResult, 
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<string> {
    // Generate contextual response based on intent and conversation history
    const recentMessages = conversationHistory.slice(-4);
    
    // Use configuration service for contextual responses
    try {
      const { configService } = require('./config-service');
      const configIntent = configService.getIntentById(intentResult.intent);
      
      if (configIntent && configIntent.responseTemplates.length > 0) {
        // Use configured response template
        const template = configIntent.responseTemplates[0];
        return template;
      }
    } catch (error) {
      console.error('Error getting contextual response from configuration:', error);
    }
    
    // Fallback to generic response if no configuration match
    return 'I understand. How can I assist you further?';
  }

  private async determineAPIAction(intent: string, message: string, parameters: Record<string, any>): Promise<APICallChainResult> {
    // Determine appropriate API action based on intent and parameters using configuration
    try {
      const { configService } = require('./config-service');
      const configIntent = configService.getIntentById(intent);
      
      if (configIntent) {
        // Check if we have required parameters based on configuration
        const hasRequiredParams = configIntent.parameters
          .filter((param: any) => param.required)
          .every((param: any) => parameters[param.name]);
        
        if (hasRequiredParams) {
          // Generate appropriate response based on intent type
          switch (intent) {
            case 'check_balance':
              return {
                success: true,
                data: { balance: 2847.63, currency: 'USD' },
                action: 'check_balance',
              };
            case 'transfer_funds':
              return {
                success: parameters.amount && parameters.recipient_account,
                data: { transaction_id: 'TXN123456' },
                error: !parameters.amount || !parameters.recipient_account ? 'Missing required parameters' : undefined,
                action: 'transfer_funds',
              };
            default:
              return {
                success: true,
                data: { message: 'Action completed successfully' },
                action: intent,
              };
          }
        } else {
          // Missing required parameters
          const missingParams = configIntent.parameters
            .filter((param: any) => param.required && !parameters[param.name])
            .map((param: any) => param.name);
          
          return {
            success: false,
            data: {},
            error: `Missing required parameters: ${missingParams.join(', ')}`,
            action: intent,
          };
        }
      }
    } catch (error) {
      console.error('Error getting API action configuration:', error);
    }
    
    // Fallback for unknown intents
    return {
      success: false,
      data: {},
      error: 'Unknown action',
      action: 'unknown',
    };
  }
}
