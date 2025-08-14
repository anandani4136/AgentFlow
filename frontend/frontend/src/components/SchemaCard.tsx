import React from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  Button,
  HStack,
  VStack,
  Box,
  Text,
  Textarea,
  Flex,
} from '@chakra-ui/react';
import { DownloadIcon, RepeatIcon, EditIcon } from '@chakra-ui/icons';

interface SchemaCardProps {
  schemaText: string;
  schemaObject: Record<string, any>;
  onSchemaTextChange: (text: string) => void;
  onUpdateSchema: () => void;
  onRescanAll: () => void;
  onOpenVisualEditor: () => void;
  isLoading: boolean;
  rescanInProgress: boolean;
}

export const SchemaCard: React.FC<SchemaCardProps> = ({
  schemaText,
  schemaObject,
  onSchemaTextChange,
  onUpdateSchema,
  onRescanAll,
  onOpenVisualEditor,
  isLoading,
  rescanInProgress,
}) => {
  return (
    <Card>
      <CardHeader>
        <Flex align="center" justify="space-between">
          <Heading size="md">Intent Schema</Heading>
          <HStack spacing={2}>
            <Button
              leftIcon={<EditIcon />}
              onClick={onOpenVisualEditor}
              size="sm"
              colorScheme="blue"
            >
              Visual Editor
            </Button>
            <Button
              leftIcon={<DownloadIcon />}
              onClick={onUpdateSchema}
              isLoading={isLoading}
              size="sm"
            >
              Update Schema
            </Button>
            <Button
              leftIcon={<RepeatIcon />}
              onClick={onRescanAll}
              isLoading={rescanInProgress}
              variant="outline"
              size="sm"
            >
              Rescan All
            </Button>
          </HStack>
        </Flex>
      </CardHeader>
      <CardBody>
        <VStack spacing={4} align="stretch">
          <Box p={4} border="1px" borderColor="gray.200" borderRadius="lg" bg="gray.50">
            <Text fontSize="sm" color="gray.600" mb={2}>
              Current Schema Structure:
            </Text>
            <Text fontSize="xs" fontFamily="mono" color="gray.700">
              {Object.keys(schemaObject).length > 0 
                ? `${Object.keys(schemaObject).length} top-level intents with ${Object.values(schemaObject).reduce((acc: number, val: any) => acc + Object.keys(val || {}).length, 0)} total sub-intents`
                : 'No schema defined'
              }
            </Text>
          </Box>
          <Textarea
            value={schemaText}
            onChange={(e) => onSchemaTextChange(e.target.value)}
            placeholder="Paste your intent schema JSON here..."
            size="md"
            rows={8}
            fontFamily="mono"
            fontSize="sm"
          />
        </VStack>
      </CardBody>
    </Card>
  );
}; 