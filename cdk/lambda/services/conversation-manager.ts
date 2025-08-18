import { RedisService, ConversationSession } from './redis-service';
import { IntentDetector, IntentMatch } from './intent-detector';
import { ContextManager } from './context-manager';
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

  constructor(redisService: RedisService) {
    this.redisService = redisService;
    this.intentDetector = new IntentDetector(redisService);
    this.contextManager = new ContextManager(redisService);
  }

  async processMessage(request: ConversationRequest): Promise<ConversationResponse> {
    let session: ConversationSession;

    // Initialize intent detector and context manager
    await this.intentDetector.initialize();

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

    // Detect intent using BM25/TF-IDF
    const intentMatch = await this.intentDetector.detectIntent(request.message, session.context);
    
    // Check if we should switch context
    const contextSwitch = await this.contextManager.shouldSwitchContext(intentMatch, session.sessionId);
    
    if (contextSwitch.shouldSwitch && contextSwitch.targetContext) {
      await this.contextManager.switchContext(
        session.sessionId, 
        contextSwitch.targetContext, 
        `Intent: ${intentMatch.intent}`,
        intentMatch.extractedParameters
      );
    }

    // Generate response based on context and intent
    const response = await this.generateResponse(request.message, session, intentMatch);

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
    
    // Get context-specific response
    const contextResponse = await this.contextManager.getContextResponse(intentMatch.intent, contextState.currentContext);
    
    // Validate parameters for the current context
    const parameterValidation = await this.contextManager.validateContextParameters(
      contextState.currentContext, 
      intentMatch.extractedParameters
    );
    
    if (!parameterValidation.isValid && parameterValidation.missingParameters.length > 0) {
      return `I can help you with that. To proceed, I need: ${parameterValidation.missingParameters.join(', ')}.`;
    }
    
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
} 