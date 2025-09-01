import React, { useState, useEffect } from 'react';
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
  IconButton,
  Tooltip,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Textarea,
  FormControl,
  FormLabel,
  Select,
  useToast,
  Spinner,
  Flex,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon, ExternalLinkIcon, SearchIcon, EditIcon } from '@chakra-ui/icons';

interface FAQSource {
  id: string;
  name: string;
  url: string;
  type: 'url' | 'api';
  description?: string;
  lastUpdated?: string;
  status: 'active' | 'inactive';
}

interface FAQTestResult {
  query: string;
  answer: string;
  confidence: number;
  sources: Array<{
    id: string;
    content: string;
    source: string;
    score: number;
  }>;
}

interface FAQManagerProps {
  apiUrl: string;
}

export const FAQManager: React.FC<FAQManagerProps> = ({ apiUrl }) => {
  const [faqSources, setFaqSources] = useState<FAQSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState<FAQTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [newSource, setNewSource] = useState<Partial<FAQSource>>({
    name: '',
    url: '',
    type: 'url',
    description: '',
    status: 'active',
  });
  
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  // Load FAQ sources on component mount
  useEffect(() => {
    loadFAQSources();
  }, []);

  const loadFAQSources = async () => {
    setIsLoading(true);
    try {
      // For now, we'll use mock data until we implement the backend
      const mockSources: FAQSource[] = [
        {
          id: '1',
          name: 'Banking FAQ',
          url: 'https://example.com/banking-faq',
          type: 'url',
          description: 'Common banking questions and answers',
          lastUpdated: new Date().toISOString(),
          status: 'active',
        },
        {
          id: '2',
          name: 'Technical Support',
          url: 'https://example.com/tech-support',
          type: 'url',
          description: 'Technical support documentation',
          lastUpdated: new Date().toISOString(),
          status: 'active',
        },
      ];
      setFaqSources(mockSources);
    } catch (error) {
      toast({
        title: 'Error loading FAQ sources',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addFAQSource = async () => {
    if (!newSource.name || !newSource.url) {
      toast({
        title: 'Validation Error',
        description: 'Name and URL are required',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const source: FAQSource = {
        id: Date.now().toString(),
        name: newSource.name,
        url: newSource.url,
        type: newSource.type as 'url' | 'api',
        description: newSource.description,
        lastUpdated: new Date().toISOString(),
        status: newSource.status as 'active' | 'inactive',
      };

      // TODO: Implement backend API call
      // const response = await fetch(`${apiUrl}/faq/sources`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(source),
      // });

      setFaqSources(prev => [...prev, source]);
      setNewSource({ name: '', url: '', type: 'url', description: '', status: 'active' });
      onClose();
      
      toast({
        title: 'FAQ Source Added',
        description: `${source.name} has been added successfully`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error adding FAQ source',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const deleteFAQSource = async (id: string) => {
    try {
      // TODO: Implement backend API call
      // await fetch(`${apiUrl}/faq/sources/${id}`, { method: 'DELETE' });
      
      setFaqSources(prev => prev.filter(source => source.id !== id));
      
      toast({
        title: 'FAQ Source Deleted',
        description: 'FAQ source has been removed successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error deleting FAQ source',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const testFAQQuery = async () => {
    if (!testQuery.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a test query',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`${apiUrl}/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'faq-test-user',
          message: testQuery,
          context: 'general',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // For now, we'll create a mock result since the backend might not return RAG data yet
      const mockResult: FAQTestResult = {
        query: testQuery,
        answer: data.response,
        confidence: data.confidence || 0.5,
        sources: [
          {
            id: '1',
            content: 'Sample FAQ content for testing purposes...',
            source: 'Banking FAQ',
            score: 0.85,
          },
        ],
      };

      setTestResult(mockResult);
    } catch (error) {
      toast({
        title: 'Error testing FAQ query',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const refreshFAQSources = async () => {
    try {
      // TODO: Implement backend API call to refresh all sources
      // await fetch(`${apiUrl}/faq/refresh`, { method: 'POST' });
      
      toast({
        title: 'FAQ Sources Refreshed',
        description: 'All FAQ sources have been refreshed',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Error refreshing FAQ sources',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <Flex justify="space-between" align="center">
          <Heading size="md">FAQ Management</Heading>
          <HStack spacing={2}>
            <Button
              size="sm"
              variant="outline"
              onClick={refreshFAQSources}
              leftIcon={<RefreshIcon />}
            >
              Refresh All
            </Button>
            <Button
              size="sm"
              colorScheme="blue"
              onClick={onOpen}
              leftIcon={<AddIcon />}
            >
              Add FAQ Source
            </Button>
          </HStack>
        </Flex>
      </CardHeader>
      
      <CardBody>
        <VStack spacing={6} align="stretch">
          {/* FAQ Sources Table */}
          <Box>
            <Text fontSize="lg" fontWeight="bold" mb={3}>
              FAQ Sources ({faqSources.length})
            </Text>
            
            {isLoading ? (
              <Flex justify="center" p={4}>
                <Spinner />
              </Flex>
            ) : (
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>URL</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Last Updated</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {faqSources.map((source) => (
                    <Tr key={source.id}>
                      <Td>
                        <VStack align="start" spacing={1}>
                          <Text fontWeight="medium">{source.name}</Text>
                          {source.description && (
                            <Text fontSize="sm" color="gray.600">
                              {source.description}
                            </Text>
                          )}
                        </VStack>
                      </Td>
                      <Td>
                        <HStack spacing={1}>
                          <Text fontSize="sm" maxW="200px" isTruncated>
                            {source.url}
                          </Text>
                          <Tooltip label="Open URL">
                            <IconButton
                              size="xs"
                              icon={<ExternalLinkIcon />}
                              aria-label="Open URL"
                              variant="ghost"
                              onClick={() => window.open(source.url, '_blank')}
                            />
                          </Tooltip>
                        </HStack>
                      </Td>
                      <Td>
                        <Badge colorScheme={source.type === 'url' ? 'blue' : 'green'}>
                          {source.type}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge
                          colorScheme={source.status === 'active' ? 'green' : 'gray'}
                        >
                          {source.status}
                        </Badge>
                      </Td>
                      <Td>
                        <Text fontSize="sm">
                          {source.lastUpdated
                            ? new Date(source.lastUpdated).toLocaleDateString()
                            : 'Never'}
                        </Text>
                      </Td>
                      <Td>
                        <HStack spacing={1}>
                          <Tooltip label="Edit">
                            <IconButton
                              size="sm"
                              icon={<EditIcon />}
                              aria-label="Edit"
                              variant="ghost"
                            />
                          </Tooltip>
                          <Tooltip label="Delete">
                            <IconButton
                              size="sm"
                              icon={<DeleteIcon />}
                              aria-label="Delete"
                              variant="ghost"
                              colorScheme="red"
                              onClick={() => deleteFAQSource(source.id)}
                            />
                          </Tooltip>
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Box>

          {/* FAQ Testing Section */}
          <Box>
            <Text fontSize="lg" fontWeight="bold" mb={3}>
              Test FAQ Retrieval
            </Text>
            
            <VStack spacing={4} align="stretch">
              <HStack spacing={2}>
                <Input
                  placeholder="Enter a test question..."
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && testFAQQuery()}
                />
                <Button
                  colorScheme="blue"
                  onClick={testFAQQuery}
                  isLoading={isTesting}
                  leftIcon={<SearchIcon />}
                >
                  Test
                </Button>
              </HStack>

              {testResult && (
                <Box p={4} border="1px solid" borderColor="gray.200" borderRadius="md">
                  <VStack spacing={3} align="stretch">
                    <HStack justify="space-between">
                      <Text fontWeight="bold">Test Results</Text>
                      <Badge
                        colorScheme={testResult.confidence > 0.7 ? 'green' : 'yellow'}
                      >
                        Confidence: {(testResult.confidence * 100).toFixed(1)}%
                      </Badge>
                    </HStack>
                    
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" mb={1}>
                        Query:
                      </Text>
                      <Text fontSize="sm" color="gray.600">
                        {testResult.query}
                      </Text>
                    </Box>
                    
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" mb={1}>
                        Answer:
                      </Text>
                      <Text fontSize="sm">
                        {testResult.answer}
                      </Text>
                    </Box>
                    
                    {testResult.sources.length > 0 && (
                      <Box>
                        <Text fontSize="sm" fontWeight="bold" mb={1}>
                          Sources:
                        </Text>
                        <VStack spacing={2} align="stretch">
                          {testResult.sources.map((source, index) => (
                            <Box
                              key={index}
                              p={2}
                              bg="gray.50"
                              borderRadius="md"
                              border="1px solid"
                              borderColor="gray.200"
                            >
                              <HStack justify="space-between" mb={1}>
                                <Text fontSize="sm" fontWeight="medium">
                                  {source.source}
                                </Text>
                                <Badge colorScheme="blue" variant="outline">
                                  Score: {source.score.toFixed(2)}
                                </Badge>
                              </HStack>
                              <Text fontSize="sm" color="gray.600">
                                {source.content.substring(0, 150)}...
                              </Text>
                            </Box>
                          ))}
                        </VStack>
                      </Box>
                    )}
                  </VStack>
                </Box>
              )}
            </VStack>
          </Box>
        </VStack>
      </CardBody>

      {/* Add FAQ Source Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add FAQ Source</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  value={newSource.name}
                  onChange={(e) => setNewSource(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Banking FAQ"
                />
              </FormControl>
              
              <FormControl isRequired>
                <FormLabel>URL</FormLabel>
                <Input
                  value={newSource.url}
                  onChange={(e) => setNewSource(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com/faq"
                />
              </FormControl>
              
              <FormControl>
                <FormLabel>Type</FormLabel>
                <Select
                  value={newSource.type}
                  onChange={(e) => setNewSource(prev => ({ ...prev, type: e.target.value as 'url' | 'api' }))}
                >
                  <option value="url">URL</option>
                  <option value="api">API</option>
                </Select>
              </FormControl>
              
              <FormControl>
                <FormLabel>Description</FormLabel>
                <Textarea
                  value={newSource.description}
                  onChange={(e) => setNewSource(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this FAQ source"
                  rows={3}
                />
              </FormControl>
              
              <FormControl>
                <FormLabel>Status</FormLabel>
                <Select
                  value={newSource.status}
                  onChange={(e) => setNewSource(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="blue" onClick={addFAQSource}>
              Add Source
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
};

// Missing icon component
const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>
);
