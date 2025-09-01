import { RedisService } from './redis-service';
import { RealTrainingService, TrainingMetrics, ModelArtifacts } from './real-training-service';

export interface FineTuningConfig {
  modelName: string;
  learningRate: number;
  numEpochs: number;
  batchSize: number;
  maxLength: number;
  loraRank: number;
  loraAlpha: number;
  loraDropout: number;
}

export interface TrainingData {
  id: string;
  input: string;
  output: string;
  intent: string;
  context: string;
  confidence: number;
}

export interface FineTuningResult {
  modelId: string;
  trainingLoss: number;
  validationLoss: number;
  accuracy: number;
  trainingTime: number;
  modelPath: string;
  metadata: {
    config: FineTuningConfig;
    datasetSize: number;
    timestamp: string;
    realTraining?: boolean;
    metrics?: {
      precision: number;
      recall: number;
      f1: number;
    };
    artifacts?: {
      modelPath: string;
      tokenizerPath: string;
      configPath: string;
    };
  };
}

export interface ModelInfo {
  modelId: string;
  modelName: string;
  task: string;
  accuracy: number;
  trainingDate: string;
  isActive: boolean;
  metadata: Record<string, any>;
}

export class HuggingFaceFineTuner {
  private redisService: RedisService;
  private realTrainingService: RealTrainingService;
  private readonly MODELS_CACHE_KEY = 'fine-tuned-models';
  private readonly TRAINING_JOBS_CACHE_KEY = 'training-jobs';

  constructor(redisService: RedisService) {
    this.redisService = redisService;
    this.realTrainingService = new RealTrainingService(redisService);
  }

  /**
   * Initialize fine-tuning environment
   */
  async initialize(): Promise<void> {
    console.log('Initializing HuggingFace fine-tuning environment...');
    
    // Check if we have any existing fine-tuned models
    const existingModels = await this.getFineTunedModels();
    console.log(`Found ${existingModels.length} existing fine-tuned models`);
    
    // Check HuggingFace API access
    const apiAccess = await this.realTrainingService.checkApiAccess();
    if (!apiAccess) {
      console.warn('⚠️  HuggingFace API not accessible. Check HUGGINGFACE_TOKEN configuration.');
    } else {
      console.log('✅ HuggingFace API accessible');
    }
  }

  /**
   * Start fine-tuning a model with LoRA
   */
  async startFineTuning(
    config: FineTuningConfig,
    trainingData: TrainingData[]
  ): Promise<string> {
    console.log(`Starting REAL fine-tuning with config:`, config);
    console.log(`Training data size: ${trainingData.length} samples`);

    if (trainingData.length < 10) {
      throw new Error('Insufficient training data. Need at least 10 samples for real training.');
    }

    try {
      // Generate unique training job ID
      const jobId = `training-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Store training job info
      const jobInfo = {
        id: jobId,
        status: 'running',
        config,
        datasetSize: trainingData.length,
        startTime: new Date().toISOString(),
        progress: 0,
        message: 'Starting real HuggingFace fine-tuning...',
      };
      
      await this.redisService.setCache(`${this.TRAINING_JOBS_CACHE_KEY}:${jobId}`, jobInfo, 86400); // 24 hours

      // Start real fine-tuning process
      this.performRealFineTuning(jobId, config, trainingData);

      return jobId;
    } catch (error) {
      console.error('Error starting fine-tuning:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to start fine-tuning: ${errorMessage}`);
    }
  }

  /**
   * Get fine-tuning job status
   */
  async getTrainingJobStatus(jobId: string): Promise<any> {
    try {
      console.log(`📊 Getting fine-tuning status for job: ${jobId}`);
      
      // First, try to get status from Redis (real-time updates)
      const redisStatus = await this.realTrainingService.getJobStatus(jobId);
      if (redisStatus) {
        console.log(`📝 Found job status in Redis: ${redisStatus.status}`);
        return {
          id: jobId,
          status: redisStatus.status,
          message: redisStatus.message,
          lastUpdated: redisStatus.lastUpdated,
          progress: this.calculateProgress(redisStatus.message),
        };
      }
      
      // Fallback to cached status
      const jobInfo = await this.redisService.getCache(`${this.TRAINING_JOBS_CACHE_KEY}:${jobId}`);
      if (jobInfo) {
        return jobInfo;
      }
      
      return { 
        id: jobId,
        status: 'not_found',
        message: 'Job not found',
        progress: 0
      };
    } catch (error) {
      console.error('Error getting fine-tuning status:', error);
      return {
        id: jobId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to get training status',
      };
    }
  }

  /**
   * Calculate progress percentage based on training step message
   */
  private calculateProgress(message: string): number {
    const trainingSteps = [
      'Loading pre-trained model...',
      'Preparing dataset...',
      'Initializing LoRA adapters...',
      'Starting training...',
      'Training epoch 1/3...',
      'Training epoch 2/3...',
      'Training epoch 3/3...',
      'Evaluating model...',
      'Saving fine-tuned model...',
      'Training completed!'
    ];
    
    const stepIndex = trainingSteps.findIndex(step => message.includes(step));
    if (stepIndex === -1) return 0;
    
    return Math.round(((stepIndex + 1) / trainingSteps.length) * 100);
  }

  /**
   * Get all fine-tuned models
   */
  async getFineTunedModels(): Promise<ModelInfo[]> {
    const models = await this.redisService.getCache(this.MODELS_CACHE_KEY);
    return Array.isArray(models) ? models : [];
  }

  /**
   * Get specific fine-tuned model
   */
  async getModel(modelId: string): Promise<ModelInfo | null> {
    const models = await this.getFineTunedModels();
    return models.find(model => model.modelId === modelId) || null;
  }

  /**
   * Activate/deactivate a model
   */
  async setModelActive(modelId: string, isActive: boolean): Promise<void> {
    const models = await this.getFineTunedModels();
    const modelIndex = models.findIndex(model => model.modelId === modelId);
    
    if (modelIndex !== -1) {
      models[modelIndex].isActive = !isActive;
      await this.redisService.setCache(this.MODELS_CACHE_KEY, models, 86400);
    }
  }

  /**
   * Delete a fine-tuned model
   */
  async deleteModel(modelId: string): Promise<void> {
    const models = await this.getFineTunedModels();
    const filteredModels = models.filter(model => model.modelId !== modelId);
    await this.redisService.setCache(this.MODELS_CACHE_KEY, filteredModels, 86400);
  }

  /**
   * Prepare training data for fine-tuning
   */
  async prepareTrainingData(
    conversations: Array<{ input: string; output: string; intent: string; context: string }>
  ): Promise<TrainingData[]> {
    console.log(`Preparing ${conversations.length} conversation samples for training`);

    return conversations.map((conv, index) => ({
      id: `sample-${index}`,
      input: conv.input,
      output: conv.output,
      intent: conv.intent,
      context: conv.context,
      confidence: 1.0, // High confidence for training data
    }));
  }

  /**
   * Generate training data from existing conversations and transcripts
   */
  async generateTrainingDataFromConversations(sessionIds: string[]): Promise<TrainingData[]> {
    console.log(`Generating training data from ${sessionIds.length} sessions and existing transcripts`);
    
    const trainingData: TrainingData[] = [];
    
    // 1. Get data from conversation sessions if provided
    if (sessionIds.length > 0) {
      for (const sessionId of sessionIds) {
        try {
          const session = await this.redisService.getSession(sessionId);
          if (session && session.conversationHistory) {
            const pairs = this.convertConversationToTrainingPairs(session.conversationHistory);
            trainingData.push(...pairs);
          }
        } catch (error) {
          console.error(`Error processing session ${sessionId}:`, error);
        }
      }
    }
    
    // 2. Get data from existing DynamoDB transcripts (this is the real data!)
    try {
      const transcriptData = await this.getTranscriptTrainingData();
      trainingData.push(...transcriptData);
      console.log(`Added ${transcriptData.length} training samples from existing transcripts`);
    } catch (error) {
      console.error('Error getting transcript data:', error);
    }
    
    console.log(`Total training data: ${trainingData.length} samples`);
    return trainingData;
  }

  /**
   * Get training data from existing DynamoDB transcripts
   */
  private async getTranscriptTrainingData(): Promise<TrainingData[]> {
    try {
      // Import AWS SDK for DynamoDB access
      const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
      const { unmarshall } = require('@aws-sdk/util-dynamodb');
      
      const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
      
      // Scan the result table for existing classifications
      const scanCommand = new ScanCommand({
        TableName: process.env.RESULT_TABLE_NAME || 'ParsedResultsTable',
        Limit: 1000, // Get up to 1000 results
      });
      
      const response = await dynamoClient.send(scanCommand);
      const items = response.Items || [];
      
      const trainingData: TrainingData[] = [];
      
      for (const item of items) {
        const result = unmarshall(item);
        
        if (result.intentPath && result.inputParams) {
          // Extract intent from intentPath (e.g., ["billing", "high_bill"] -> "billing_high_bill")
          const intent = Array.isArray(result.intentPath) ? result.intentPath.join('_') : result.intentPath;
          
          // Extract transcript text from inputParams (it's embedded in the JSON)
          let transcriptText = '';
          try {
            const inputParams = JSON.parse(result.inputParams);
            // The transcript text is embedded in the inputParams, let's extract key phrases
            const phrases = Object.values(inputParams).filter(val => 
              typeof val === 'string' && val.length > 10 && !val.includes('json')
            );
            transcriptText = phrases.join(' ');
          } catch (e) {
            // Fallback: use inputParams as is
            transcriptText = result.inputParams;
          }
          
          if (transcriptText && intent) {
            trainingData.push({
              id: `transcript-${result.transcriptId || Date.now()}`,
              input: transcriptText,
              output: intent, // Use intent as the target output
              intent: intent,
              context: 'general',
              confidence: 1.0,
            });
          }
        }
      }
      
      console.log(`Found ${trainingData.length} transcript samples for training`);
      return trainingData;
      
    } catch (error) {
      console.error('Error getting transcript data:', error);
      return [];
    }
  }

  /**
   * Convert conversation history to training pairs
   */
  private convertConversationToTrainingPairs(messageHistory: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>): TrainingData[] {
    const pairs: TrainingData[] = [];
    
    for (let i = 0; i < messageHistory.length - 1; i += 2) {
      if (messageHistory[i].role === 'user' && messageHistory[i + 1]?.role === 'assistant') {
        pairs.push({
          id: `pair-${i}`,
          input: messageHistory[i].content,
          output: messageHistory[i + 1].content,
          intent: 'conversation', // Default intent for training
          context: 'general',
          confidence: 1.0,
        });
      }
    }
    
    return pairs;
  }



  /**
   * Perform real fine-tuning with HuggingFace
   */
  private async performRealFineTuning(
    jobId: string,
    config: FineTuningConfig,
    trainingData: TrainingData[]
  ): Promise<void> {
    console.log(`🚀 Starting REAL fine-tuning for job ${jobId}`);
    
    try {
      // Update job status to indicate real training
      const jobInfo = {
        id: jobId,
        status: 'running',
        config,
        datasetSize: trainingData.length,
        startTime: new Date().toISOString(),
        progress: 0,
        useRealTraining: true,
        message: 'Loading pre-trained model...',
      };
      
      await this.redisService.setCache(`${this.TRAINING_JOBS_CACHE_KEY}:${jobId}`, jobInfo, 86400);
      
      // Perform real training
      const { metrics, artifacts } = await this.realTrainingService.performFineTuning(config, trainingData);
      
      // Create result with real metrics
      const result: FineTuningResult = {
        modelId: `real-model-${Date.now()}`,
        trainingLoss: metrics.trainingLoss,
        validationLoss: metrics.validationLoss,
        accuracy: metrics.accuracy, // ← REAL accuracy from validation!
        trainingTime: metrics.trainingTime,
        modelPath: artifacts.modelPath,
        metadata: {
          config,
          datasetSize: trainingData.length,
          timestamp: new Date().toISOString(),
          realTraining: true,
          metrics: {
            precision: metrics.precision,
            recall: metrics.recall,
            f1: metrics.f1,
          },
          artifacts: {
            modelPath: artifacts.modelPath,
            tokenizerPath: artifacts.tokenizerPath,
            configPath: artifacts.configPath,
          },
        },
      };
      
      // Update job status to completed
      const completedJobInfo = {
        id: jobId,
        status: 'completed',
        config,
        datasetSize: trainingData.length,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        progress: 100,
        result,
        useRealTraining: true,
        message: 'Real fine-tuning completed successfully!',
      };
      
      await this.redisService.setCache(`${this.TRAINING_JOBS_CACHE_KEY}:${jobId}`, completedJobInfo, 86400);
      
      // Add new real model to models list
      const newModel: ModelInfo = {
        modelId: result.modelId,
        modelName: `real-fine-tuned-${config.modelName}`,
        task: 'intent_classification',
        accuracy: result.accuracy, // ← REAL accuracy!
        trainingDate: new Date().toISOString(),
        isActive: true,
        metadata: {
          description: `Real fine-tuned model using ${config.modelName}`,
          baseModel: config.modelName,
          fineTuningMethod: 'LoRA',
          trainingConfig: config,
          result,
          realTraining: true,
          metrics: {
            precision: metrics.precision,
            recall: metrics.recall,
            f1: metrics.f1,
          },
        },
      };
      
      const existingModels = await this.getFineTunedModels();
      existingModels.push(newModel);
      await this.redisService.setCache(this.MODELS_CACHE_KEY, existingModels, 86400);
      
      console.log(`🎉 Real fine-tuning completed for job ${jobId}. New model: ${result.modelId}`);
      console.log(`📊 Real accuracy: ${(result.accuracy * 100).toFixed(2)}%`);
      
    } catch (error) {
      console.error(`❌ Real fine-tuning failed for job ${jobId}:`, error);
      
      // Update job status to failed
      const failedJobInfo = {
        id: jobId,
        status: 'failed',
        config,
        datasetSize: trainingData.length,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        useRealTraining: true,
        message: 'Real fine-tuning failed. Check logs for details.',
      };
      
      await this.redisService.setCache(`${this.TRAINING_JOBS_CACHE_KEY}:${jobId}`, failedJobInfo, 86400);
    }
  }



  /**
   * Get recommended fine-tuning configuration
   */
  getRecommendedConfig(): FineTuningConfig {
    return {
      modelName: 'distilbert-base-uncased',
      learningRate: 2e-5,
      numEpochs: 3,
      batchSize: 16,
      maxLength: 512,
      loraRank: 16,
      loraAlpha: 32,
      loraDropout: 0.1,
    };
  }

  /**
   * Validate fine-tuning configuration
   */
  validateConfig(config: FineTuningConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (config.learningRate <= 0 || config.learningRate > 1) {
      errors.push('Learning rate must be between 0 and 1');
    }
    
    if (config.numEpochs < 1 || config.numEpochs > 100) {
      errors.push('Number of epochs must be between 1 and 100');
    }
    
    if (config.batchSize < 1 || config.batchSize > 128) {
      errors.push('Batch size must be between 1 and 128');
    }
    
    if (config.loraRank < 1 || config.loraRank > 256) {
      errors.push('LoRA rank must be between 1 and 256');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Test model accuracy
   */
  async testModelAccuracy(modelId: string, testData: any[]): Promise<any> {
    // Import the testing service
    const { ModelTestingService } = require('./model-testing-service');
    const testingService = new ModelTestingService();
    
    return await testingService.testModelAccuracy(modelId, testData);
  }

  /**
   * Use model for inference
   */
  async useModelForInference(modelId: string, input: string): Promise<any> {
    // Import the testing service
    const { ModelTestingService } = require('./model-testing-service');
    const testingService = new ModelTestingService();
    
    return await testingService.useModelForInference(modelId, input);
  }

  /**
   * Compare multiple models
   */
  async compareModels(modelIds: string[], testData: any[]): Promise<any> {
    // Import the testing service
    const { ModelTestingService } = require('./model-testing-service');
    const testingService = new ModelTestingService();
    
    return await testingService.compareModels(modelIds, testData);
  }
}
