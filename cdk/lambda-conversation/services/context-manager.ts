import { RedisService, ConversationSession } from './redis-service';
import { IntentMatch } from './intent-detector';

export interface ContextDefinition {
  name: string;
  description: string;
  intents: string[];
  fallbackContext?: string;
  requiredParameters?: string[];
  optionalParameters?: string[];
  responseTemplates: Record<string, string>;
  allowedTransitions: string[];
}

export interface ContextState {
  currentContext: string;
  previousContext?: string;
  contextHistory: Array<{
    context: string;
    timestamp: number;
    trigger: string;
  }>;
  contextParameters: Record<string, any>;
  lastActivity: number;
}

export class ContextManager {
  private redisService: RedisService;
  private contexts: Map<string, ContextDefinition>;
  private readonly CONTEXT_TTL = 7200; // 2 hours

  constructor(redisService: RedisService) {
    this.redisService = redisService;
    this.contexts = new Map();
    this.initializeDefaultContexts();
  }

  private initializeDefaultContexts(): void {
    const defaultContexts: ContextDefinition[] = [
      {
        name: 'general',
        description: 'General conversation context',
        intents: ['greeting', 'general_inquiry'],
        fallbackContext: 'general',
        responseTemplates: {
          greeting: 'Hello! How can I help you today?',
          general_inquiry: 'I\'d be happy to help you with that. Could you provide more details?',
        },
        allowedTransitions: ['banking', 'support', 'sales', 'scheduling'],
      },
      {
        name: 'banking',
        description: 'Banking and account-related inquiries',
        intents: ['account_inquiry', 'technical_support'],
        requiredParameters: ['account_number'],
        optionalParameters: ['date_range'],
        responseTemplates: {
          account_inquiry: 'I can help you with your account. Do you have your account number handy?',
          technical_support: 'I understand you\'re having issues with your banking. Let me help you resolve this.',
        },
        allowedTransitions: ['general', 'support'],
      },
      {
        name: 'support',
        description: 'Technical support and complaints',
        intents: ['technical_support', 'complaint'],
        requiredParameters: ['issue_type'],
        optionalParameters: ['device', 'error_message'],
        responseTemplates: {
          technical_support: 'I\'m here to help you with your technical issue. Can you describe the problem?',
          complaint: 'I\'m sorry to hear about your experience. Let me help you resolve this.',
        },
        allowedTransitions: ['general', 'banking'],
      },
      {
        name: 'sales',
        description: 'Product and service inquiries',
        intents: ['product_inquiry'],
        optionalParameters: ['product_name', 'service_type'],
        responseTemplates: {
          product_inquiry: 'I\'d be happy to tell you about our products and services. What interests you?',
        },
        allowedTransitions: ['general', 'scheduling'],
      },
      {
        name: 'scheduling',
        description: 'Appointment and booking requests',
        intents: ['appointment'],
        requiredParameters: ['date', 'time'],
        optionalParameters: ['service_type', 'duration'],
        responseTemplates: {
          appointment: 'I can help you schedule an appointment. When would you like to come in?',
        },
        allowedTransitions: ['general', 'sales'],
      },
    ];

    defaultContexts.forEach(context => {
      this.contexts.set(context.name, context);
    });
  }

  async getContextState(sessionId: string): Promise<ContextState> {
    const cachedState = await this.redisService.getCache<ContextState>(`context-state:${sessionId}`);
    
    if (cachedState) {
      return cachedState;
    }

    // Return default context state
    return {
      currentContext: 'general',
      contextHistory: [],
      contextParameters: {},
      lastActivity: Date.now(),
    };
  }

  async updateContextState(sessionId: string, updates: Partial<ContextState>): Promise<void> {
    const currentState = await this.getContextState(sessionId);
    const updatedState = { ...currentState, ...updates, lastActivity: Date.now() };
    
    await this.redisService.setCache(`context-state:${sessionId}`, updatedState, this.CONTEXT_TTL);
  }

  async switchContext(
    sessionId: string, 
    newContext: string, 
    trigger: string,
    parameters?: Record<string, any>
  ): Promise<boolean> {
    const currentState = await this.getContextState(sessionId);
    const contextDefinition = this.contexts.get(newContext);

    if (!contextDefinition) {
      console.warn(`Unknown context: ${newContext}`);
      return false;
    }

    // Check if transition is allowed
    if (!contextDefinition.allowedTransitions.includes(currentState.currentContext) && 
        currentState.currentContext !== 'general') {
      console.warn(`Transition from ${currentState.currentContext} to ${newContext} not allowed`);
      return false;
    }

    // Update context state
    const updatedState: ContextState = {
      currentContext: newContext,
      previousContext: currentState.currentContext,
      contextHistory: [
        ...currentState.contextHistory,
        {
          context: newContext,
          timestamp: Date.now(),
          trigger,
        }
      ],
      contextParameters: {
        ...currentState.contextParameters,
        ...parameters,
      },
      lastActivity: Date.now(),
    };

    await this.updateContextState(sessionId, updatedState);
    return true;
  }

  async shouldSwitchContext(intentMatch: IntentMatch, sessionId: string): Promise<{
    shouldSwitch: boolean;
    targetContext?: string;
    reason?: string;
  }> {
    const currentState = await this.getContextState(sessionId);
    const currentContextDef = this.contexts.get(currentState.currentContext);

    // Check if intent belongs to current context
    if (currentContextDef?.intents.includes(intentMatch.intent)) {
      return { shouldSwitch: false };
    }

    // Find appropriate context for this intent
    for (const [contextName, contextDef] of this.contexts) {
      if (contextDef.intents.includes(intentMatch.intent)) {
        // Check if transition is allowed
        if (contextDef.allowedTransitions.includes(currentState.currentContext) || 
            currentState.currentContext === 'general') {
          return {
            shouldSwitch: true,
            targetContext: contextName,
            reason: `Intent ${intentMatch.intent} belongs to context ${contextName}`,
          };
        }
      }
    }

    // If no specific context found, stay in current context
    return { shouldSwitch: false };
  }

  async getContextResponse(intent: string, context: string): Promise<string> {
    const contextDef = this.contexts.get(context);
    
    if (!contextDef) {
      return 'I\'m not sure how to help with that. Could you rephrase your question?';
    }

    return contextDef.responseTemplates[intent] || 
           contextDef.responseTemplates['general_inquiry'] || 
           'I understand. How can I help you further?';
  }

  async validateContextParameters(
    context: string, 
    parameters: Record<string, any>
  ): Promise<{
    isValid: boolean;
    missingParameters: string[];
    validParameters: Record<string, any>;
  }> {
    const contextDef = this.contexts.get(context);
    
    if (!contextDef) {
      return {
        isValid: false,
        missingParameters: [],
        validParameters: {},
      };
    }

    const missingParameters: string[] = [];
    const validParameters: Record<string, any> = {};

    // Check required parameters
    contextDef.requiredParameters?.forEach(param => {
      if (!parameters[param]) {
        missingParameters.push(param);
      } else {
        validParameters[param] = parameters[param];
      }
    });

    // Add optional parameters if present
    contextDef.optionalParameters?.forEach(param => {
      if (parameters[param]) {
        validParameters[param] = parameters[param];
      }
    });

    return {
      isValid: missingParameters.length === 0,
      missingParameters,
      validParameters,
    };
  }

  async getContextSuggestions(sessionId: string): Promise<string[]> {
    const currentState = await this.getContextState(sessionId);
    const contextDef = this.contexts.get(currentState.currentContext);
    
    if (!contextDef) return [];

    const suggestions: string[] = [];
    
    // Add context-specific suggestions
    switch (currentState.currentContext) {
      case 'banking':
        suggestions.push('Check account balance', 'View recent transactions', 'Transfer funds');
        break;
      case 'support':
        suggestions.push('Report an issue', 'Get help with login', 'Reset password');
        break;
      case 'sales':
        suggestions.push('Learn about products', 'Get pricing information', 'Schedule a demo');
        break;
      case 'scheduling':
        suggestions.push('Book an appointment', 'Check availability', 'Reschedule');
        break;
      default:
        suggestions.push('How can I help you?', 'What would you like to know?');
    }

    return suggestions;
  }

  async getAvailableContexts(): Promise<ContextDefinition[]> {
    return Array.from(this.contexts.values());
  }

  async addContext(context: ContextDefinition): Promise<void> {
    this.contexts.set(context.name, context);
  }

  async removeContext(contextName: string): Promise<void> {
    this.contexts.delete(contextName);
  }
}
