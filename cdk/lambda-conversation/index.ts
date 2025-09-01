import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RedisService } from './services/redis-service';
import { ConversationManager } from './services/conversation-manager';
// import { FAQService } from './services/faq-service'; // Temporarily disabled

const redisService = new RedisService({
  host: process.env.REDIS_ENDPOINT!,
  port: parseInt(process.env.REDIS_PORT!),
});

const conversationManager = new ConversationManager(redisService);

// Initialize FAQ service
const faqTableName = process.env.FAQ_SOURCES_TABLE_NAME || 'FAQSourcesTable';
// const faqService = new FAQService(faqTableName); // Temporarily disabled

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { httpMethod, path, body } = event;

    if (httpMethod === 'POST' && path === '/conversation') {
      const requestBody = JSON.parse(body || '{}');
      const { userId, message, sessionId, context } = requestBody;

      if (!userId || !message) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'userId and message are required' }),
        };
      }

      console.log('Processing message:', { userId, message, sessionId, context });
      
      const response = await conversationManager.processMessage({
        userId,
        message,
        sessionId,
        context,
      });
      
      console.log('Response:', response);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(response),
      };
    }

    if (httpMethod === 'GET' && path.startsWith('/conversation/history/')) {
      const sessionId = path.split('/').pop();
      if (!sessionId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'sessionId is required' }),
        };
      }

      const history = await conversationManager.getSessionHistory(sessionId);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ history }),
      };
    }

    if (httpMethod === 'DELETE' && path.startsWith('/conversation/')) {
      const sessionId = path.split('/').pop();
      if (!sessionId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'sessionId is required' }),
        };
      }

      await conversationManager.endSession(sessionId);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Session ended successfully' }),
      };
    }

    // Intent Debug Endpoint
    if (httpMethod === 'POST' && path === '/conversation/debug-intent') {
      const requestBody = JSON.parse(body || '{}');
      const { message } = requestBody;

      if (!message) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'message is required' }),
        };
      }

      try {
        // Use the conversation manager to process the message and get debug info
        const debugResponse = await conversationManager.debugIntentDetection(message);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(debugResponse),
        };
      } catch (error) {
        console.error('Error in intent debug:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to debug intent detection' }),
        };
      }
    }

    // LangChain Processing Endpoint
    if (httpMethod === 'POST' && path === '/conversation/langchain') {
      const requestBody = JSON.parse(body || '{}');
      const { userId, message, sessionId, context } = requestBody;

      if (!userId || !message) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'userId and message are required' }),
        };
      }

      try {
        console.log('Processing message with LangChain:', { userId, message, sessionId, context });
        
        const response = await conversationManager.processMessageWithLangChain({
          userId,
          message,
          sessionId,
          context,
        });
        
        console.log('LangChain response:', response);

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(response),
        };
      } catch (error) {
        console.error('Error in LangChain processing:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to process message with LangChain' }),
        };
      }
    }

    // HuggingFace Fine-tuning Endpoints
    if (httpMethod === 'POST' && path === '/conversation/finetune/start') {
      const requestBody = JSON.parse(body || '{}');
      const { config, sessionIds } = requestBody;

      if (!config) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Fine-tuning configuration is required' }),
        };
      }

      try {
        console.log('Starting REAL fine-tuning with config:', config);
        
        // Initialize fine-tuning if needed
        await conversationManager.initializeFineTuning();
        
        // Generate training data from conversations
        const trainingData = await conversationManager.generateTrainingData(sessionIds || []);
        console.log('Generated training data size:', trainingData.length);
        
        // Start real fine-tuning
        const jobId = await conversationManager.startModelFineTuning(config, trainingData);
        
        console.log('Real fine-tuning started with job ID:', jobId);

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            jobId, 
            status: 'started',
            trainingDataSize: trainingData.length,
            message: 'Real HuggingFace fine-tuning job started successfully'
          }),
        };
      } catch (error) {
        console.error('Error starting fine-tuning:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            error: 'Failed to start fine-tuning',
            details: error instanceof Error ? error.message : 'Unknown error',
            trainingDataSize: 0
          }),
        };
      }
    }

    if (httpMethod === 'GET' && path.startsWith('/conversation/finetune/status/')) {
      const jobId = path.split('/').pop();
      
      if (!jobId) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Job ID is required' }),
        };
      }

      try {
        const status = await conversationManager.getFineTuningStatus(jobId);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(status),
        };
      } catch (error) {
        console.error('Error getting fine-tuning status:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get fine-tuning status' }),
        };
      }
    }

    if (httpMethod === 'GET' && path === '/conversation/finetune/models') {
      try {
        const models = await conversationManager.getFineTunedModels();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ models }),
        };
      } catch (error) {
        console.error('Error getting fine-tuned models:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get fine-tuned models' }),
        };
      }
    }

    if (httpMethod === 'GET' && path === '/conversation/finetune/config/recommended') {
      try {
        const config = conversationManager.getRecommendedFineTuningConfig();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ config }),
        };
      } catch (error) {
        console.error('Error getting recommended config:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get recommended config' }),
        };
      }
    }

    // Model Testing Endpoints
    if (httpMethod === 'POST' && path === '/conversation/testing/accuracy') {
      try {
        const requestBody = JSON.parse(body || '{}');
        const { modelId, testData } = requestBody;

        if (!modelId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Model ID is required' }),
          };
        }

        const testResult = await conversationManager.testModelAccuracy(modelId, testData || []);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(testResult),
        };
      } catch (error) {
        console.error('Error testing model accuracy:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to test model accuracy' }),
        };
      }
    }

    if (httpMethod === 'POST' && path === '/conversation/testing/inference') {
      try {
        const requestBody = JSON.parse(body || '{}');
        const { modelId, input } = requestBody;

        if (!modelId || !input) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Model ID and input are required' }),
          };
        }

        const prediction = await conversationManager.useModelForInference(modelId, input);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(prediction),
        };
      } catch (error) {
        console.error('Error using model for inference:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to use model for inference' }),
        };
      }
    }

    if (httpMethod === 'POST' && path === '/conversation/testing/compare') {
      try {
        const requestBody = JSON.parse(body || '{}');
        const { modelIds, testData } = requestBody;

        if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Model IDs array is required' }),
          };
        }

        const comparisonResults = await conversationManager.compareModels(modelIds, testData || []);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(comparisonResults),
        };
      } catch (error) {
        console.error('Error comparing models:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to compare models' }),
        };
      }
    }

    // Get model performance summary
    if (httpMethod === 'GET' && path === '/conversation/testing/performance') {
      try {
        const performanceSummary = await conversationManager.getModelPerformanceSummary();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(performanceSummary),
        };
      } catch (error) {
        console.error('Error getting model performance summary:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get model performance summary' }),
        };
      }
    }

    // Configuration Management Endpoints
    if (httpMethod === 'GET' && path === '/conversation/config/intents') {
      try {
        const { configService } = await import('./services/config-service');
        const intents = configService.getAllIntents();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ intents }),
        };
      } catch (error) {
        console.error('Error getting intents:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get intents' }),
        };
      }
    }

    if (httpMethod === 'GET' && path === '/conversation/config/intents/') {
      try {
        const intentId = path.split('/').pop();
        if (!intentId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Intent ID is required' }),
          };
        }

        const { configService } = await import('./services/config-service');
        const intent = configService.getIntentById(intentId);
        
        if (!intent) {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Intent not found' }),
          };
        }

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ intent }),
        };
      } catch (error) {
        console.error('Error getting intent:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get intent' }),
        };
      }
    }

    if (httpMethod === 'POST' && path === '/conversation/config/intents') {
      try {
        const requestBody = JSON.parse(body || '{}');
        const { configService } = await import('./services/config-service');
        
        const success = configService.addIntent(requestBody);
        
        if (success) {
          return {
            statusCode: 201,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Intent created successfully', intent: requestBody }),
          };
        } else {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Failed to create intent' }),
          };
        }
      } catch (error) {
        console.error('Error creating intent:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to create intent' }),
        };
      }
    }

    if (httpMethod === 'PUT' && path.startsWith('/conversation/config/intents/')) {
      try {
        const intentId = path.split('/').pop();
        if (!intentId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Intent ID is required' }),
          };
        }

        const requestBody = JSON.parse(body || '{}');
        const { configService } = await import('./services/config-service');
        
        const success = configService.updateIntent(intentId, requestBody);
        
        if (success) {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Intent updated successfully' }),
          };
        } else {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Intent not found' }),
          };
        }
      } catch (error) {
        console.error('Error updating intent:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to update intent' }),
        };
      }
    }

    if (httpMethod === 'DELETE' && path.startsWith('/conversation/config/intents/')) {
      try {
        const intentId = path.split('/').pop();
        if (!intentId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Intent ID is required' }),
          };
        }

        const { configService } = await import('./services/config-service');
        const success = configService.removeIntent(intentId);
        
        if (success) {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Intent deleted successfully' }),
          };
        } else {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Intent not found' }),
          };
        }
      } catch (error) {
        console.error('Error deleting intent:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to delete intent' }),
        };
      }
    }

    if (httpMethod === 'GET' && path === '/conversation/config/categories') {
      try {
        const { configService } = await import('./services/config-service');
        const categories = configService.getAllCategories();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ categories }),
        };
      } catch (error) {
        console.error('Error getting categories:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get categories' }),
        };
      }
    }

    if (httpMethod === 'GET' && path === '/conversation/config/settings') {
      try {
        const { configService } = await import('./services/config-service');
        const globalSettings = configService.getGlobalSettings();
        const trainingDefaults = configService.getTrainingDefaults();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ globalSettings, trainingDefaults }),
        };
      } catch (error) {
        console.error('Error getting settings:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get settings' }),
        };
      }
    }

    if (httpMethod === 'POST' && path === '/conversation/config/settings') {
      try {
        const requestBody = JSON.parse(body || '{}');
        const { configService } = await import('./services/config-service');
        
        let success = true;
        if (requestBody.globalSettings) {
          success = success && configService.updateGlobalSettings(requestBody.globalSettings);
        }
        if (requestBody.trainingDefaults) {
          success = success && configService.updateTrainingDefaults(requestBody.trainingDefaults);
        }
        
        if (success) {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Settings updated successfully' }),
          };
        } else {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Failed to update some settings' }),
          };
        }
      } catch (error) {
        console.error('Error updating settings:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to update settings' }),
        };
      }
    }

    if (httpMethod === 'GET' && path === '/conversation/config/export') {
      try {
        const { configService } = await import('./services/config-service');
        const config = configService.exportConfiguration();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(config),
        };
      } catch (error) {
        console.error('Error exporting configuration:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to export configuration' }),
        };
      }
    }

    if (httpMethod === 'POST' && path === '/conversation/config/import') {
      try {
        const requestBody = JSON.parse(body || '{}');
        const { configService } = await import('./services/config-service');
        
        const success = configService.importConfiguration(requestBody);
        
        if (success) {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Configuration imported successfully' }),
          };
        } else {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Failed to import configuration' }),
          };
        }
      } catch (error) {
        console.error('Error importing configuration:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to import configuration' }),
        };
      }
    }

    if (httpMethod === 'POST' && path === '/conversation/config/validate') {
      try {
        const { configService } = await import('./services/config-service');
        const validation = configService.validateConfiguration();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify(validation),
        };
      } catch (error) {
        console.error('Error validating configuration:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to validate configuration' }),
        };
      }
    }

    // FAQ Management Endpoints
    if (httpMethod === 'GET' && path === '/conversation/config/faqs') {
      try {
        const { configService } = await import('./services/config-service');
        const faqIntents = configService.getFAQIntents();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ faqIntents }),
        };
      } catch (error) {
        console.error('Error getting FAQ intents:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to get FAQ intents' }),
        };
      }
    }

    if (httpMethod === 'POST' && path === '/conversation/config/faqs/test') {
      try {
        const requestBody = JSON.parse(body || '{}');
        const { message } = requestBody;
        
        if (!message) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Message is required' }),
          };
        }

        const { configService } = await import('./services/config-service');
        const faqResponse = configService.findFAQResponse(message);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ 
            message,
            faqResponse,
            hasMatch: !!faqResponse 
          }),
        };
      } catch (error) {
        console.error('Error testing FAQ response:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to test FAQ response' }),
        };
      }
    }

    // FAQ Management Endpoints
    if (httpMethod === 'GET' && path === '/faq/sources') {
      try {
        // const sources = await faqService.getAllSources(); // Temporarily disabled
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ sources: [] }), // Temporarily return empty array
        };
      } catch (error) {
        console.error('Error fetching FAQ sources:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to fetch FAQ sources' }),
        };
      }
    }

    if (httpMethod === 'POST' && path === '/faq/sources') {
      try {
        const requestBody = JSON.parse(body || '{}');
        const { name, url, type, description, status } = requestBody;

        if (!name || !url || !type) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'name, url, and type are required' }),
          };
        }

        // const source = await faqService.createSource({ // Temporarily disabled
        //   name,
        //   url,
        //   type,
        //   description,
        //   status,
        // });

        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ source: { name, url, type, description, status } }), // Temporarily return request data
        };
      } catch (error) {
        console.error('Error creating FAQ source:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to create FAQ source' }),
        };
      }
    }

    if (httpMethod === 'DELETE' && path.startsWith('/faq/sources/')) {
      try {
        const sourceId = path.split('/').pop();
        if (!sourceId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'sourceId is required' }),
          };
        }

        // await faqService.deleteSource(sourceId); // Temporarily disabled
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'FAQ source deleted successfully' }),
        };
      } catch (error) {
        console.error('Error deleting FAQ source:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ error: 'Failed to delete FAQ source' }),
        };
      }
    }

    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Not found' }),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
