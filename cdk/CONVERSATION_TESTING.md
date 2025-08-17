# Conversation Bot Testing Guide

## What We Built

### 🏗️ **Infrastructure**
- **ElastiCache Redis cluster** in AWS VPC for session storage
- **Lambda functions** in VPC to access Redis
- **API Gateway endpoints** for conversation management
- **Security groups** for secure Redis access

### 🔧 **Services**
- **RedisService**: Handles Redis connections, session management, and caching
- **ConversationManager**: Manages conversation flow, session creation, and message processing

### 🌐 **API Endpoints**
- `POST /conversation` - Process new messages
- `GET /conversation/history/{sessionId}` - Get conversation history
- `DELETE /conversation/{sessionId}` - End conversation session

## Testing Steps

### 1. Deploy the Infrastructure
```bash
cd cdk
npm install
npm run build
npx cdk deploy
```

### 2. Test Locally (if you have Redis running)
```bash
# Set Redis environment variables
export REDIS_ENDPOINT=your-redis-endpoint
export REDIS_PORT=6379

# Run the test script
npm run test-conversation
```

### 3. Test via API Gateway
After deployment, you'll get an API Gateway URL. Test with curl:

```bash
# Start a new conversation
curl -X POST https://your-api-gateway-url/prod/conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-1",
    "message": "Hello, how can you help me?",
    "context": "customer-support"
  }'

# Continue the conversation (use sessionId from previous response)
curl -X POST https://your-api-gateway-url/prod/conversation \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-1",
    "message": "I need help with my account",
    "sessionId": "session-id-from-previous-response"
  }'

# Get conversation history
curl -X GET https://your-api-gateway-url/prod/conversation/history/session-id-here

# End conversation
curl -X DELETE https://your-api-gateway-url/prod/conversation/session-id-here
```

## Expected Responses

### New Conversation Response
```json
{
  "sessionId": "uuid-here",
  "response": "I understand you're asking about: \"Hello, how can you help me?\". I'm here to help! This is a placeholder response - we'll implement proper response generation in the next steps.",
  "intent": "general_inquiry",
  "confidence": 0.8,
  "extractedParameters": {},
  "suggestedActions": ["ask_for_clarification", "provide_general_info"]
}
```

### Conversation History Response
```json
{
  "history": {
    "sessionId": "uuid-here",
    "userId": "test-user-1",
    "context": "customer-support",
    "conversationHistory": [
      {
        "role": "user",
        "content": "Hello, how can you help me?",
        "timestamp": 1234567890
      },
      {
        "role": "assistant",
        "content": "I understand you're asking about...",
        "timestamp": 1234567891
      }
    ],
    "currentIntent": "general_inquiry",
    "extractedParameters": {},
    "createdAt": 1234567890,
    "lastActivity": 1234567891
  }
}
```

## What's Working

✅ **Session Management**: Conversations persist across multiple messages  
✅ **Redis Integration**: Sessions stored in ElastiCache with TTL  
✅ **API Endpoints**: Full CRUD operations for conversations  
✅ **Error Handling**: Proper error responses and validation  
✅ **CORS Support**: Frontend can call the API  

## What's Next (Step 2)

🚧 **Intent Detection**: BM25/TF-IDF for intent disambiguation  
🚧 **Context Switching**: Switch between different conversation contexts  
🚧 **Response Generation**: Real responses instead of placeholders  
🚧 **Vector Store**: RAG pipeline for knowledge retrieval  

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Check if ElastiCache cluster is running
   - Verify security group allows Lambda access
   - Check VPC configuration

2. **Lambda Timeout**
   - Increase timeout in CDK stack
   - Check Redis connection performance

3. **API Gateway 500 Error**
   - Check Lambda logs in CloudWatch
   - Verify environment variables are set

### Useful Commands

```bash
# Check CDK deployment status
npx cdk list

# View Lambda logs
aws logs tail /aws/lambda/your-function-name --follow

# Test Redis connection
redis-cli -h your-redis-endpoint -p 6379 ping
```

## Architecture Diagram

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Frontend  │───▶│ API Gateway  │───▶│   Lambda    │
└─────────────┘    └──────────────┘    └─────────────┘
                                              │
                                              ▼
                                    ┌─────────────┐
                                    │ ElastiCache │
                                    │    Redis    │
                                    └─────────────┘
```

The conversation bot is now ready for testing! 🎉
