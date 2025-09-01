import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Button,
  Text,
  Input,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Badge,
  Progress,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useColorModeValue,
  Flex,
  Alert,
  AlertIcon,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
} from '@chakra-ui/react';
import { SearchIcon, InfoIcon } from '@chakra-ui/icons';

interface IntentScore {
  intent: string;
  score: number;
  confidence: number;
  matchedKeywords: string[];
  context: string;
}

interface IntentDebugResult {
  query: string;
  tokenizedWords: string[];
  intentScores: IntentScore[];
  selectedIntent: string;
  selectedConfidence: number;
  processingTime: number;
  context: string;
  isFAQQuestion: boolean;
}

interface IntentDebugPanelProps {
  apiUrl: string;
}

export const IntentDebugPanel: React.FC<IntentDebugPanelProps> = ({ apiUrl }) => {
  const [testQuery, setTestQuery] = useState('');
  const [debugResult, setDebugResult] = useState<IntentDebugResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const testIntentDetection = async () => {
    if (!testQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setDebugResult(null);

    try {
      const startTime = Date.now();
      
      // Use LangChain endpoint for enhanced intent detection
      const response = await fetch(`${apiUrl}/conversation/langchain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId: 'debug-user',
          message: testQuery,
          context: 'general'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      // Create a mock intent score since LangChain doesn't return detailed scores yet
      const mockIntentScore = {
        intent: data.intent || 'unknown',
        score: 0.8, // Placeholder score
        confidence: data.confidence || 0,
        matchedKeywords: [], // Will be enhanced later
        context: data.context || 'general',
      };

      const result: IntentDebugResult = {
        query: testQuery,
        tokenizedWords: testQuery.toLowerCase().split(' '),
        intentScores: [mockIntentScore],
        selectedIntent: data.intent || 'unknown',
        selectedConfidence: data.confidence || 0,
        processingTime,
        context: data.context || 'general',
        isFAQQuestion: testQuery.toLowerCase().includes('how') || 
                      testQuery.toLowerCase().includes('what') ||
                      testQuery.toLowerCase().includes('when') ||
                      testQuery.toLowerCase().includes('where') ||
                      testQuery.toLowerCase().includes('why'),
      };

      setDebugResult(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to test intent detection: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'green';
    if (confidence >= 0.6) return 'yellow';
    return 'red';
  };

  const getScoreColor = (score: number) => {
    if (score >= 4.0) return 'green';
    if (score >= 2.0) return 'yellow';
    return 'red';
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      testIntentDetection();
    }
  };

  return (
    <Card>
      <CardHeader>
        <Flex justify="space-between" align="center">
          <Heading size="md">Intent Detection Debug</Heading>
          <Badge colorScheme="purple" variant="subtle">
            BM25/TF-IDF
          </Badge>
        </Flex>
      </CardHeader>
      
      <CardBody>
        <VStack spacing={6} align="stretch">
          <Box>
            <Text fontSize="lg" fontWeight="bold" mb={3}>
              Test Intent Detection
            </Text>
            
            <HStack spacing={2}>
              <Input
                placeholder="Enter a test message..."
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyPress={handleKeyPress}
              />
              <Button
                colorScheme="blue"
                onClick={testIntentDetection}
                isLoading={isLoading}
                leftIcon={<SearchIcon />}
              >
                Analyze
              </Button>
            </HStack>
          </Box>

          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              {error}
            </Alert>
          )}

          {/* Results */}
          {debugResult && (
            <VStack spacing={4} align="stretch">
              {/* Summary Stats */}
              <Box p={4} border="1px solid" borderColor={borderColor} borderRadius="md">
                <VStack spacing={3} align="stretch">
                  <HStack justify="space-between">
                    <Text fontWeight="bold">Detection Summary</Text>
                    <Badge colorScheme="blue" variant="outline">
                      {debugResult.processingTime}ms
                    </Badge>
                  </HStack>
                  
                  <HStack spacing={6}>
                    <Stat>
                      <StatLabel>Selected Intent</StatLabel>
                      <StatNumber fontSize="lg">
                        <Badge colorScheme="purple" variant="solid">
                          {debugResult.selectedIntent}
                        </Badge>
                      </StatNumber>
                      <StatHelpText>
                        Confidence: {(debugResult.selectedConfidence * 100).toFixed(1)}%
                      </StatHelpText>
                    </Stat>
                    
                    <Stat>
                      <StatLabel>Context</StatLabel>
                      <StatNumber fontSize="lg">
                        <Badge colorScheme="blue" variant="outline">
                          {debugResult.context}
                        </Badge>
                      </StatNumber>
                    </Stat>
                    
                    <Stat>
                      <StatLabel>FAQ Question</StatLabel>
                      <StatNumber fontSize="lg">
                        <Badge colorScheme={debugResult.isFAQQuestion ? 'green' : 'gray'} variant="outline">
                          {debugResult.isFAQQuestion ? 'Yes' : 'No'}
                        </Badge>
                      </StatNumber>
                    </Stat>
                  </HStack>
                </VStack>
              </Box>

              {/* Tokenized Words */}
              <Box>
                <Text fontSize="lg" fontWeight="bold" mb={2}>
                  Tokenized Words
                </Text>
                <HStack spacing={2} flexWrap="wrap">
                  {debugResult.tokenizedWords.map((word, index) => (
                    <Badge key={index} colorScheme="teal" variant="outline">
                      {word}
                    </Badge>
                  ))}
                </HStack>
              </Box>

              {/* Intent Scores Table */}
              <Box>
                <Text fontSize="lg" fontWeight="bold" mb={3}>
                  Intent Scores (BM25)
                </Text>
                
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Intent</Th>
                      <Th>BM25 Score</Th>
                      <Th>Confidence</Th>
                      <Th>Context</Th>
                      <Th>Matched Keywords</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {debugResult.intentScores
                      .sort((a, b) => b.score - a.score)
                      .map((intentScore, index) => (
                        <Tr key={intentScore.intent}>
                          <Td>
                            <HStack spacing={2}>
                              <Text fontWeight="medium">
                                {intentScore.intent}
                              </Text>
                              {index === 0 && (
                                <Badge colorScheme="green" size="sm">
                                  Selected
                                </Badge>
                              )}
                            </HStack>
                          </Td>
                          <Td>
                            <VStack spacing={1} align="start">
                              <Text fontWeight="bold" color={`${getScoreColor(intentScore.score)}.500`}>
                                {intentScore.score.toFixed(2)}
                              </Text>
                              <Progress
                                value={(intentScore.score / 5) * 100}
                                size="sm"
                                colorScheme={getScoreColor(intentScore.score)}
                                width="100px"
                              />
                            </VStack>
                          </Td>
                          <Td>
                            <VStack spacing={1} align="start">
                              <Text fontWeight="bold" color={`${getConfidenceColor(intentScore.confidence)}.500`}>
                                {(intentScore.confidence * 100).toFixed(1)}%
                              </Text>
                              <Progress
                                value={intentScore.confidence * 100}
                                size="sm"
                                colorScheme={getConfidenceColor(intentScore.confidence)}
                                width="100px"
                              />
                            </VStack>
                          </Td>
                          <Td>
                            <Badge colorScheme="blue" variant="outline">
                              {intentScore.context}
                            </Badge>
                          </Td>
                          <Td>
                            <HStack spacing={1} flexWrap="wrap">
                              {intentScore.matchedKeywords.length > 0 ? (
                                intentScore.matchedKeywords.map((keyword, idx) => (
                                  <Badge key={idx} colorScheme="green" variant="outline" size="sm">
                                    {keyword}
                                  </Badge>
                                ))
                              ) : (
                                <Text fontSize="sm" color="gray.500">
                                  None
                                </Text>
                              )}
                            </HStack>
                          </Td>
                        </Tr>
                      ))}
                  </Tbody>
                </Table>
              </Box>

              {/* Algorithm Info */}
              <Box p={4} bg="blue.50" borderRadius="md" border="1px solid" borderColor="blue.200">
                <HStack spacing={2} mb={2}>
                  <InfoIcon color="blue.500" />
                  <Text fontWeight="bold" color="blue.700">
                    BM25 Algorithm Details
                  </Text>
                </HStack>
                <VStack spacing={2} align="start" fontSize="sm" color="blue.700">
                  <Text>• BM25 score combines term frequency (TF) and inverse document frequency (IDF)</Text>
                  <Text>• Higher scores indicate better intent matches</Text>
                  <Text>• Confidence is normalized from 0-1 based on score thresholds</Text>
                  <Text>• Context filtering ensures relevant intents for current conversation state</Text>
                </VStack>
              </Box>
            </VStack>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
};
