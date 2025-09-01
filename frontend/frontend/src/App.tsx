import { useEffect, useState } from 'react';
import {
  ChakraProvider,
  Box,
  Container,
  SimpleGrid,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from '@chakra-ui/react';
import theme from './theme';
import { SchemaEditor } from './components/SchemaEditor';
import { Header } from './components/Header';
import { StatusAlert } from './components/StatusAlert';
import { SchemaCard } from './components/SchemaCard';
import { SuggestionsCard } from './components/SuggestionsCard';
import { VisualizationCard } from './components/VisualizationCard';
import { SettingsModal } from './components/SettingsModal';
import { DetailModal } from './components/DetailModal';
import { ConversationTester } from './components/ConversationTester';
import { FAQManager } from './components/FAQManager';
import { IntentDebugPanel } from './components/IntentDebugPanel';
import { HuggingFaceFineTuner } from './components/HuggingFaceFineTuner';

interface TranscriptResult {
  intentPath: string;
  parameters: string;
  suggestions: string[];
}

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

interface SankeyData {
  nodes: Array<{ id: string }>;
  links: Array<{ source: string; target: string; value: number }>;
}

function App() {
  const [schemaText, setSchemaText] = useState('');
  const [schemaObject, setSchemaObject] = useState<Record<string, any>>({});
  const [suggestions, setSuggestions] = useState<StructuredSuggestion[]>([]);
  const [sankeyData, setSankeyData] = useState<SankeyData>({ nodes: [], links: [] });
  const [rescanInProgress, setRescanInProgress] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<unknown | null>(null);
  const [flowStats, setFlowStats] = useState<any>(null);
  const [isLoadingFlowStats, setIsLoadingFlowStats] = useState(false);
  const [apiUrl, setApiUrl] = useState(() => {
    return localStorage.getItem('apiUrl') || 'https://6etx7s0y5l.execute-api.us-east-1.amazonaws.com/prod';
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState(apiUrl);
  const [isSchemaEditorOpen, setIsSchemaEditorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const bgColor = useColorModeValue('gray.50', 'gray.900');

  useEffect(() => {
    fetchTranscripts();
    fetchSchema();
  }, [apiUrl]);

  const fetchSchema = async () => {
    try {
      const response = await fetch(`${apiUrl}/schema`);
      if (response.ok) {
        const data = await response.json();
        if (data.schema) {
          setSchemaText(JSON.stringify(data.schema, null, 2));
          setSchemaObject(data.schema);
        }
      } else if (response.status === 404) {
        console.log('No existing schema found');
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching schema:', error);
    }
  };

  const handleSchemaChange = (newSchema: Record<string, any>) => {
    setSchemaObject(newSchema);
    setSchemaText(JSON.stringify(newSchema, null, 2));
  };

  const fetchTranscripts = async () => {
    setIsLoading(true);
    setApiError(null);
    
    try {
      const response = await fetch(`${apiUrl}/transcripts`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      setSuggestions(data.suggestions || []);
      setSankeyData(buildSankeyData(data.results || []));
    } catch (error) {
      console.error('Error fetching transcripts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setApiError(`Failed to fetch transcripts: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSankeyClick = async (nodeOrLink: any) => {
    const nodeId = nodeOrLink.id || nodeOrLink.source?.id || nodeOrLink.target?.id;
    
    if (!nodeId) {
      return;
    }

    try {
      const results = await fetch(`${apiUrl}/transcripts`);
      if (!results.ok) {
        throw new Error(`HTTP error! status: ${results.status}`);
      }

      const data = await results.json();
      const matchingPaths = data.results
        ?.map((r: any) => {
          try {
            return JSON.parse(r.intentPath);
          } catch (parseError) {
            console.warn('Failed to parse intent path:', r.intentPath);
            return null;
          }
        })
        .filter((path: string[] | null) => path && path.includes(nodeId))
        .map((path: string[]) => path.join(' → '))
        .filter((path: string, index: number, arr: string[]) => arr.indexOf(path) === index) || [];

      if (matchingPaths.length === 0) {
        return;
      }

      const intentPath = matchingPaths[0];
      
      setIsLoadingFlowStats(true);
      try {
        const response = await fetch(`${apiUrl}/flowStats?intentPath=${encodeURIComponent(intentPath)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const flowData = await response.json();
        setFlowStats(flowData);
        setSelectedDetail({
          type: 'flow',
          intentPath,
          nodeId,
          data: flowData
        });
      } catch (flowError) {
        console.error('Error fetching flow stats:', flowError);
      } finally {
        setIsLoadingFlowStats(false);
      }
    } catch (error) {
      console.error('Error fetching transcript data:', error);
    }
  };

  const buildSankeyData = (results: TranscriptResult[]): SankeyData => {
    const nodesSet = new Set<string>();
    const linksMap = new Map<string, number>();

    results.forEach(r => {
      try {
        const path = JSON.parse(r.intentPath);
        for (let i = 0; i < path.length - 1; i++) {
          const from = path[i];
          const to = path[i + 1];
          nodesSet.add(from);
          nodesSet.add(to);
          const key = `${from}|${to}`;
          linksMap.set(key, (linksMap.get(key) || 0) + 1);
        }
      } catch {
        console.warn('Invalid intent path:', r.intentPath);
      }
    });

    const nodes = Array.from(nodesSet).map(id => ({ id }));
    const links = Array.from(linksMap.entries()).map(([k, v]) => {
      const [source, target] = k.split('|');
      return { source, target, value: v };
    });

    return { nodes, links };
  };

  const updateSchema = async () => {
    if (!apiUrl) {
      return;
    }

    if (!schemaText.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(schemaText);
      const res = await fetch(`${apiUrl}/updateSchema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: parsed })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
      }
    } catch (error) {
      console.error('Error updating schema:', error);
    }
  };

  const rescanAll = async () => {
    if (!apiUrl) {
      return;
    }

    setRescanInProgress(true);
    try {
      const res = await fetch(`${apiUrl}/rescanAll`, {
        method: 'POST'
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
      }
      
      setTimeout(() => {
        fetchTranscripts();
      }, 2000);
    } catch (error) {
      console.error('Error rescanning transcripts:', error);
    } finally {
      setRescanInProgress(false);
    }
  };

  const saveApiUrl = () => {
    setApiUrl(tempApiUrl);
    localStorage.setItem('apiUrl', tempApiUrl);
    setIsSettingsOpen(false);
    setApiError(null);
  };

  const insertSuggestionWithContext = (suggestion: StructuredSuggestion): string => {
    try {
      const json = JSON.parse(schemaText || '{}');
      const fullPath = [...suggestion.parentPath, suggestion.text];
      
      let cursor = json;
      for (const segment of fullPath) {
        if (typeof cursor[segment] !== 'object' || cursor[segment] === null) {
          cursor[segment] = {};
        }
        cursor = cursor[segment];
      }
      
      return JSON.stringify(json, null, 2);
    } catch {
      return schemaText;
    }
  };

  const handleAddSuggestion = (suggestion: StructuredSuggestion) => {
    const newSchema = insertSuggestionWithContext(suggestion);
    setSchemaText(newSchema);
  };

  return (
    <ChakraProvider theme={theme}>
      <Box minH="100vh" bg={bgColor}>
        <Header onSettingsClick={() => setIsSettingsOpen(true)} />

        <Container maxW="7xl" py={8}>
          <StatusAlert apiError={apiError} isLoading={isLoading} />

          <Tabs variant="enclosed" colorScheme="blue" mb={8}>
            <TabList>
              <Tab>Conversation Testing</Tab>
              <Tab>FAQ Management</Tab>
              <Tab>Intent Debug</Tab>
              <Tab>Fine-tuning</Tab>
              <Tab>Transcript Analysis</Tab>
            </TabList>

            <TabPanels>
              {/* Conversation Testing Tab */}
              <TabPanel>
                <SimpleGrid columns={{ base: 1, lg: 1 }} spacing={8}>
                  <ConversationTester apiUrl={apiUrl} />
                </SimpleGrid>
              </TabPanel>

              {/* FAQ Management Tab */}
              <TabPanel>
                <SimpleGrid columns={{ base: 1, lg: 1 }} spacing={8}>
                  <FAQManager apiUrl={apiUrl} />
                </SimpleGrid>
              </TabPanel>

              {/* Intent Debug Tab */}
              <TabPanel>
                <SimpleGrid columns={{ base: 1, lg: 1 }} spacing={8}>
                  <IntentDebugPanel apiUrl={apiUrl} />
                </SimpleGrid>
              </TabPanel>

              <TabPanel>
                <SimpleGrid columns={{ base: 1, lg: 1 }} spacing={8}>
                  <HuggingFaceFineTuner apiUrl={apiUrl} />
                </SimpleGrid>
              </TabPanel>

              <TabPanel>
                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={8} mb={8}>
                  <SchemaCard
                    schemaText={schemaText}
                    schemaObject={schemaObject}
                    onSchemaTextChange={setSchemaText}
                    onUpdateSchema={updateSchema}
                    onRescanAll={rescanAll}
                    onOpenVisualEditor={() => setIsSchemaEditorOpen(true)}
                    isLoading={isLoading}
                    rescanInProgress={rescanInProgress}
                  />

                  <SuggestionsCard
                    suggestions={suggestions}
                    isLoading={isLoading}
                    onAddSuggestion={handleAddSuggestion}
                  />
                </SimpleGrid>

                <VisualizationCard
                  sankeyData={sankeyData}
                  isLoading={isLoading}
                  onSankeyClick={handleSankeyClick}
                />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Container>

        <SchemaEditor
          schema={schemaObject}
          onSchemaChange={handleSchemaChange}
          isOpen={isSchemaEditorOpen}
          onClose={() => setIsSchemaEditorOpen(false)}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          tempApiUrl={tempApiUrl}
          onTempApiUrlChange={setTempApiUrl}
          onSave={saveApiUrl}
        />

        <DetailModal
          isOpen={!!selectedDetail}
          onClose={() => setSelectedDetail(null)}
          selectedDetail={selectedDetail}
          flowStats={flowStats}
          isLoadingFlowStats={isLoadingFlowStats}
        />
      </Box>
    </ChakraProvider>
  );
}

export default App;