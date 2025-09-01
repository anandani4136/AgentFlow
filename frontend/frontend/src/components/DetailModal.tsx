import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,

  ModalBody,
  ModalCloseButton,
  VStack,
  Box,
  Text,
  Progress,
  Card,
  CardHeader,
  CardBody,
  Heading,
  SimpleGrid,
  HStack,
  Badge,
} from '@chakra-ui/react';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDetail: any;
  flowStats: any;
  isLoadingFlowStats: boolean;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  isOpen,
  onClose,
  selectedDetail,
  flowStats,
  isLoadingFlowStats,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent maxW="4xl" maxH="90vh">
        <ModalHeader>
          {selectedDetail?.type === 'flow' ? `Flow: ${selectedDetail.intentPath}` : 'Detail View'}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody overflow="auto">
          {isLoadingFlowStats ? (
            <VStack spacing={4} justify="center" py={8}>
              <Progress size="sm" isIndeterminate w="full" />
              <Text color="gray.500">Loading flow statistics...</Text>
            </VStack>
          ) : selectedDetail?.type === 'flow' && flowStats ? (
            <VStack spacing={6} align="stretch">
              <Card>
                <CardHeader>
                  <Heading size="sm">Flow Statistics</Heading>
                </CardHeader>
                <CardBody>
                  <SimpleGrid columns={2} spacing={4}>
                    <Box>
                      <Text fontWeight="bold" color="blue.600">Total Conversations</Text>
                      <Text fontSize="2xl">{flowStats.flowStatistics.totalConversations}</Text>
                    </Box>
                    <Box>
                      <Text fontWeight="bold" color="green.600">Input Parameters</Text>
                      <Text fontSize="2xl">{flowStats.flowStatistics.totalInputParameters}</Text>
                    </Box>
                    <Box>
                      <Text fontWeight="bold" color="orange.600">Output Parameters</Text>
                      <Text fontSize="2xl">{flowStats.flowStatistics.totalOutputParameters}</Text>
                    </Box>
                    <Box>
                      <Text fontWeight="bold" color="purple.600">Avg Input/Conversation</Text>
                      <Text fontSize="2xl">{flowStats.flowStatistics.averageInputParamsPerConversation}</Text>
                    </Box>
                  </SimpleGrid>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <Heading size="sm">Top 5 Input Parameters (Customer Provides)</Heading>
                </CardHeader>
                <CardBody>
                  <VStack spacing={3} align="stretch">
                    {flowStats.topInputParameters.map((param: any, index: number) => (
                      <Box key={index} p={3} border="1px" borderColor="gray.200" borderRadius="md">
                        <HStack justify="space-between">
                          <Text fontWeight="bold">{param.parameterName}</Text>
                          <Badge colorScheme="green">{param.percentage}</Badge>
                        </HStack>
                        <Text fontSize="sm" color="gray.600">Frequency: {param.frequency}</Text>
                        {param.examples.length > 0 && (
                          <Text fontSize="sm" color="gray.500" mt={1}>
                            Examples: {param.examples.join(', ')}
                          </Text>
                        )}
                      </Box>
                    ))}
                  </VStack>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <Heading size="sm">Top 5 Output Parameters (Agent Needs)</Heading>
                </CardHeader>
                <CardBody>
                  <VStack spacing={3} align="stretch">
                    {flowStats.topOutputParameters.map((param: any, index: number) => (
                      <Box key={index} p={3} border="1px" borderColor="gray.200" borderRadius="md">
                        <HStack justify="space-between">
                          <Text fontWeight="bold">{param.parameterName}</Text>
                          <Badge colorScheme="blue">{param.percentage}</Badge>
                        </HStack>
                        <Text fontSize="sm" color="gray.600">Frequency: {param.frequency}</Text>
                        {param.examples.length > 0 && (
                          <Text fontSize="sm" color="gray.500" mt={1}>
                            Examples: {param.examples.join(', ')}
                          </Text>
                        )}
                      </Box>
                    ))}
                  </VStack>
                </CardBody>
              </Card>

              {flowStats.flowStatistics.commonParameterCombinations.length > 0 && (
                <Card>
                  <CardHeader>
                    <Heading size="sm">Common Parameter Combinations</Heading>
                  </CardHeader>
                  <CardBody>
                    <VStack spacing={2} align="stretch">
                      {flowStats.flowStatistics.commonParameterCombinations.map((combo: any, index: number) => (
                        <Box key={index} p={2} bg="gray.50" borderRadius="md">
                          <Text fontSize="sm" fontWeight="bold">{combo.combination}</Text>
                          <Text fontSize="xs" color="gray.600">{combo.percentage} of conversations</Text>
                        </Box>
                      ))}
                    </VStack>
                  </CardBody>
                </Card>
              )}
            </VStack>
          ) : (
            <Box
              p={4}
              bg="gray.50"
              borderRadius="md"
              fontFamily="mono"
              fontSize="sm"
              maxH="400px"
              overflow="auto"
            >
              <pre>{JSON.stringify(selectedDetail, null, 2)}</pre>
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}; 