import { TrainingData } from './huggingface-finetuner';

export interface TestResult {
  modelId: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusionMatrix: Record<string, Record<string, number>>;
  predictions: Array<{
    input: string;
    trueIntent: string;
    predictedIntent: string;
    confidence: number;
    correct: boolean;
  }>;
  testDataSize: number;
  timestamp: string;
}

export interface ModelPrediction {
  intent: string;
  confidence: number;
  alternatives: Array<{ intent: string; confidence: number }>;
}

export class ModelTestingService {
  private readonly INTENT_KEYWORDS = {
    'billing_high_bill': ['bill', 'payment', 'charge', 'cost', 'expensive', 'higher', 'amount'],
    'billing_balance': ['balance', 'account', 'owe', 'debt', 'outstanding'],
    'technical_support_wifi': ['wifi', 'internet', 'connection', 'router', 'signal', 'network'],
    'service_upgrade': ['upgrade', 'plan', 'change', 'better', 'faster', 'new'],
    'payment_make_payment': ['pay', 'payment', 'card', 'credit', 'debit', 'transfer'],
    'general_inquiry': ['question', 'help', 'information', 'what', 'how', 'why'],
    'account_inquiry': ['account', 'number', 'details', 'profile', 'personal'],
  };

  /**
   * Test a model's accuracy on validation data
   */
  async testModelAccuracy(
    modelId: string,
    testData: TrainingData[]
  ): Promise<TestResult> {
    console.log(`🧪 Testing model ${modelId} on ${testData.length} samples`);
    
    const predictions = await this.getModelPredictions(modelId, testData);
    const metrics = this.calculateMetrics(testData, predictions);
    const confusionMatrix = this.buildConfusionMatrix(testData, predictions);
    
    const result: TestResult = {
      modelId,
      accuracy: metrics.accuracy,
      precision: metrics.precision,
      recall: metrics.recall,
      f1: metrics.f1,
      confusionMatrix,
      predictions: predictions.map((pred, idx) => ({
        input: testData[idx].input,
        trueIntent: testData[idx].intent,
        predictedIntent: pred.intent,
        confidence: pred.confidence,
        correct: pred.intent === testData[idx].intent,
      })),
      testDataSize: testData.length,
      timestamp: new Date().toISOString(),
    };
    
    console.log(`📊 Test Results for ${modelId}:`);
    console.log(`   Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`);
    console.log(`   Precision: ${(metrics.precision * 100).toFixed(2)}%`);
    console.log(`   Recall: ${(metrics.recall * 100).toFixed(2)}%`);
    console.log(`   F1: ${(metrics.f1 * 100).toFixed(2)}%`);
    
    return result;
  }

  /**
   * Get predictions from a model (simulated for now, will be real when models are trained)
   */
  private async getModelPredictions(
    modelId: string,
    testData: TrainingData[]
  ): Promise<ModelPrediction[]> {
    console.log(`🔮 Getting predictions from model ${modelId}`);
    
    // For now, simulate predictions based on keyword matching
    // This will be replaced with actual model inference when models are trained
    return testData.map(item => {
      const prediction = this.simulateModelPrediction(item.input);
      return {
        intent: prediction.intent,
        confidence: prediction.confidence,
        alternatives: prediction.alternatives,
      };
    });
  }

  /**
   * Simulate model prediction using keyword matching
   * This will be replaced with actual model inference
   */
  private simulateModelPrediction(input: string): {
    intent: string;
    confidence: number;
    alternatives: Array<{ intent: string; confidence: number }>;
  } {
    const lowerInput = input.toLowerCase();
    const scores: Record<string, number> = {};
    
    // Calculate scores for each intent based on keyword matches
    for (const [intent, keywords] of Object.entries(this.INTENT_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        if (lowerInput.includes(keyword)) {
          score += 1;
        }
      }
      scores[intent] = score;
    }
    
    // Find the best match
    const bestIntent = Object.entries(scores).reduce((a, b) => 
      scores[a[0]] > scores[b[0]] ? a : b
    )[0];
    
    const maxScore = Math.max(...Object.values(scores));
    const confidence = maxScore > 0 ? Math.min(maxScore / 3, 0.95) : 0.1;
    
    // Generate alternatives
    const alternatives = Object.entries(scores)
      .filter(([intent, score]) => score > 0 && intent !== bestIntent)
      .sort((a, b) => scores[b[0]] - scores[a[0]])
      .slice(0, 3)
      .map(([intent, score]) => ({
        intent,
        confidence: Math.min(score / 3, 0.9),
      }));
    
    return {
      intent: bestIntent,
      confidence,
      alternatives,
    };
  }

  /**
   * Calculate accuracy metrics from predictions
   */
  private calculateMetrics(
    testData: TrainingData[],
    predictions: ModelPrediction[]
  ): { accuracy: number; precision: number; recall: number; f1: number } {
    let correct = 0;
    let total = testData.length;
    
    // Calculate accuracy
    for (let i = 0; i < total; i++) {
      if (predictions[i].intent === testData[i].intent) {
        correct++;
      }
    }
    
    const accuracy = correct / total;
    
    // Calculate precision, recall, F1 for each intent
    const intentMetrics = this.calculateIntentMetrics(testData, predictions);
    
    // Average the metrics across all intents
    const avgPrecision = Object.values(intentMetrics.precision).reduce((a, b) => a + b, 0) / Object.keys(intentMetrics.precision).length;
    const avgRecall = Object.values(intentMetrics.recall).reduce((a, b) => a + b, 0) / Object.keys(intentMetrics.recall).length;
    const avgF1 = Object.values(intentMetrics.f1).reduce((a, b) => a + b, 0) / Object.keys(intentMetrics.f1).length;
    
    return {
      accuracy,
      precision: avgPrecision,
      recall: avgRecall,
      f1: avgF1,
    };
  }

  /**
   * Calculate precision, recall, and F1 for each intent
   */
  private calculateIntentMetrics(
    testData: TrainingData[],
    predictions: ModelPrediction[]
  ): {
    precision: Record<string, number>;
    recall: Record<string, number>;
    f1: Record<string, number>;
  } {
    const intents = [...new Set(testData.map(item => item.intent))];
    const metrics: {
      precision: Record<string, number>;
      recall: Record<string, number>;
      f1: Record<string, number>;
    } = {
      precision: {},
      recall: {},
      f1: {},
    };
    
    for (const intent of intents) {
      let truePositives = 0;
      let falsePositives = 0;
      let falseNegatives = 0;
      
      for (let i = 0; i < testData.length; i++) {
        const trueIntent = testData[i].intent;
        const predictedIntent = predictions[i].intent;
        
        if (trueIntent === intent && predictedIntent === intent) {
          truePositives++;
        } else if (predictedIntent === intent && trueIntent !== intent) {
          falsePositives++;
        } else if (trueIntent === intent && predictedIntent !== intent) {
          falseNegatives++;
        }
      }
      
      const precision = truePositives / (truePositives + falsePositives) || 0;
      const recall = truePositives / (truePositives + falseNegatives) || 0;
      const f1 = 2 * (precision * recall) / (precision + recall) || 0;
      
      metrics.precision[intent] = precision;
      metrics.recall[intent] = recall;
      metrics.f1[intent] = f1;
    }
    
    return metrics;
  }

  /**
   * Build confusion matrix
   */
  private buildConfusionMatrix(
    testData: TrainingData[],
    predictions: ModelPrediction[]
  ): Record<string, Record<string, number>> {
    const intents = [...new Set(testData.map(item => item.intent))];
    const matrix: Record<string, Record<string, number>> = {};
    
    // Initialize matrix
    for (const intent of intents) {
      matrix[intent] = {};
      for (const predIntent of intents) {
        matrix[intent][predIntent] = 0;
      }
    }
    
    // Fill matrix
    for (let i = 0; i < testData.length; i++) {
      const trueIntent = testData[i].intent;
      const predictedIntent = predictions[i].intent;
      matrix[trueIntent][predictedIntent]++;
    }
    
    return matrix;
  }

  /**
   * Use a trained model for inference
   */
  async useModelForInference(
    modelId: string,
    input: string
  ): Promise<ModelPrediction> {
    console.log(`🎯 Using model ${modelId} for inference on: "${input}"`);
    
    // For now, simulate inference
    // This will be replaced with actual model inference when models are trained
    const prediction = this.simulateModelPrediction(input);
    
    console.log(`📤 Prediction: ${prediction.intent} (confidence: ${(prediction.confidence * 100).toFixed(1)}%)`);
    
    return prediction;
  }

  /**
   * Compare multiple models on the same test data
   */
  async compareModels(
    modelIds: string[],
    testData: TrainingData[]
  ): Promise<Record<string, TestResult>> {
    console.log(`🔍 Comparing ${modelIds.length} models on ${testData.length} test samples`);
    
    const results: Record<string, TestResult> = {};
    
    for (const modelId of modelIds) {
      try {
        results[modelId] = await this.testModelAccuracy(modelId, testData);
      } catch (error) {
        console.error(`Error testing model ${modelId}:`, error);
        results[modelId] = {
          modelId,
          accuracy: 0,
          precision: 0,
          recall: 0,
          f1: 0,
          confusionMatrix: {},
          predictions: [],
          testDataSize: testData.length,
          timestamp: new Date().toISOString(),
        };
      }
    }
    
    // Print comparison summary
    console.log('\n📊 Model Comparison Summary:');
    console.log('Model ID'.padEnd(30) + 'Accuracy'.padEnd(12) + 'Precision'.padEnd(12) + 'Recall'.padEnd(12) + 'F1'.padEnd(12));
    console.log('-'.repeat(78));
    
    for (const [modelId, result] of Object.entries(results)) {
      const shortId = modelId.length > 28 ? modelId.substring(0, 25) + '...' : modelId;
      console.log(
        shortId.padEnd(30) +
        `${(result.accuracy * 100).toFixed(1)}%`.padEnd(12) +
        `${(result.precision * 100).toFixed(1)}%`.padEnd(12) +
        `${(result.recall * 100).toFixed(1)}%`.padEnd(12) +
        `${(result.f1 * 100).toFixed(1)}%`.padEnd(12)
      );
    }
    
    return results;
  }
}

