import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Button,
  Text,
  Flex,
  Badge,
  useColorModeValue,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Textarea,
  Alert,
  AlertIcon,
  Spinner,
} from '@chakra-ui/react';
import { ChatIcon, RepeatIcon } from '@chakra-ui/icons';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  intent?: string;
  confidence?: number;
  extractedParameters?: Record<string, unknown>;
  suggestedActions?: string[];
  context?: string;
  isFAQ?: boolean;
  ragResponse?: {
    confidence: number;
    sources: Array<{
      id: string;
      content: string;
      source: string;
      score: number;
    }>;
  };
}

interface ConversationTesterProps {
  apiUrl: string;
}

export const ConversationTester: React.FC<ConversationTesterProps> = ({ apiUrl }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentContext, setCurrentContext] = useState('general');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const userBg = useColorModeValue('blue.50', 'blue.900');
  const assistantBg = useColorModeValue('gray.50', 'gray.700');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setError(null);

    try {
      // Use LangChain endpoint for enhanced processing
      const response = await fetch(`${apiUrl}/conversation/langchain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'test-user',
          message: inputMessage,
          context: currentContext,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.response,
        timestamp: new Date(),
        intent: data.intent,
        confidence: data.confidence,
        extractedParameters: data.extractedParameters,
        suggestedActions: data.suggestedActions,
        context: currentContext,
      };

      setSessionId(data.sessionId);
      setMessages(prev => [...prev, assistantMessage]);
      
      // Update context if it changed
      if (data.context && data.context !== currentContext) {
        setCurrentContext(data.context);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to send message: ${errorMessage}`);
      
      const errorMessageObj: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessageObj]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setSessionId(null);
    setCurrentContext('general');
    setError(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'green';
    if (confidence >= 0.6) return 'yellow';
    return 'red';
  };

  return (
    <Card>
      <CardHeader>
        <Flex justify="space-between" align="center">
          <Heading size="md">Conversation Tester</Heading>
          <HStack spacing={2}>
            <Badge colorScheme="blue" variant="subtle">
              Context: {currentContext}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={clearConversation}
              leftIcon={<RepeatIcon />}
            >
              Clear
            </Button>
          </HStack>
        </Flex>
      </CardHeader>
      
      <CardBody>
        <VStack spacing={4} align="stretch">
          {/* Messages Area */}
          <Box
            height="400px"
            overflowY="auto"
            border="1px solid"
            borderColor={borderColor}
            borderRadius="md"
            p={4}
            bg={bgColor}
          >
            {messages.length === 0 ? (
              <Flex
                height="100%"
                align="center"
                justify="center"
                direction="column"
                color="gray.500"
              >
                <ChatIcon boxSize={8} mb={2} />
                <Text>Start a conversation to test the bot</Text>
              </Flex>
            ) : (
              <VStack spacing={3} align="stretch">
                {messages.map((message) => (
                  <Box
                    key={message.id}
                    alignSelf={message.type === 'user' ? 'flex-end' : 'flex-start'}
                    maxW="80%"
                  >
                    <Box
                      bg={message.type === 'user' ? userBg : assistantBg}
                      p={3}
                      borderRadius="lg"
                      border="1px solid"
                      borderColor={borderColor}
                    >
                      <Text mb={2}>{message.content}</Text>
                      
                      {message.type === 'assistant' && message.intent && (
                        <VStack spacing={1} align="start" mt={2}>
                          <HStack spacing={2}>
                            <Badge colorScheme="purple" variant="subtle">
                              Intent: {message.intent}
                            </Badge>
                            {message.confidence && (
                              <Badge
                                colorScheme={getConfidenceColor(message.confidence)}
                                variant="subtle"
                              >
                                Confidence: {(message.confidence * 100).toFixed(1)}%
                              </Badge>
                            )}
                          </HStack>
                          
                          {message.extractedParameters && 
                           Object.keys(message.extractedParameters).length > 0 && (
                            <Box>
                              <Text fontSize="sm" fontWeight="bold" mb={1}>
                                Extracted Parameters:
                              </Text>
                              <HStack spacing={1} flexWrap="wrap">
                                {Object.entries(message.extractedParameters).map(([key, value]) => (
                                  <Badge key={key} colorScheme="teal" variant="outline">
                                    {key}: {String(value)}
                                  </Badge>
                                ))}
                              </HStack>
                            </Box>
                          )}
                          
                          {message.suggestedActions && message.suggestedActions.length > 0 && (
                            <Box>
                              <Text fontSize="sm" fontWeight="bold" mb={1}>
                                Suggested Actions:
                              </Text>
                              <HStack spacing={1} flexWrap="wrap">
                                {message.suggestedActions.map((action) => (
                                  <Badge key={action} colorScheme="blue" variant="outline">
                                    {action}
                                  </Badge>
                                ))}
                              </HStack>
                            </Box>
                          )}
                        </VStack>
                      )}
                    </Box>
                  </Box>
                ))}
                
                {isLoading && (
                  <Box alignSelf="flex-start">
                    <Box bg={assistantBg} p={3} borderRadius="lg">
                      <HStack spacing={2}>
                        <Spinner size="sm" />
                        <Text>Thinking...</Text>
                      </HStack>
                    </Box>
                  </Box>
                )}
                
                <div ref={messagesEndRef} />
              </VStack>
            )}
          </Box>

          {/* Error Display */}
          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              {error}
            </Alert>
          )}

          {/* Input Area */}
          <HStack spacing={2}>
            <Textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              resize="none"
              rows={2}
              disabled={isLoading}
            />
            <Button
              colorScheme="blue"
              onClick={sendMessage}
              isLoading={isLoading}
              disabled={!inputMessage.trim()}
            >
              Send
            </Button>
          </HStack>

          {/* Session Info */}
          {sessionId && (
            <Box p={3} bg="gray.50" borderRadius="md">
              <Text fontSize="sm" color="gray.600">
                Session ID: {sessionId}
              </Text>
            </Box>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
};
