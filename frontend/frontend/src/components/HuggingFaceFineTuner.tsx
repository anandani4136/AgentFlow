import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Button,
  Text,
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Textarea,
  useToast,
  Spinner,
  IconButton,
  Tooltip,
  SimpleGrid,
} from '@chakra-ui/react';
import { 
  TriangleDownIcon as PlayIcon, 
  CheckIcon, 
  TimeIcon, 
  SettingsIcon, 
  DeleteIcon,
  RepeatIcon as RefreshIcon,
  InfoIcon,
  DownloadIcon
} from '@chakra-ui/icons';

interface FineTuningConfig {
  modelName: string;
  learningRate: number;
  numEpochs: number;
  batchSize: number;
  maxLength: number;
  loraRank: number;
  loraAlpha: number;
  loraDropout: number;
}

interface TrainingJob {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  config: FineTuningConfig;
  datasetSize: number;
  startTime: string;
  endTime?: string;
  progress: number;
  currentEpoch?: number;
  totalEpochs?: number;
  message?: string;
  error?: string;
  result?: {
    modelId: string;
    trainingLoss: number;
    validationLoss: number;
    accuracy: number;
    trainingTime: number;
  };
}

interface ModelInfo {
  modelId: string;
  modelName: string;
  task: string;
  accuracy: number;
  trainingDate: string;
  isActive: boolean;
  metadata: Record<string, any>;
}

interface HuggingFaceFineTunerProps {
  apiUrl: string;
}

export const HuggingFaceFineTuner: React.FC<HuggingFaceFineTunerProps> = ({ apiUrl }) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [trainingJobs, setTrainingJobs] = useState<TrainingJob[]>([]);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isStartTrainingModalOpen, setIsStartTrainingModalOpen] = useState(false);
  const [customConfig, setCustomConfig] = useState<FineTuningConfig>({
    modelName: 'distilbert-base-uncased',
    learningRate: 0.00002,
    numEpochs: 3,
    batchSize: 16,
    maxLength: 512,
    loraRank: 16,
    loraAlpha: 32,
    loraDropout: 0.1,
  });
  const [sessionIds, setSessionIds] = useState<string>('');
  const [isStartingTraining, setIsStartingTraining] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const toast = useToast();

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  useEffect(() => {
    fetchModels();
    fetchRecommendedConfig();
  }, [apiUrl]);

  // Poll for training job updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (trainingJobs.some(job => job.status === 'running')) {
        updateTrainingJobs();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [trainingJobs]);

  const fetchModels = async () => {
    try {
      const response = await fetch(`${apiUrl}/conversation/finetune/models`);
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  };

  const refreshTrainingJobs = async () => {
    // For now, just refresh models - implement actual training job refresh later
    await fetchModels();
    toast({
      title: 'Refreshed',
      description: 'Training jobs and models refreshed',
      status: 'success',
      duration: 2000,
      isClosable: true,
    });
  };

  const fetchRecommendedConfig = async () => {
    try {
      const response = await fetch(`${apiUrl}/conversation/finetune/config/recommended`);
      if (response.ok) {
        const data = await response.json();
        // Update customConfig with recommended values
        setCustomConfig(data.config || customConfig);
      }
    } catch (error) {
      console.error('Error fetching recommended config:', error);
    }
  };



  const updateTrainingJobs = async () => {
    // Update each running job
    for (const job of trainingJobs) {
      if (job.status === 'running') {
        try {
          const response = await fetch(`${apiUrl}/conversation/finetune/status/${job.id}`);
          if (response.ok) {
            const updatedJob = await response.json();
            
            // Check if job is completed or failed
            if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
              // Refresh models list when training completes
              fetchModels();
            }
            
            setTrainingJobs(prev => 
              prev.map(j => j.id === job.id ? updatedJob : j)
            );
          }
        } catch (error) {
          console.error(`Error updating job ${job.id}:`, error);
        }
      }
    }
  };

  const startTraining = async () => {
    if (!customConfig) return;

    setIsStartingTraining(true);
    try {
      const sessionIdList = sessionIds.split(',').map(id => id.trim()).filter(id => id);
      
      const response = await fetch(`${apiUrl}/conversation/finetune/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: customConfig,
          sessionIds: sessionIdList,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Add new job to the list
        const newJob: TrainingJob = {
          id: data.jobId,
          status: 'running',
          config: customConfig,
          datasetSize: data.trainingDataSize,
          startTime: new Date().toISOString(),
          progress: 0,
        };
        
        setTrainingJobs(prev => [...prev, newJob]);
        setIsStartTrainingModalOpen(false);
        
        toast({
          title: 'Training Started',
          description: `Fine-tuning job ${data.jobId} has started successfully`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Training Failed',
        description: `Failed to start training: ${errorMessage}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsStartingTraining(false);
    }
  };



  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'blue';
      case 'completed': return 'green';
      case 'failed': return 'red';
      case 'pending': return 'yellow';
      default: return 'gray';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Spinner size="sm" />;
      case 'completed': return <CheckIcon />;
      case 'failed': return <DeleteIcon />;
      case 'pending': return <TimeIcon />;
      default: return <InfoIcon />;
    }
  };

  const getTrainingProgress = (job: TrainingJob) => {
    if (job.status === 'completed') return 100;
    if (job.status === 'failed') return 0;
    
    // For now, show a basic progress indicator
    return job.status === 'running' ? 50 : 0;
  };

  const getTrainingStep = (job: TrainingJob) => {
    if (job.status === 'completed') return 'Training completed successfully!';
    if (job.status === 'failed') return `Training failed: ${job.error || 'Unknown error'}`;
    
    // Extract current step from job message or status
    if (job.message) {
      return job.message;
    }
    
    return 'Training in progress...';
  };

  const testModel = async (modelId: string, task: string) => {
    try {
      // Get test input from user or use default
      const testInput = prompt(`Enter test input for ${task} (or press OK for default):`, 
        task === 'intent_classification' 
          ? "I need help with my account balance" 
          : "Generate a helpful response for a customer inquiry"
      );
      
      if (!testInput) return; // User cancelled
      
      const response = await fetch(`${apiUrl}/conversation/testing/inference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelId,
          input: testInput,
          task,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Format the result for better display
        let resultText = '';
        if (result.intent) {
          resultText = `Intent: ${result.intent} (${(result.confidence * 100).toFixed(1)}%)`;
          if (result.alternatives && result.alternatives.length > 0) {
            resultText += ` | Alternatives: ${result.alternatives.map((alt: any) => 
              `${alt.intent} (${(alt.confidence * 100).toFixed(1)}%)`
            ).join(', ')}`;
          }
        } else {
          resultText = JSON.stringify(result);
        }
        
        toast({
          title: 'Model Test Result',
          description: resultText,
          status: 'success',
          duration: 8000,
          isClosable: true,
        });
        
        // Also log the full result to console for debugging
        console.log('Model test result:', result);
        
        // Store the test result
        const testResult = {
          timestamp: new Date().toISOString(),
          modelId,
          task,
          input: testInput,
          result,
        };
        setTestResults(prev => [testResult, ...prev.slice(0, 9)]); // Keep last 10 results
      } else {
        const errorData = await response.json();
        throw new Error(`Model test failed: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      toast({
        title: 'Model Test Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const compareModels = async () => {
    try {
      const intentModels = models.filter(m => m.task === 'intent_classification');
      if (intentModels.length < 2) {
        toast({
          title: 'Not Enough Models',
          description: 'Need at least 2 intent classification models to compare',
          status: 'warning',
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      // Get test inputs from user or use defaults
      const testInputs = prompt(`Enter test inputs (comma-separated, or press OK for default):`, 
        "I need help with my account balance, My internet is not working, How do I pay my bill"
      );
      
      if (!testInputs) return; // User cancelled
      
      const testData = testInputs.split(',').map(input => input.trim()).filter(input => input);
      const modelIds = intentModels.slice(0, 2).map(m => m.modelId);
      
      const response = await fetch(`${apiUrl}/conversation/testing/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelIds,
          testData,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Format comparison results for better display
        let comparisonText = 'Comparison completed! ';
        if (result && Array.isArray(result)) {
          comparisonText += `${result.length} models tested. Check console for details.`;
        } else if (result) {
          comparisonText += 'Results available. Check console for details.';
        }
        
        toast({
          title: 'Model Comparison Result',
          description: comparisonText,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
        console.log('Model comparison result:', result);
      } else {
        const errorData = await response.json();
        throw new Error(`Model comparison failed: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      toast({
        title: 'Model Comparison Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const getPerformanceSummary = async () => {
    try {
      const response = await fetch(`${apiUrl}/conversation/testing/performance`);
      if (response.ok) {
        const summary = await response.json();
        toast({
          title: 'Performance Summary',
          description: `Total Models: ${summary.totalModels}, Avg Accuracy: ${(summary.averageAccuracy * 100).toFixed(1)}%`,
          status: 'info',
          duration: 5000,
          isClosable: true,
        });
        console.log('Performance summary:', summary);
      } else {
        throw new Error('Failed to get performance summary');
      }
    } catch (error) {
      toast({
        title: 'Performance Summary Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const toggleModelActive = async (modelId: string) => {
    // For now, just show a toast - implement actual toggle logic later
    toast({
      title: 'Toggle Model Status',
      description: `Model ${modelId} status toggle not implemented yet`,
      status: 'info',
      duration: 3000,
      isClosable: true,
    });
  };

  const deleteModel = async (modelId: string) => {
    // For now, just show a toast - implement actual delete logic later
    toast({
      title: 'Delete Model',
      description: `Model ${modelId} deletion not implemented yet`,
      status: 'info',
      duration: 3000,
      isClosable: true,
    });
  };

  const testAllModels = async () => {
    try {
      if (models.length === 0) {
        toast({
          title: 'No Models Available',
          description: 'No models to test. Train some models first!',
          status: 'warning',
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      // Get test input from user or use default
      const testInput = prompt('Enter test input for all models (or press OK for default):', 
        'I need help with my account balance'
      );
      
      if (!testInput) return; // User cancelled

      toast({
        title: 'Testing All Models',
        description: `Testing ${models.length} models with input: "${testInput}"`,
        status: 'info',
        duration: 3000,
        isClosable: true,
      });

      // Test each model
      const results = [];
      for (const model of models) {
        try {
          const response = await fetch(`${apiUrl}/conversation/testing/inference`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              modelId: model.modelId,
              input: testInput,
              task: model.task,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            results.push({
              modelId: model.modelId,
              modelName: model.modelName,
              task: model.task,
              result,
            });
          }
        } catch (error) {
          console.error(`Error testing model ${model.modelId}:`, error);
        }
      }

      // Show summary
      toast({
        title: 'All Models Tested',
        description: `Successfully tested ${results.length}/${models.length} models. Check console for details.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      console.log('All models test results:', results);
    } catch (error) {
      toast({
        title: 'Test All Models Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const viewModelDetails = (model: ModelInfo) => {
    const details = `
Model Details:
- ID: ${model.modelId}
- Name: ${model.modelName}
- Task: ${model.task}
- Accuracy: ${(model.accuracy * 100).toFixed(1)}%
- Training Date: ${new Date(model.trainingDate).toLocaleString()}
- Status: ${model.isActive ? 'Active' : 'Inactive'}
- Base Model: ${model.metadata?.baseModel || 'Unknown'}
- Fine-tuning Method: ${model.metadata?.fineTuningMethod || 'Unknown'}
- Description: ${model.metadata?.description || 'No description available'}

Training Config:
${model.metadata?.trainingConfig ? JSON.stringify(model.metadata.trainingConfig, null, 2) : 'No training config available'}

Results:
${model.metadata?.result ? JSON.stringify(model.metadata.result, null, 2) : 'No results available'}
    `;
    
    alert(details);
    console.log('Model details:', model);
  };

  const exportTestResults = () => {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        models: models.map(model => ({
          modelId: model.modelId,
          modelName: model.modelName,
          task: model.task,
          accuracy: model.accuracy,
          trainingDate: model.trainingDate,
          isActive: model.isActive,
          metadata: model.metadata,
        })),
        trainingJobs: trainingJobs.map(job => ({
          id: job.id,
          status: job.status,
          startTime: job.startTime,
          endTime: job.endTime,
          progress: job.progress,
          result: job.result,
        })),
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `huggingface-finetuner-export-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      
      toast({
        title: 'Export Successful',
        description: 'Model and training data exported successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  return (
    <VStack spacing={6} align="stretch">
      {/* Header */}
      <Flex justify="space-between" align="center">
        <HStack spacing={3} align="center" flexWrap="wrap">
          <Button
            leftIcon={<SettingsIcon />}
            onClick={() => setIsConfigModalOpen(true)}
            variant="outline"
          >
            View Config
          </Button>
          <Button
            leftIcon={<PlayIcon />}
            onClick={() => setIsStartTrainingModalOpen(true)}
            colorScheme="blue"
          >
            Start Training
          </Button>
          <Button
            leftIcon={<RefreshIcon />}
            onClick={compareModels}
            variant="outline"
            colorScheme="purple"
          >
            Compare Models
          </Button>
          <Button
            leftIcon={<InfoIcon />}
            onClick={getPerformanceSummary}
            variant="outline"
            colorScheme="teal"
          >
            Performance
          </Button>
          <Button
            leftIcon={<PlayIcon />}
            onClick={testAllModels}
            variant="outline"
            colorScheme="orange"
          >
            Test All Models
          </Button>
          <Button
            leftIcon={<DownloadIcon />}
            onClick={exportTestResults}
            variant="outline"
            colorScheme="purple"
          >
            Export Results
          </Button>
          <Button
            leftIcon={<RefreshIcon />}
            onClick={refreshTrainingJobs}
            variant="ghost"
          >
            Refresh
          </Button>
        </HStack>
      </Flex>

      {/* Stats Cards */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        <Stat>
          <StatLabel>Total Models</StatLabel>
          <StatNumber>{models.length}</StatNumber>
          <StatHelpText>Fine-tuned models available</StatHelpText>
        </Stat>
        <Stat>
          <StatLabel>Active Models</StatLabel>
          <StatNumber>{models.filter(m => m.isActive).length}</StatNumber>
          <StatHelpText>Currently in use</StatHelpText>
        </Stat>
        <Stat>
          <StatLabel>Training Jobs</StatLabel>
          <StatNumber>{trainingJobs.length}</StatNumber>
          <StatHelpText>Total jobs created</StatHelpText>
        </Stat>
      </SimpleGrid>

      {/* Training Jobs */}
      <Card>
        <CardHeader>
          <Heading size="md">Training Jobs</Heading>
        </CardHeader>
        <CardBody>
          {trainingJobs.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={4}>
              No training jobs yet. Start your first fine-tuning job!
            </Text>
          ) : (
            <VStack spacing={4} align="stretch">
              {trainingJobs.map((job) => (
                <Box
                  key={job.id}
                  p={4}
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="md"
                  bg={bgColor}
                >
                  <Flex justify="space-between" align="center" mb={3}>
                    <HStack spacing={3}>
                      <Badge colorScheme={getStatusColor(job.status)}>
                        {getStatusIcon(job.status)} {job.status}
                      </Badge>
                      <Text fontWeight="bold">{job.id}</Text>
                    </HStack>
                    <Text fontSize="sm" color="gray.500">
                      {new Date(job.startTime).toLocaleString()}
                    </Text>
                  </Flex>
                  
                  {/* Training Progress */}
                  <VStack spacing={2} align="stretch" mt={3}>
                    <Progress value={getTrainingProgress(job)} colorScheme="blue" />
                    <Text fontSize="sm" color="gray.600">
                      {getTrainingStep(job)}
                    </Text>
                    
                    {/* Show epoch progress if available */}
                    {job.status === 'running' && job.currentEpoch && (
                      <Text fontSize="sm">
                        Epoch {job.currentEpoch} of {job.totalEpochs || 3}
                      </Text>
                    )}
                  </VStack>
                  
                  {job.status === 'completed' && job.result && (
                    <HStack spacing={4} mt={2}>
                      <Text fontSize="sm">Accuracy: {job.result.accuracy.toFixed(3)}</Text>
                      <Text fontSize="sm">Training Loss: {job.result.trainingLoss.toFixed(3)}</Text>
                      <Text fontSize="sm">Time: {job.result.trainingTime}s</Text>
                    </HStack>
                  )}
                </Box>
              ))}
            </VStack>
          )}
        </CardBody>
      </Card>

      {/* Models Table */}
      <Card>
        <CardHeader>
          <Heading size="md">Fine-tuned Models</Heading>
        </CardHeader>
        <CardBody>
          {models.length === 0 ? (
            <Text color="gray.500" textAlign="center" py={4}>
              No fine-tuned models available. Start training to create your first model!
            </Text>
          ) : (
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Model</Th>
                  <Th>Task</Th>
                  <Th>Accuracy</Th>
                  <Th>Training Date</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {models.map((model) => (
                  <Tr key={model.modelId}>
                    <Td>
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="bold">{model.modelName}</Text>
                        <Text fontSize="sm" color="gray.500">
                          {model.metadata?.baseModel || 'Unknown base'}
                        </Text>
                      </VStack>
                    </Td>
                    <Td>
                      <Badge variant="outline">{model.task}</Badge>
                    </Td>
                    <Td>
                      <Text color={model.accuracy >= 0.8 ? 'green.500' : model.accuracy >= 0.6 ? 'yellow.500' : 'red.500'}>
                        {(model.accuracy * 100).toFixed(1)}%
                      </Text>
                    </Td>
                    <Td>
                      <Text fontSize="sm">
                        {new Date(model.trainingDate).toLocaleDateString()}
                      </Text>
                    </Td>
                    <Td>
                      <Badge colorScheme={model.isActive ? 'green' : 'gray'}>
                        {model.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        <Tooltip label="Test model">
                          <IconButton
                            size="sm"
                            icon={<PlayIcon />}
                            onClick={() => testModel(model.modelId, model.task)}
                            aria-label="Test model"
                            colorScheme="green"
                            variant="ghost"
                          />
                        </Tooltip>
                        <Tooltip label="View model details">
                          <IconButton
                            size="sm"
                            icon={<InfoIcon />}
                            onClick={() => viewModelDetails(model)}
                            aria-label="View model details"
                            colorScheme="blue"
                            variant="ghost"
                          />
                        </Tooltip>
                        <Tooltip label="Toggle active status">
                          <IconButton
                            size="sm"
                            icon={model.isActive ? <CheckIcon /> : <TimeIcon />}
                            onClick={() => toggleModelActive(model.modelId)}
                            aria-label="Toggle model status"
                          />
                        </Tooltip>
                        <Tooltip label="Delete model">
                          <IconButton
                            size="sm"
                            icon={<DeleteIcon />}
                            onClick={() => deleteModel(model.modelId)}
                            aria-label="Delete model"
                            colorScheme="red"
                            variant="ghost"
                          />
                        </Tooltip>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <Heading size="md">Recent Test Results</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={3} align="stretch">
              {testResults.map((testResult, index) => (
                <Box
                  key={index}
                  p={3}
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="md"
                  bg={bgColor}
                >
                  <Flex justify="space-between" align="center" mb={2}>
                    <Text fontSize="sm" color="gray.500">
                      {new Date(testResult.timestamp).toLocaleString()}
                    </Text>
                    <Badge variant="outline">{testResult.task}</Badge>
                  </Flex>
                  <Text fontSize="sm" mb={2}>
                    <strong>Input:</strong> {testResult.input}
                  </Text>
                  <Text fontSize="sm">
                    <strong>Result:</strong> {testResult.result.intent ? 
                      `${testResult.result.intent} (${(testResult.result.confidence * 100).toFixed(1)}%)` : 
                      JSON.stringify(testResult.result)
                    }
                  </Text>
                </Box>
              ))}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* Configuration Modal */}
      <Modal isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Fine-tuning Configuration</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Alert status="info">
                <AlertIcon />
                Current recommended configuration for optimal results
              </Alert>
              
              <SimpleGrid columns={2} spacing={4}>
                <FormControl>
                  <FormLabel>Base Model</FormLabel>
                  <Input value={customConfig.modelName} isReadOnly />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Learning Rate</FormLabel>
                  <NumberInput value={customConfig.learningRate} precision={5}>
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                
                <FormControl>
                  <FormLabel>Epochs</FormLabel>
                  <NumberInput value={customConfig.numEpochs} min={1} max={100}>
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                
                <FormControl>
                  <FormLabel>Batch Size</FormLabel>
                  <NumberInput value={customConfig.batchSize} min={1} max={128}>
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                
                <FormControl>
                  <FormLabel>LoRA Rank</FormLabel>
                  <NumberInput value={customConfig.loraRank} min={1} max={256}>
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
                
                <FormControl>
                  <FormLabel>LoRA Alpha</FormLabel>
                  <NumberInput value={customConfig.loraAlpha} min={1} max={256}>
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
              </SimpleGrid>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => setIsConfigModalOpen(false)}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Start Training Modal */}
      <Modal isOpen={isStartTrainingModalOpen} onClose={() => setIsStartTrainingModalOpen(false)} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Start Fine-tuning Job</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Alert status="info">
                <AlertIcon />
                Start a new fine-tuning job with the current configuration
              </Alert>
              


              <FormControl>
                <FormLabel>Session IDs (comma-separated)</FormLabel>
                <Textarea
                  value={sessionIds}
                  onChange={(e) => setSessionIds(e.target.value)}
                  placeholder="Enter session IDs to use for training data, or leave empty for default"
                  rows={3}
                />
                <Text fontSize="sm" color="gray.500">
                  Leave empty to use existing transcript data from DynamoDB
                </Text>
              </FormControl>
              
              <Box p={4} border="1px solid" borderColor={borderColor} borderRadius="md" bg="gray.50">
                <Text fontWeight="bold" mb={2}>Configuration Summary:</Text>
                <Text fontSize="sm">Model: {customConfig.modelName}</Text>
                <Text fontSize="sm">Epochs: {customConfig.numEpochs}</Text>
                <Text fontSize="sm">Learning Rate: {customConfig.learningRate}</Text>
                <Text fontSize="sm">LoRA Rank: {customConfig.loraRank}</Text>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setIsStartTrainingModalOpen(false)}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={startTraining}
              isLoading={isStartingTraining}
              loadingText="Starting..."
            >
              Start Training
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};
