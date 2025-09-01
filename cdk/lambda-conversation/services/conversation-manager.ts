import { RedisService, ConversationSession } from './redis-service';
import { IntentDetector, IntentMatch } from './intent-detector';
import { ContextManager } from './context-manager';
import { LangChainOrchestrator } from './langchain-orchestrator';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationRequest {
  userId: string;
  message: string;
  sessionId?: string;
  context?: string;
}

export interface ConversationResponse {
  sessionId: string;
  response: string;
  intent?: string;
  confidence?: number;
  extractedParameters?: Record<string, any>;
  suggestedActions?: string[];
}

export class ConversationManager {
  private redisService: RedisService;
  private intentDetector: IntentDetector;
  private contextManager: ContextManager;
  private langChainOrchestrator: LangChainOrchestrator;

  constructor(redisService: RedisService) {
    this.redisService = redisService;
    this.intentDetector = new IntentDetector(redisService);
    this.contextManager = new ContextManager(redisService);
    this.langChainOrchestrator = new LangChainOrchestrator(
      this.intentDetector,
      this.contextManager,
      this.redisService
    );
  }

  async processMessage(request: ConversationRequest): Promise<ConversationResponse> {
    let session: ConversationSession;

    // Initialize intent detector and context manager
    try {
      console.log('Initializing intent detector...');
      await this.intentDetector.initialize();
      console.log('Intent detector initialized successfully');
      
      console.log('Context manager ready');
    } catch (error) {
      console.error('Error initializing services:', error);
    }

    // Get or create session
    if (request.sessionId) {
      const existingSession = await this.redisService.getSession(request.sessionId);
      if (!existingSession) {
        throw new Error('Session not found');
      }
      session = existingSession;
    } else {
      session = await this.createNewSession(request.userId, request.context);
    }

    // Add user message to history
    await this.redisService.addMessageToHistory(session.sessionId, 'user', request.message);

    // Always detect intent first
    console.log('Detecting intent for message:', request.message);
    let intentMatch;
    try {
      intentMatch = await this.intentDetector.detectIntent(request.message, session.context);
      console.log('Intent detected:', intentMatch);
    } catch (error) {
      console.error('Error detecting intent:', error);
      // Fallback intent
      intentMatch = {
        intent: 'general_inquiry',
        confidence: 0.5,
        matchedKeywords: [],
        extractedParameters: {},
        suggestedActions: ['ask_for_clarification', 'provide_general_info'],
        context: 'general',
      };
    }
    
    // RAG processing bypassed for now - focusing on core conversation flow
    console.log('RAG bypassed - using core conversation flow');
    
    // Check if we should switch context
    console.log('Checking context switch...');
    const contextSwitch = await this.contextManager.shouldSwitchContext(intentMatch, session.sessionId);
    console.log('Context switch decision:', contextSwitch);
    
    if (contextSwitch.shouldSwitch && contextSwitch.targetContext) {
      await this.contextManager.switchContext(
        session.sessionId, 
        contextSwitch.targetContext, 
        `Intent: ${intentMatch.intent}`,
        intentMatch.extractedParameters
      );
    }

    // Generate response using enhanced multi-turn context management
    console.log('Generating response for intent:', intentMatch.intent, 'with confidence:', intentMatch.confidence);
    const contextResponse = await this.contextManager.processMultiTurnConversation(
      session.sessionId,
      request.message,
      intentMatch
    );
    
    const response = contextResponse.response;

    // Add assistant response to history
    await this.redisService.addMessageToHistory(session.sessionId, 'assistant', response);

    // Update session with new intent and parameters
    await this.redisService.updateSession(session.sessionId, {
      currentIntent: intentMatch.intent,
      extractedParameters: { ...session.extractedParameters, ...intentMatch.extractedParameters },
    });

    return {
      sessionId: session.sessionId,
      response,
      intent: intentMatch.intent,
      confidence: intentMatch.confidence,
      extractedParameters: intentMatch.extractedParameters,
      suggestedActions: intentMatch.suggestedActions,
    };
  }

  private async createNewSession(userId: string, context?: string): Promise<ConversationSession> {
    const session: ConversationSession = {
      sessionId: uuidv4(),
      userId,
      context: context || 'general',
      conversationHistory: [],
      extractedParameters: {},
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    await this.redisService.createSession(session);
    return session;
  }

  private async generateResponse(message: string, session: ConversationSession, intentMatch: IntentMatch): Promise<string> {
    // Get current context state
    const contextState = await this.contextManager.getContextState(session.sessionId);
    
    // RAG processing bypassed for now - using enhanced keyword matching instead
    console.log('RAG bypassed - using enhanced keyword matching for FAQ questions');
    
    // Enhanced keyword matching for common FAQ patterns
    const keywordResponse = this.getKeywordResponse(message);
    if (keywordResponse) {
      console.log('Using keyword-based response for FAQ question');
      return keywordResponse;
    }
    
    // Validate parameters for the current context
    const parameterValidation = await this.contextManager.validateContextParameters(
      contextState.currentContext, 
      intentMatch.extractedParameters
    );
    
    // Check parameter validation
    if (!parameterValidation.isValid && parameterValidation.missingParameters.length > 0) {
      return `I can help you with that. To proceed, I need: ${parameterValidation.missingParameters.join(', ')}.`;
    }
    
    // Fallback to context-specific response
    const contextResponse = await this.contextManager.getContextResponse(intentMatch.intent, contextState.currentContext);
    
    // If context switched, add context transition message
    if (contextState.previousContext && contextState.previousContext !== contextState.currentContext) {
      return `I've switched to ${contextState.currentContext} mode. ${contextResponse}`;
    }
    
    return contextResponse;
  }

  async getSessionHistory(sessionId: string): Promise<ConversationSession | null> {
    return await this.redisService.getSession(sessionId);
  }

  async endSession(sessionId: string): Promise<void> {
    await this.redisService.deleteSession(sessionId);
  }

  private isFAQQuestion(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // Only treat as FAQ if it's a pure information-seeking question
    // that doesn't require specific user data or actions
    const pureFAQPatterns = [
      /^what (is|are|do|does) /i,
      /^how (do|can|does) /i,
      /^when (do|can|does) /i,
      /^where (do|can|does) /i,
      /^why (do|can|does) /i,
      /^(can|could) you (tell|explain|help) /i,
      /^(do|does) you (have|know) /i,
    ];
    
    // Check if it matches pure FAQ patterns
    const isPureFAQ = pureFAQPatterns.some(pattern => pattern.test(message));
    
    // Also check for general knowledge questions that don't require user context
    const generalKnowledgeKeywords = ['what is', 'how to', 'explain', 'tell me about'];
    const hasGeneralKnowledgeKeyword = generalKnowledgeKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );
    
    return isPureFAQ || hasGeneralKnowledgeKeyword;
  }

  private getKeywordResponse(message: string): string | null {
    const lowerMessage = message.toLowerCase();
    
    // Check for FAQ responses using configuration service
    try {
      const { configService } = require('./config-service');
      const faqResponse = configService.findFAQResponse(message);
      
      if (faqResponse && faqResponse.confidence > 0.6) {
        console.log(`FAQ match found: ${faqResponse.intent} with confidence ${faqResponse.confidence}`);
        return faqResponse.response;
      }
    } catch (error) {
      console.error('Error checking FAQ configuration:', error);
      // Continue with fallback logic if configuration fails
    }
    
    // No keyword match found
    return null;
  }

  /**
   * Process message using LangChain orchestration
   */
  async processMessageWithLangChain(request: ConversationRequest): Promise<ConversationResponse> {
    let session: ConversationSession;

    // Initialize intent detector and context manager
    try {
      console.log('Initializing intent detector for LangChain...');
      await this.intentDetector.initialize();
      console.log('Intent detector initialized successfully for LangChain');
      
      console.log('Context manager ready for LangChain');
    } catch (error) {
      console.error('Error initializing services for LangChain:', error);
    }

    // Get or create session
    if (request.sessionId) {
      const existingSession = await this.redisService.getSession(request.sessionId);
      if (!existingSession) {
        // Create new session if the provided sessionId doesn't exist
        console.log('Session not found, creating new session');
        session = await this.createNewSession(request.userId, request.context);
      } else {
        session = existingSession;
      }
    } else {
      session = await this.createNewSession(request.userId, request.context);
    }

    try {
      // Use LangChain orchestrator for advanced processing
      const chainResult = await this.langChainOrchestrator.processMessage(
        request.message,
        session.sessionId,
        request.userId
      );

      // Add messages to history
      await this.redisService.addMessageToHistory(session.sessionId, 'user', request.message);
      await this.redisService.addMessageToHistory(session.sessionId, 'assistant', chainResult.response);

      // Update session
      await this.redisService.updateSession(session.sessionId, {
        currentIntent: chainResult.intent,
        extractedParameters: { ...session.extractedParameters, ...chainResult.extractedParameters },
      });

      return {
        sessionId: session.sessionId,
        response: chainResult.response,
        intent: chainResult.intent,
        confidence: chainResult.confidence,
        extractedParameters: chainResult.extractedParameters,
        suggestedActions: chainResult.suggestedActions,
      };
    } catch (error) {
      console.error('Error in LangChain processing:', error);
      // Fallback to regular processing
      return this.processMessage(request);
    }
  }

  async debugIntentDetection(message: string): Promise<{
    selectedIntent: string;
    selectedConfidence: number;
    intentScores: Array<{
      intent: string;
      score: number;
      confidence: number;
      matchedKeywords: string[];
      context: string;
    }>;
    tokenizedWords: string[];
    context: string;
    processingTime: number;
  }> {
    try {
      // Initialize intent detector
      await this.intentDetector.initialize();
      
      // Get the selected intent
      const intentMatch = await this.intentDetector.detectIntent(message, 'general');
      
      // For now, return a simplified debug response
      // TODO: Enhance this to show all intent scores when we add public methods
      const intentScores = [{
        intent: intentMatch.intent,
        score: 0, // Placeholder - will be enhanced later
        confidence: intentMatch.confidence,
        matchedKeywords: intentMatch.matchedKeywords,
        context: intentMatch.context,
      }];

      return {
        selectedIntent: intentMatch.intent,
        selectedConfidence: intentMatch.confidence,
        intentScores: intentScores,
        tokenizedWords: message.toLowerCase().split(/\s+/),
        context: 'general',
        processingTime: 0, // Will be calculated on frontend
      };
    } catch (error) {
      console.error('Error in debugIntentDetection:', error);
      throw error;
    }
  }

  // HuggingFace Fine-tuning Public Methods
  /**
   * Initialize HuggingFace fine-tuning environment
   */
  async initializeFineTuning(): Promise<void> {
    await this.langChainOrchestrator.initializeFineTuning();
  }

  /**
   * Start fine-tuning a model
   */
  async startModelFineTuning(config: any, trainingData: any[]): Promise<string> {
    return await this.langChainOrchestrator.startModelFineTuning(config, trainingData);
  }

  /**
   * Get fine-tuning job status
   */
  async getFineTuningStatus(jobId: string): Promise<any> {
    return await this.langChainOrchestrator.getFineTuningStatus(jobId);
  }

  /**
   * Get all fine-tuned models
   */
  async getFineTunedModels(): Promise<any[]> {
    return await this.langChainOrchestrator.getFineTunedModels();
  }

  /**
   * Generate training data from conversations
   */
  async generateTrainingData(sessionIds: string[]): Promise<any[]> {
    return await this.langChainOrchestrator.generateTrainingData(sessionIds);
  }

  /**
   * Get recommended fine-tuning configuration
   */
  getRecommendedFineTuningConfig(): any {
    return this.langChainOrchestrator.getRecommendedFineTuningConfig();
  }

  /**
   * Test model accuracy
   */
  async testModelAccuracy(modelId: string, testData: any[]): Promise<any> {
    return await this.langChainOrchestrator.testModelAccuracy(modelId, testData);
  }

  /**
   * Use model for inference
   */
  async useModelForInference(modelId: string, input: string): Promise<any> {
    return await this.langChainOrchestrator.useModelForInference(modelId, input);
  }

  /**
   * Compare multiple models
   */
  async compareModels(modelIds: string[], testData: any[]): Promise<any> {
    return await this.langChainOrchestrator.compareModels(modelIds, testData);
  }

  /**
   * Get model performance summary
   */
  async getModelPerformanceSummary(): Promise<any> {
    return await this.langChainOrchestrator.getModelPerformanceSummary();
  }
} 