import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  Badge,
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Progress,
  Icon,
  Flex,
} from '@chakra-ui/react';
import { AddIcon, InfoIcon } from '@chakra-ui/icons';

interface StructuredSuggestion {
  text: string;
  level: number;
  parentPath: string[];
  confidence: number;
  context: string;
  alternativePaths?: string[][];
  frequency: number;
  examples: string[];
}

interface SuggestionsCardProps {
  suggestions: StructuredSuggestion[];
  isLoading: boolean;
  onAddSuggestion: (suggestion: StructuredSuggestion) => void;
}

export const SuggestionsCard: React.FC<SuggestionsCardProps> = ({
  suggestions,
  isLoading,
  onAddSuggestion,
}) => {
  return (
    <Card>
      <CardHeader>
        <Flex align="center" justify="space-between">
          <Heading size="md">AI Suggestions</Heading>
          <Badge colorScheme="brand" variant="subtle">
            {suggestions.length} suggestions
          </Badge>
        </Flex>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <VStack spacing={4}>
            <Progress size="sm" isIndeterminate w="full" />
            <Text color="gray.500">Loading suggestions...</Text>
          </VStack>
        ) : suggestions.length > 0 ? (
          <VStack spacing={4} align="stretch">
            {suggestions.map((suggestion, i) => (
              <Box
                key={`${suggestion.text}-${i}`}
                p={4}
                border="1px"
                borderColor="gray.200"
                borderRadius="lg"
                bg="white"
              >
                <Flex justify="space-between" align="start" mb={3}>
                  <VStack align="start" spacing={1} flex={1}>
                    <Text fontWeight="semibold" fontSize="sm">
                      {suggestion.text}
                    </Text>
                    <HStack spacing={2}>
                      <Badge size="sm" colorScheme="blue">
                        Level {suggestion.level}
                      </Badge>
                      <Badge size="sm" colorScheme="green">
                        {Math.round(suggestion.confidence * 100)}% confidence
                      </Badge>
                      <Badge size="sm" colorScheme="purple">
                        {suggestion.frequency} times
                      </Badge>
                    </HStack>
                  </VStack>
                  <Button
                    leftIcon={<AddIcon />}
                    size="sm"
                    onClick={() => onAddSuggestion(suggestion)}
                  >
                    Add
                  </Button>
                </Flex>
                
                {suggestion.parentPath.length > 0 && (
                  <Text fontSize="xs" color="gray.500" mb={2}>
                    Parent: {suggestion.parentPath.join(' → ')}
                  </Text>
                )}
                
                {suggestion.context && (
                  <Text fontSize="xs" color="gray.600" fontStyle="italic">
                    "{suggestion.context}"
                  </Text>
                )}
              </Box>
            ))}
          </VStack>
        ) : (
          <VStack spacing={4} py={8}>
            <Icon as={InfoIcon} w={8} h={8} color="gray.400" />
            <Text color="gray.500">No suggestions available</Text>
          </VStack>
        )}
      </CardBody>
    </Card>
  );
}; 