import { RedisService, ConversationSession } from './redis-service';
import { IntentMatch } from './intent-detector';
import { configService } from './config-service';
import { IntentConfig } from '../config/intent-config';

export interface ContextDefinition {
  name: string;
  description: string;
  intents: string[];
  fallbackContext?: string;
  requiredParameters?: string[];
  optionalParameters?: string[];
  responseTemplates: Record<string, string>;
  allowedTransitions: string[];
  // New fields for multi-turn conversations
  conversationFlow?: ConversationStep[];
  parameterPrompts?: Record<string, string>;
  followUpQuestions?: Record<string, string[]>;
  contextRules?: ContextRule[];
}

export interface ConversationStep {
  id: string;
  type: 'parameter_collection' | 'confirmation' | 'action' | 'decision';
  parameter?: string;
  question: string;
  validation?: (value: any) => boolean;
  nextStep?: string;
  fallbackStep?: string;
}

export interface ContextRule {
  condition: string;
  action: 'switch_context' | 'collect_parameter' | 'provide_response';
  target?: string;
  parameter?: string;
  response?: string;
}

export interface ConversationMemory {
  collectedParameters: Record<string, any>;
  conversationPath: string[];
  pendingActions: string[];
  userPreferences: Record<string, any>;
  lastIntent: string;
  contextSwitches: number;
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
  // Enhanced fields for multi-turn conversations
  conversationMemory: ConversationMemory;
  currentStep?: string;
  pendingParameters: string[];
  conversationFlow: string[];
  contextDepth: number;
  // Enhanced context switching fields
  collectedParameters: Record<string, any>; // Store all collected parameters
  parameterHistory: Array<{ parameter: string; value: any; timestamp: number }>; // Track parameter collection
  contextRules: ContextRule[]; // Active context rules for this state
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
    console.log('Initializing contexts from configuration...');
    
    try {
      // Get all categories from the configuration service
      const categories = configService.getAllCategories();
      const intents = configService.getAllIntents();
      
      // Create contexts based on categories
      categories.forEach(category => {
        // Find intents that belong to this category
        const categoryIntents = intents.filter(intent => intent.category === category.id);
        
        if (categoryIntents.length > 0) {
          const context: ContextDefinition = {
            name: category.id,
            description: category.description,
            intents: categoryIntents.map(intent => intent.id),
            fallbackContext: 'general',
            requiredParameters: this.extractRequiredParameters(categoryIntents),
            optionalParameters: this.extractOptionalParameters(categoryIntents),
            responseTemplates: this.buildResponseTemplates(categoryIntents),
            parameterPrompts: this.buildParameterPrompts(categoryIntents),
            followUpQuestions: this.buildFollowUpQuestions(categoryIntents),
            contextRules: this.buildContextRules(categoryIntents),
            allowedTransitions: this.getDefaultTransitions(category.id),
          };
          
          this.contexts.set(category.id, context);
          console.log(`Created context for category: ${category.name} with ${categoryIntents.length} intents`);
        }
      });
      
      // Always ensure we have a general context
      if (!this.contexts.has('general')) {
        const generalContext: ContextDefinition = {
          name: 'general',
          description: 'General conversation context',
          intents: ['general_inquiry'],
          fallbackContext: 'general',
          responseTemplates: {
            general_inquiry: 'I\'d be happy to help you with that. Could you provide more details?',
          },
          allowedTransitions: categories.map(cat => cat.id),
        };
        this.contexts.set('general', generalContext);
      }
      
      console.log(`Initialized ${this.contexts.size} contexts from configuration`);
    } catch (error) {
      console.error('Error initializing contexts from configuration:', error);
      // Fallback to basic contexts if configuration fails
      this.initializeFallbackContexts();
    }
  }

  private initializeFallbackContexts(): void {
    console.log('Initializing fallback contexts...');
    const fallbackContexts: ContextDefinition[] = [
      {
        name: 'general',
        description: 'General conversation context',
        intents: ['general_inquiry'],
        fallbackContext: 'general',
        responseTemplates: {
          general_inquiry: 'I\'d be happy to help you with that. Could you provide more details?',
        },
        allowedTransitions: [],
      }
    ];

    fallbackContexts.forEach(context => {
      this.contexts.set(context.name, context);
    });
  }

  private extractRequiredParameters(intents: IntentConfig[]): string[] {
    const requiredParams = new Set<string>();
    intents.forEach(intent => {
      intent.parameters.forEach(param => {
        if (param.required) {
          requiredParams.add(param.name);
        }
      });
    });
    return Array.from(requiredParams);
  }

  private extractOptionalParameters(intents: IntentConfig[]): string[] {
    const optionalParams = new Set<string>();
    intents.forEach(intent => {
      intent.parameters.forEach(param => {
        if (!param.required) {
          optionalParams.add(param.name);
        }
      });
    });
    return Array.from(optionalParams);
  }

  private buildResponseTemplates(intents: IntentConfig[]): Record<string, string> {
    const templates: Record<string, string> = {};
    intents.forEach(intent => {
      if (intent.responseTemplates.length > 0) {
        templates[intent.id] = intent.responseTemplates[0]; // Use first template
      }
    });
    return templates;
  }

  private buildParameterPrompts(intents: IntentConfig[]): Record<string, string> {
    const prompts: Record<string, string> = {};
    intents.forEach(intent => {
      intent.parameters.forEach(param => {
        if (param.required) {
          prompts[param.name] = `Please provide your ${param.name.replace('_', ' ')}.`;
        }
      });
    });
    return prompts;
  }

  private buildFollowUpQuestions(intents: IntentConfig[]): Record<string, string[]> {
    const questions: Record<string, string[]> = {};
    intents.forEach(intent => {
      // Generate follow-up questions based on intent parameters
      const followUps: string[] = [];
      if (intent.parameters.some(p => p.required)) {
        followUps.push('Is there anything else you need help with?');
      }
      if (followUps.length > 0) {
        questions[intent.id] = followUps;
      }
    });
    return questions;
  }

  private buildContextRules(intents: IntentConfig[]): ContextRule[] {
    const rules: ContextRule[] = [];
    intents.forEach(intent => {
      // Create rules for required parameters
      intent.parameters.forEach(param => {
        if (param.required) {
          rules.push({
            condition: `intent:${intent.id}`,
            action: 'collect_parameter',
            parameter: param.name,
            response: `I need your ${param.name.replace('_', ' ')} to help you.`,
          });
        }
      });
    });
    return rules;
  }

  private getDefaultTransitions(categoryId: string): string[] {
    // Allow transitions between most contexts, with some restrictions
    const allCategories = configService.getAllCategories().map(cat => cat.id);
    return allCategories.filter(id => id !== categoryId);
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
      conversationMemory: {
        collectedParameters: {},
        conversationPath: [],
        pendingActions: [],
        userPreferences: {},
        lastIntent: '',
        contextSwitches: 0,
      },
      pendingParameters: [],
      conversationFlow: [],
      contextDepth: 0,
      // Enhanced context switching fields
      collectedParameters: {},
      parameterHistory: [],
      contextRules: [],
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
      conversationMemory: {
        ...currentState.conversationMemory,
        contextSwitches: currentState.conversationMemory.contextSwitches + 1,
        lastIntent: '',
      },
      pendingParameters: [],
      conversationFlow: [...currentState.conversationFlow, newContext],
      contextDepth: currentState.contextDepth + 1,
      // Enhanced context switching fields
      collectedParameters: {
        ...currentState.collectedParameters,
        ...parameters,
      },
      parameterHistory: [
        ...currentState.parameterHistory,
        ...(parameters ? Object.entries(parameters).map(([key, value]) => ({
          parameter: key,
          value,
          timestamp: Date.now(),
        })) : [])
      ],
      contextRules: currentState.contextRules,
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
    
    try {
      // Get suggestions from configuration based on current context
      const contextIntents = configService.getIntentsByCategory(currentState.currentContext);
      
      contextIntents.forEach(intent => {
        // Add suggested actions from configuration
        suggestions.push(...intent.suggestedActions);
      });
      
      // If no suggestions from config, add defaults
      if (suggestions.length === 0) {
        suggestions.push('How can I help you?', 'What would you like to know?');
      }
    } catch (error) {
      console.error('Error getting context suggestions from config:', error);
      // Fallback to default suggestions
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

  async refreshFromConfig(): Promise<void> {
    console.log('Refreshing contexts from configuration...');
    this.contexts.clear();
    this.initializeDefaultContexts();
    console.log('Refreshed contexts from configuration');
  }

  // New methods for multi-turn conversation management
  
  async processMultiTurnConversation(
    sessionId: string,
    message: string,
    intentMatch: IntentMatch
  ): Promise<{
    response: string;
    nextAction?: string;
    requiresParameter?: string;
    contextSwitch?: boolean;
  }> {
    const contextState = await this.getContextState(sessionId);
    const currentContextDef = this.contexts.get(contextState.currentContext);
    
    if (!currentContextDef) {
      return { response: 'I\'m not sure how to help with that.' };
    }

    // Update conversation memory
    await this.updateConversationMemory(sessionId, message, intentMatch);

    // Store extracted parameters in context memory
    if (Object.keys(intentMatch.extractedParameters).length > 0) {
      console.log('Storing extracted parameters:', intentMatch.extractedParameters);
      await this.updateCollectedParameters(sessionId, intentMatch.extractedParameters);
    }

    // Check if we have all required parameters for the current context
    const hasAllParams = await this.hasRequiredParameters(sessionId, contextState.currentContext);
    
    if (hasAllParams) {
      // We have all parameters, provide a contextual response
      const contextResponse = await this.getContextAwareResponse(
        sessionId, 
        intentMatch.intent, 
        contextState.currentContext
      );
      
      if (contextResponse.nextAction === 'provide_service') {
        // All parameters collected, provide the actual service
        return {
          response: this.getServiceResponse(intentMatch.intent, contextState.currentContext),
          nextAction: 'provide_service',
        };
      }
      
      return contextResponse;
    } else {
      // Still need parameters, ask for the next one
      const missingParams = await this.getMissingParameters(sessionId, contextState.currentContext);
      if (missingParams.length > 0) {
        const nextParam = missingParams[0];
        const prompt = currentContextDef.parameterPrompts?.[nextParam] || 
                      `I need your ${nextParam.replace('_', ' ')}. Could you provide it?`;
        
        return {
          response: prompt,
          requiresParameter: nextParam,
          nextAction: 'parameter_collection',
        };
      }
    }

    // Check context rules for dynamic behavior
    const ruleResponse = await this.evaluateContextRules(sessionId, intentMatch);
    if (ruleResponse) {
      return ruleResponse;
    }

    // Generate context-appropriate response
    const response = await this.getContextResponse(intentMatch.intent, contextState.currentContext);
    
    // Add follow-up questions if available
    const followUps = currentContextDef.followUpQuestions?.[intentMatch.intent] || [];
    if (followUps.length > 0) {
      const followUp = followUps[Math.floor(Math.random() * followUps.length)];
      return {
        response: `${response} ${followUp}`,
        nextAction: 'await_response',
      };
    }

    return { response };
  }

  private async updateConversationMemory(
    sessionId: string,
    message: string,
    intentMatch: IntentMatch
  ): Promise<void> {
    const contextState = await this.getContextState(sessionId);
    
    const updatedMemory: ConversationMemory = {
      ...contextState.conversationMemory,
      lastIntent: intentMatch.intent,
      conversationPath: [...contextState.conversationMemory.conversationPath, intentMatch.intent],
    };

    await this.updateContextState(sessionId, {
      conversationMemory: updatedMemory,
    });
  }



  private async evaluateContextRules(
    sessionId: string,
    intentMatch: IntentMatch
  ): Promise<{
    response: string;
    nextAction?: string;
    requiresParameter?: string;
    contextSwitch?: boolean;
  } | null> {
    const contextState = await this.getContextState(sessionId);
    const currentContextDef = this.contexts.get(contextState.currentContext);
    
    if (!currentContextDef?.contextRules) return null;

    for (const rule of currentContextDef.contextRules) {
      if (this.evaluateRuleCondition(rule.condition, intentMatch, contextState)) {
        switch (rule.action) {
          case 'switch_context':
            if (rule.target) {
              await this.switchContext(sessionId, rule.target, `Rule: ${rule.condition}`);
              return {
                response: `I\'ve switched to ${rule.target} mode. ${rule.response || ''}`,
                contextSwitch: true,
              };
            }
            break;
          case 'collect_parameter':
            if (rule.parameter) {
              return {
                response: rule.response || `I need your ${rule.parameter}.`,
                nextAction: 'parameter_collection',
                requiresParameter: rule.parameter,
              };
            }
            break;
          case 'provide_response':
            return {
              response: rule.response || 'I understand. Let me help you with that.',
            };
        }
      }
    }
    
    return null;
  }

  private evaluateRuleCondition(
    condition: string,
    intentMatch: IntentMatch,
    contextState: ContextState
  ): boolean {
    // Simple rule evaluation - can be enhanced with more complex logic
    if (condition.includes('intent:')) {
      const requiredIntent = condition.split(':')[1];
      return intentMatch.intent === requiredIntent;
    }
    
    if (condition.includes('confidence:')) {
      const minConfidence = parseFloat(condition.split(':')[1]);
      return intentMatch.confidence >= minConfidence;
    }
    
    if (condition.includes('parameter:')) {
      const [paramName, paramValue] = condition.split(':')[1].split('=');
      return intentMatch.extractedParameters[paramName] === paramValue;
    }
    
    return false;
  }

  async addParameterToContext(
    sessionId: string,
    parameterName: string,
    parameterValue: any
  ): Promise<void> {
    const contextState = await this.getContextState(sessionId);
    
    const updatedParameters = {
      ...contextState.contextParameters,
      [parameterName]: parameterValue,
    };
    
    const updatedMemory = {
      ...contextState.conversationMemory,
      collectedParameters: {
        ...contextState.conversationMemory.collectedParameters,
        [parameterName]: parameterValue,
      },
    };

    await this.updateContextState(sessionId, {
      contextParameters: updatedParameters,
      conversationMemory: updatedMemory,
      pendingParameters: contextState.pendingParameters.filter(p => p !== parameterName),
    });
  }

  async getConversationSummary(sessionId: string): Promise<{
    currentContext: string;
    collectedParameters: Record<string, any>;
    conversationPath: string[];
    contextSwitches: number;
    suggestions: string[];
  }> {
    const contextState = await this.getContextState(sessionId);
    const suggestions = await this.getContextSuggestions(sessionId);
    
    return {
      currentContext: contextState.currentContext,
      collectedParameters: contextState.conversationMemory.collectedParameters,
      conversationPath: contextState.conversationMemory.conversationPath,
      contextSwitches: contextState.conversationMemory.contextSwitches,
      suggestions,
    };
  }

  // Enhanced context switching methods
  async updateCollectedParameters(
    sessionId: string, 
    newParameters: Record<string, any>
  ): Promise<void> {
    const currentState = await this.getContextState(sessionId);
    
    const updatedState: ContextState = {
      ...currentState,
      collectedParameters: {
        ...currentState.collectedParameters,
        ...newParameters,
      },
      parameterHistory: [
        ...currentState.parameterHistory,
        ...Object.entries(newParameters).map(([key, value]) => ({
          parameter: key,
          value,
          timestamp: Date.now(),
        }))
      ],
      lastActivity: Date.now(),
    };

    await this.updateContextState(sessionId, updatedState);
  }

  async getCollectedParameters(sessionId: string): Promise<Record<string, any>> {
    const currentState = await this.getContextState(sessionId);
    return currentState.collectedParameters || {};
  }

  async hasRequiredParameters(sessionId: string, context: string): Promise<boolean> {
    const contextDef = this.contexts.get(context);
    if (!contextDef?.requiredParameters) return true;

    const collectedParams = await this.getCollectedParameters(sessionId);
    return contextDef.requiredParameters.every(param => collectedParams[param]);
    }

  async getMissingParameters(sessionId: string, context: string): Promise<string[]> {
    const contextDef = this.contexts.get(context);
    if (!contextDef?.requiredParameters) return [];

    const collectedParams = await this.getCollectedParameters(sessionId);
    return contextDef.requiredParameters.filter(param => !collectedParams[param]);
  }

  async getContextAwareResponse(
    sessionId: string, 
    intent: string, 
    context: string
  ): Promise<{
    response: string;
    nextAction?: string;
    requiresParameter?: string;
  }> {
    const contextDef = this.contexts.get(context);
    if (!contextDef) {
      return { response: 'I\'m not sure how to help with that.' };
    }

    const collectedParams = await this.getCollectedParameters(sessionId);
    const missingParams = await this.getMissingParameters(sessionId, context);

    // If we have all required parameters, provide a contextual response
    if (missingParams.length === 0) {
      const response = contextDef.responseTemplates[intent] || 
                     contextDef.responseTemplates['general_inquiry'] || 
                     'I can help you with that. What would you like to do next?';
      
      return { 
        response,
        nextAction: 'provide_service',
      };
    }

    // If we're missing parameters, ask for the next one
    const nextParam = missingParams[0];
    const prompt = contextDef.parameterPrompts?.[nextParam] || 
                  `Please provide your ${nextParam.replace('_', ' ')}.`;
    
    return {
      response: prompt,
      nextAction: 'collect_parameter',
      requiresParameter: nextParam,
    };
  }

  private getServiceResponse(intent: string, context: string): string {
    try {
      // Get response from configuration
      const configIntent = configService.getIntentById(intent);
      if (configIntent && configIntent.responseTemplates.length > 0) {
        // Use a response template that indicates completion
        return configIntent.responseTemplates[0] + ' I have all the information I need. How can I assist you further?';
      }
    } catch (error) {
      console.error('Error getting service response from config:', error);
    }
    
    // Fallback response
    return 'I have all the information I need. How can I assist you further?';
  }
}
