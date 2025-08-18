import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { RedisService } from './services/redis-service';
import { ConversationManager } from './services/conversation-manager';

const redisService = new RedisService({
  host: process.env.REDIS_ENDPOINT!,
  port: parseInt(process.env.REDIS_PORT!),
});

const conversationManager = new ConversationManager(redisService);

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
