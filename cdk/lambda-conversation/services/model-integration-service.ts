import { ModelInfo } from './huggingface-finetuner';
import { ModelPrediction } from './model-testing-service';

export interface ModelSelection {
  modelId: string;
  modelName: string;
  confidence: number;
  task: string;
  reason: string;
}

export interface EnhancedIntentResult {
  intent: string;
  confidence: number;
  modelUsed: string;
  alternatives: Array<{ intent: string; confidence: number }>;
  extractedParameters: Record<string, any>;
  suggestedActions: string[];
}

export class ModelIntegrationService {
  private readonly INTENT_TASK = 'intent_classification';
  private readonly RESPONSE_TASK = 'text_generation';
  
  /**
   * Select the best model for a specific task
   */
  async selectBestModel(task: string, availableModels: ModelInfo[]): Promise<ModelSelection> {
    console.log(`🔍 Selecting best model for task: ${task}`);
    
    // Filter models by task
    const taskModels = availableModels.filter(model => model.task === task);
    
    if (taskModels.length === 0) {
      throw new Error(`No models available for task: ${task}`);
    }
    
    // Sort by accuracy (highest first)
    const sortedModels = taskModels.sort((a, b) => b.accuracy - a.accuracy);
    const bestModel = sortedModels[0];
    
    const selection: ModelSelection = {
      modelId: bestModel.modelId,
      modelName: bestModel.modelName,
      confidence: bestModel.accuracy,
      task: bestModel.task,
      reason: `Highest accuracy: ${(bestModel.accuracy * 100).toFixed(1)}%`,
    };
    
    console.log(`✅ Selected model: ${selection.modelName} (${selection.reason})`);
    return selection;
  }

  /**
   * Enhanced intent detection using fine-tuned models
   */
  async detectIntentWithFineTunedModel(
    message: string,
    availableModels: ModelInfo[]
  ): Promise<EnhancedIntentResult> {
    try {
      // Select best intent detection model
      const modelSelection = await this.selectBestModel(this.INTENT_TASK, availableModels);
      
      // Import the testing service for inference
      const { ModelTestingService } = require('./model-testing-service');
      const testingService = new ModelTestingService();
      
      // Get prediction from fine-tuned model
      const prediction = await testingService.useModelForInference(modelSelection.modelId, message);
      
      // Extract parameters based on intent
      const extractedParameters = this.extractParametersFromIntent(message, prediction.intent);
      
      // Generate suggested actions
      const suggestedActions = this.generateSuggestedActions(prediction.intent, prediction.confidence);
      
      const result: EnhancedIntentResult = {
        intent: prediction.intent,
        confidence: prediction.confidence,
        modelUsed: modelSelection.modelName,
        alternatives: prediction.alternatives,
        extractedParameters,
        suggestedActions,
      };
      
      console.log(`🎯 Intent detected: ${result.intent} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
      console.log(`🤖 Model used: ${result.modelUsed}`);
      
      return result;
      
    } catch (error) {
      console.error('Error in enhanced intent detection:', error);
      
      // Fallback to basic intent detection
      return this.fallbackIntentDetection(message);
    }
  }

  /**
   * Generate contextual response using fine-tuned models
   */
  async generateResponseWithFineTunedModel(
    intent: string,
    message: string,
    context: string,
    availableModels: ModelInfo[]
  ): Promise<string> {
    try {
      // Select best response generation model
      const responseModels = availableModels.filter(model => model.task === this.RESPONSE_TASK);
      
      if (responseModels.length > 0) {
        const modelSelection = await this.selectBestModel(this.RESPONSE_TASK, responseModels);
        console.log(`🤖 Using fine-tuned response model: ${modelSelection.modelName}`);
        
        // For now, generate contextual response based on intent
        // In the future, this will use the actual fine-tuned model
        return this.generateContextualResponse(intent, message, context);
      } else {
        // Fallback to rule-based response generation
        return this.generateContextualResponse(intent, message, context);
      }
      
    } catch (error) {
      console.error('Error in enhanced response generation:', error);
      return this.generateContextualResponse(intent, message, context);
    }
  }

  /**
   * Extract parameters from user message based on detected intent
   */
  private extractParametersFromIntent(message: string, intent: string): Record<string, any> {
    const lowerMessage = message.toLowerCase();
    const parameters: Record<string, any> = {};
    
    try {
      // Use configuration service for parameter extraction
      const { configService } = require('./config-service');
      const configIntent = configService.getIntentById(intent);
      
      if (configIntent && configIntent.parameters.length > 0) {
        // Extract parameters based on configuration
        configIntent.parameters.forEach((param: any) => {
          const extractedValue = this.extractParameterValue(lowerMessage, param);
          if (extractedValue !== null) {
            parameters[param.name] = extractedValue;
          }
        });
      }
    } catch (error) {
      console.error('Error getting parameter configuration:', error);
      // Fallback to basic parameter extraction
      this.extractBasicParameters(lowerMessage, intent, parameters);
    }
    
    return parameters;
  }

  private extractParameterValue(message: string, param: any): any {
    switch (param.type) {
      case 'number':
        const numberMatch = message.match(/\$?(\d+(?:\.\d{2})?)/);
        return numberMatch ? parseFloat(numberMatch[1]) : null;
      case 'string':
        // Look for examples or patterns in the message
        if (param.examples && param.examples.length > 0) {
          for (const example of param.examples) {
            if (message.includes(example.toLowerCase())) {
              return example;
            }
          }
        }
        return null;
      case 'boolean':
        const positiveWords = ['yes', 'true', 'correct', 'right'];
        const negativeWords = ['no', 'false', 'incorrect', 'wrong'];
        if (positiveWords.some(word => message.includes(word))) return true;
        if (negativeWords.some(word => message.includes(word))) return false;
        return null;
      default:
        return null;
    }
  }

  private extractBasicParameters(message: string, intent: string, parameters: Record<string, any>): void {
    // Fallback parameter extraction for common patterns
    const amountMatch = message.match(/\$?(\d+(?:\.\d{2})?)/);
    if (amountMatch) parameters.amount = parseFloat(amountMatch[1]);
    
    if (message.includes('month')) parameters.period = 'monthly';
    if (message.includes('week')) parameters.period = 'weekly';
    if (message.includes('year')) parameters.period = 'yearly';
    
    if (message.includes('slow')) parameters.issue = 'slow_connection';
    if (message.includes('disconnect')) parameters.issue = 'connection_drops';
    if (message.includes('router')) parameters.device = 'router';
    if (message.includes('modem')) parameters.device = 'modem';
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
      // Use configuration service for suggested actions
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

  /**
   * Generate contextual response based on intent
   */
  private generateContextualResponse(intent: string, message: string, context: string): string {
    // Use configuration service for contextual responses
    try {
      const { configService } = require('./config-service');
      const configIntent = configService.getIntentById(intent);
      
      if (configIntent && configIntent.responseTemplates.length > 0) {
        // Use configured response template
        const template = configIntent.responseTemplates[0];
        return template;
      }
    } catch (error) {
      console.error('Error getting contextual response from configuration:', error);
    }
    
    // Fallback to generic response if no configuration match
    return "I understand your request. Let me help you with that. Could you provide a bit more detail so I can assist you better?";
  }

  /**
   * Fallback intent detection when fine-tuned models fail
   */
  private fallbackIntentDetection(message: string): EnhancedIntentResult {
    const lowerMessage = message.toLowerCase();
    
    // Use configuration service for fallback intent detection
    try {
      const { configService } = require('./config-service');
      const intents = configService.getAllIntents();
      
      let bestIntent = 'general_inquiry';
      let bestConfidence = 0.5;
      
      // Find the best matching intent based on key phrases
      for (const configIntent of intents) {
        const hasMatch = configIntent.keyPhrases.some((phrase: string) => 
          lowerMessage.includes(phrase.toLowerCase())
        );
        
        if (hasMatch) {
          bestIntent = configIntent.id;
          bestConfidence = 0.7;
          break;
        }
      }
      
      return {
        intent: bestIntent,
        confidence: bestConfidence,
        modelUsed: 'fallback-configuration-matcher',
        alternatives: [],
        extractedParameters: {},
        suggestedActions: ['provide_general_help', 'escalate_to_agent'],
      };
    } catch (error) {
      console.error('Error in fallback intent detection:', error);
      
      // Fallback to basic keyword matching if configuration fails
      let intent = 'general_inquiry';
      let confidence = 0.5;
      
      if (lowerMessage.includes('bill') || lowerMessage.includes('payment')) {
        intent = 'billing_high_bill';
        confidence = 0.7;
      } else if (lowerMessage.includes('wifi') || lowerMessage.includes('internet')) {
        intent = 'technical_support_wifi';
        confidence = 0.7;
      } else if (lowerMessage.includes('upgrade') || lowerMessage.includes('change')) {
        intent = 'service_upgrade';
        confidence = 0.6;
      }
      
      return {
        intent,
        confidence,
        modelUsed: 'fallback-keyword-matcher',
        alternatives: [],
        extractedParameters: {},
        suggestedActions: ['provide_general_help', 'escalate_to_agent'],
      };
    }
  }

  /**
   * Get model performance summary for monitoring
   */
  async getModelPerformanceSummary(availableModels: ModelInfo[]): Promise<{
    intentModels: Array<{ modelId: string; accuracy: number; isActive: boolean }>;
    responseModels: Array<{ modelId: string; accuracy: number; isActive: boolean }>;
    totalModels: number;
    averageAccuracy: number;
  }> {
    const intentModels = availableModels
      .filter(model => model.task === this.INTENT_TASK)
      .map(model => ({
        modelId: model.modelId,
        accuracy: model.accuracy,
        isActive: model.isActive,
      }));
    
    const responseModels = availableModels
      .filter(model => model.task === this.RESPONSE_TASK)
      .map(model => ({
        modelId: model.modelId,
        accuracy: model.accuracy,
        isActive: model.isActive,
      }));
    
    const totalModels = availableModels.length;
    const averageAccuracy = availableModels.reduce((sum, model) => sum + model.accuracy, 0) / totalModels;
    
    return {
      intentModels,
      responseModels,
      totalModels,
      averageAccuracy,
    };
  }
}

