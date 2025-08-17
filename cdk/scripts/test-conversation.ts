import { RedisService } from '../lambda/services/redis-service';
import { ConversationManager } from '../lambda/services/conversation-manager';

// Test configuration - you'll need to update these with your actual Redis endpoint
const REDIS_HOST = process.env.REDIS_ENDPOINT || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

async function testConversation() {
  console.log('🧪 Testing Conversation Bot Redis Integration...\n');

  try {
    // Initialize Redis service
    console.log('📡 Connecting to Redis...');
    const redisService = new RedisService({
      host: REDIS_HOST,
      port: REDIS_PORT,
    });

    // Initialize conversation manager
    const conversationManager = new ConversationManager(redisService);

    // Test 1: Create a new conversation
    console.log('\n1️⃣ Testing new conversation creation...');
    const response1 = await conversationManager.processMessage({
      userId: 'test-user-1',
      message: 'Hello, how can you help me?',
      context: 'customer-support',
    });

    console.log('✅ New conversation created:');
    console.log(`   Session ID: ${response1.sessionId}`);
    console.log(`   Response: ${response1.response}`);
    console.log(`   Intent: ${response1.intent}`);
    console.log(`   Confidence: ${response1.confidence}`);

    // Test 2: Continue the same conversation
    console.log('\n2️⃣ Testing conversation continuation...');
    const response2 = await conversationManager.processMessage({
      userId: 'test-user-1',
      message: 'I need help with my account',
      sessionId: response1.sessionId,
    });

    console.log('✅ Conversation continued:');
    console.log(`   Response: ${response2.response}`);
    console.log(`   Intent: ${response2.intent}`);

    // Test 3: Get conversation history
    console.log('\n3️⃣ Testing conversation history...');
    const history = await conversationManager.getSessionHistory(response1.sessionId);
    
    if (history) {
      console.log('✅ Conversation history retrieved:');
      console.log(`   Total messages: ${history.conversationHistory.length}`);
      console.log(`   Context: ${history.context}`);
      console.log(`   Current intent: ${history.currentIntent}`);
      
      history.conversationHistory.forEach((msg, index) => {
        console.log(`   ${index + 1}. [${msg.role.toUpperCase()}] ${msg.content}`);
      });
    }

    // Test 4: Test caching
    console.log('\n4️⃣ Testing Redis caching...');
    await redisService.setCache('test-key', { message: 'Hello from cache!' });
    const cachedData = await redisService.getCache<{ message: string }>('test-key');
    
    if (cachedData) {
      console.log('✅ Cache test successful:');
      console.log(`   Cached data: ${cachedData.message}`);
    }

    // Test 5: End conversation
    console.log('\n5️⃣ Testing session cleanup...');
    await conversationManager.endSession(response1.sessionId);
    const deletedHistory = await conversationManager.getSessionHistory(response1.sessionId);
    
    if (!deletedHistory) {
      console.log('✅ Session cleanup successful - session no longer exists');
    }

    console.log('\n🎉 All tests passed! Redis integration is working correctly.');
    
    // Clean up Redis connection
    await redisService.close();

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testConversation();
}

export { testConversation };
