import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, ScanCommand, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

interface Suggestion {
  text: string;
  level: number;
  parentPath: string[];
  confidence: number;
  context: string;
  alternativePaths?: string[][];
}

interface AggregatedSuggestion {
  text: string;
  level: number;
  parentPath: string[];
  confidence: number;
  context: string;
  alternativePaths?: string[][];
  frequency: number;
  examples: string[];
}

const REGION = process.env.REGION || 'us-east-1';
const SCHEMA_TABLE_NAME = process.env.SCHEMA_TABLE_NAME!;
const RESULT_TABLE_NAME = process.env.RESULT_TABLE_NAME!;
const PARAMETERS_TABLE_NAME = process.env.PARAMETERS_TABLE_NAME!;
const INPUT_PARAMETERS_TABLE_NAME = process.env.INPUT_PARAMETERS_TABLE_NAME!;
const OUTPUT_PARAMETERS_TABLE_NAME = process.env.OUTPUT_PARAMETERS_TABLE_NAME!;
const CLASSIFIER_FUNCTION_NAME = process.env.CLASSIFIER_FUNCTION_NAME || 'ClassifierFunction';

const dbClient = new DynamoDBClient({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });

function aggregateSuggestions(results: any[]): AggregatedSuggestion[] {
  const suggestionMap = new Map<string, AggregatedSuggestion>();
  
  for (const result of results) {
    if (!result.suggestions) continue;
    
    const suggestions = Array.isArray(result.suggestions) 
      ? result.suggestions 
      : [result.suggestions];
    
    for (const suggestion of suggestions) {
      let structuredSuggestion: Suggestion;
      
      if (typeof suggestion === 'string') {
        structuredSuggestion = {
          text: suggestion,
          level: 0,
          parentPath: [],
          confidence: 0.5,
          context: '',
        };
      } else {
        structuredSuggestion = suggestion;
      }
      
      const key = `${structuredSuggestion.text}-${structuredSuggestion.level}-${structuredSuggestion.parentPath.join('|')}`;
      
      if (suggestionMap.has(key)) {
        const existing = suggestionMap.get(key)!;
        existing.frequency++;
        if (structuredSuggestion.context && !existing.examples.includes(structuredSuggestion.context)) {
          existing.examples.push(structuredSuggestion.context);
        }
        existing.confidence = Math.max(existing.confidence, structuredSuggestion.confidence);
      } else {
        suggestionMap.set(key, {
          ...structuredSuggestion,
          frequency: 1,
          examples: structuredSuggestion.context ? [structuredSuggestion.context] : []
        });
      }
    }
  }
  
  return Array.from(suggestionMap.values())
    .sort((a, b) => {
      if (b.frequency !== a.frequency) {
        return b.frequency - a.frequency;
      }
      return b.confidence - a.confidence;
    });
}

function analyzeParameterStats(parameters: any[]): any {
  const stats = {
    parameterFrequency: {} as Record<string, number>,
    intentParameterFrequency: {} as Record<string, Record<string, number>>,
    parameterValueExamples: {} as Record<string, string[]>,
    intentParameterMapping: {} as Record<string, string[]>
  };

  for (const param of parameters) {
    const paramName = param.parameterName;
    const intentPath = param.intentPath.join(' → ');
    
    stats.parameterFrequency[paramName] = (stats.parameterFrequency[paramName] || 0) + 1;
    
    // Count parameter frequency by intent
    if (!stats.intentParameterFrequency[intentPath]) {
      stats.intentParameterFrequency[intentPath] = {};
    }
    stats.intentParameterFrequency[intentPath][paramName] = 
      (stats.intentParameterFrequency[intentPath][paramName] || 0) + 1;
    
    if (!stats.parameterValueExamples[paramName]) {
      stats.parameterValueExamples[paramName] = [];
    }
    if (param.parameterValue && !stats.parameterValueExamples[paramName].includes(param.parameterValue)) {
      stats.parameterValueExamples[paramName].push(param.parameterValue);
    }
    
    // map intents to parameters
    if (!stats.intentParameterMapping[intentPath]) {
      stats.intentParameterMapping[intentPath] = [];
    }
    if (!stats.intentParameterMapping[intentPath].includes(paramName)) {
      stats.intentParameterMapping[intentPath].push(paramName);
    }
  }

  return stats;
}

function getTopParameters(parameters: any[], limit: number = 5): any[] {
  const frequency: Record<string, number> = {};
  const examples: Record<string, string[]> = {};
  
  // Count frequency and collect examples
  for (const param of parameters) {
    const paramName = param.parameterName;
    if (paramName) {
      frequency[paramName] = (frequency[paramName] || 0) + 1;
      
      if (!examples[paramName]) {
        examples[paramName] = [];
      }
      if (param.parameterValue && !examples[paramName].includes(param.parameterValue)) {
        examples[paramName].push(param.parameterValue);
      }
    }
  }
  
  // sort frequency, return top N
  return Object.entries(frequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, limit)
    .map(([paramName, count]) => ({
      parameterName: paramName,
      frequency: count,
      percentage: ((count / parameters.length) * 100).toFixed(1) + '%',
      examples: examples[paramName]?.slice(0, 3) || [] // Top 3 examples
    }));
}

function calculateParameterCompleteness(conversations: any[]): any {
  const completeness = {
    conversationsWithInputParams: 0,
    conversationsWithOutputParams: 0,
    conversationsWithBoth: 0,
    averageInputParamsPerConversation: 0,
    averageOutputParamsPerConversation: 0
  };
  
  let totalInputParams = 0;
  let totalOutputParams = 0;
  
  for (const conv of conversations) {
    const inputParamCount = Object.keys(conv.inputParams || {}).length;
    const outputParamCount = Object.keys(conv.outputParams || {}).length;
    
    if (inputParamCount > 0) completeness.conversationsWithInputParams++;
    if (outputParamCount > 0) completeness.conversationsWithOutputParams++;
    if (inputParamCount > 0 && outputParamCount > 0) completeness.conversationsWithBoth++;
    
    totalInputParams += inputParamCount;
    totalOutputParams += outputParamCount;
  }
  
  completeness.averageInputParamsPerConversation = conversations.length > 0 ? 
    Number((totalInputParams / conversations.length).toFixed(2)) : 0;
  completeness.averageOutputParamsPerConversation = conversations.length > 0 ? 
    Number((totalOutputParams / conversations.length).toFixed(2)) : 0;
  
  return completeness;
}

function findCommonParameterCombinations(inputParams: any[], outputParams: any[]): any[] {
  const combinations: Record<string, number> = {};
  
  const inputByTranscript: Record<string, string[]> = {};
  const outputByTranscript: Record<string, string[]> = {};
  
  for (const param of inputParams) {
    if (!inputByTranscript[param.transcriptId]) {
      inputByTranscript[param.transcriptId] = [];
    }
    inputByTranscript[param.transcriptId].push(param.parameterName);
  }
  
  for (const param of outputParams) {
    if (!outputByTranscript[param.transcriptId]) {
      outputByTranscript[param.transcriptId] = [];
    }
    outputByTranscript[param.transcriptId].push(param.parameterName);
  }
  
  // find common combinations
  for (const transcriptId of Object.keys(inputByTranscript)) {
    const inputSet = inputByTranscript[transcriptId].sort().join(' + ');
    const outputSet = outputByTranscript[transcriptId]?.sort().join(' + ') || 'none';
    const combination = `${inputSet} → ${outputSet}`;
    
    combinations[combination] = (combinations[combination] || 0) + 1;
  }
  
  // return top 5 combos
  return Object.entries(combinations)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([combination, count]) => ({
      combination,
      frequency: count,
      percentage: ((count / Object.keys(inputByTranscript).length) * 100).toFixed(1) + '%'
    }));
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const commonHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };

  console.log('Event:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: commonHeaders,
      body: '',
    };
  }

  try {
    const isTranscriptsPath = event.path === '/results' || event.pathParameters?.proxy === 'results';
    
    if (event.httpMethod === 'GET' && isTranscriptsPath) {
      const results = await dbClient.send(new ScanCommand({ TableName: RESULT_TABLE_NAME }));
      const parsedResults = results.Items?.map(item => ({
        intentPath: item.intentPath?.S,
        inputParams: item.inputParams?.S,
        outputParams: item.outputParams?.S,
        suggestions: item.suggestions?.S ? JSON.parse(item.suggestions.S) : [],
      })) || [];

      const aggregatedSuggestions = aggregateSuggestions(parsedResults);

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ 
          results: parsedResults, 
          suggestions: aggregatedSuggestions,
          legacySuggestions: aggregatedSuggestions.map(s => s.text)
        }),
      };
    }

    const isSchemasPath = event.path === '/schemas' || event.pathParameters?.proxy === 'schemas';
    
    if (event.httpMethod === 'GET' && isSchemasPath) {
      const results = await dbClient.send(new ScanCommand({ TableName: SCHEMA_TABLE_NAME }));
      const schemas = results.Items?.map(item => ({
        schemaId: item.schemaId?.S,
        schema: item.schema?.S ? JSON.parse(item.schema.S) : {},
      })) || [];

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ schemas })
      };
    }
    
    if (event.httpMethod === 'POST' && isSchemasPath) {
      const body = JSON.parse(event.body || '{}');
      if (!body.schema) throw new Error('Missing schema');

      await dbClient.send(new PutItemCommand({
        TableName: SCHEMA_TABLE_NAME,
        Item: {
          schemaId: { S: 'default' },
          schema: { S: JSON.stringify(body.schema) }
        },
      }));

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ message: 'Schema updated successfully' })
      };
    }

    const isRescanAllPath = event.path === '/rescanAll' || event.pathParameters?.proxy === 'rescanAll';
    
    if (event.httpMethod === 'POST' && isRescanAllPath) {
      const results = await dbClient.send(new ScanCommand({ TableName: RESULT_TABLE_NAME }));
      const keys = results.Items?.map(item => item.transcriptId?.S).filter(Boolean) || [];

      for (const id of keys) {
        await lambdaClient.send(new InvokeCommand({
          FunctionName: CLASSIFIER_FUNCTION_NAME,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ rescan: true, transcriptId: id }))
        }));
      }

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ message: `Triggered rescan for ${keys.length} transcripts.` })
      };
    }

    const isParametersPath = event.path === '/parameters' || event.pathParameters?.proxy === 'parameters';
    
    if (event.httpMethod === 'GET' && isParametersPath) {
      const results = await dbClient.send(new ScanCommand({ TableName: PARAMETERS_TABLE_NAME }));
      const parameters = results.Items?.map(item => ({
        transcriptId: item.transcriptId?.S,
        parameterName: item.parameterName?.S,
        parameterValue: item.parameterValue?.S,
        intentPath: item.intentPath?.S ? JSON.parse(item.intentPath.S) : [],
        extractedAt: item.extractedAt?.S,
      })) || [];

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ parameters })
      };
    }

    const isParameterStatsPath = event.path === '/parameterStats' || event.pathParameters?.proxy === 'parameterStats';
    
    if (event.httpMethod === 'GET' && isParameterStatsPath) {
      const results = await dbClient.send(new ScanCommand({ TableName: PARAMETERS_TABLE_NAME }));
      const parameters = results.Items?.map(item => ({
        transcriptId: item.transcriptId?.S,
        parameterName: item.parameterName?.S,
        parameterValue: item.parameterValue?.S,
        intentPath: item.intentPath?.S ? JSON.parse(item.intentPath.S) : [],
        extractedAt: item.extractedAt?.S,
      })) || [];

      const stats = analyzeParameterStats(parameters);

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ 
          parameters,
          stats,
          totalParameters: parameters.length,
          uniqueParameterNames: Object.keys(stats.parameterFrequency).length,
          uniqueIntents: Object.keys(stats.intentParameterFrequency).length
        })
      };
    }

    const isInputParametersPath = event.path === '/inputParameters' || event.pathParameters?.proxy === 'inputParameters';
    
    if (event.httpMethod === 'GET' && isInputParametersPath) {
      const results = await dbClient.send(new ScanCommand({ TableName: INPUT_PARAMETERS_TABLE_NAME }));
      const inputParameters = results.Items?.map(item => ({
        transcriptId: item.transcriptId?.S,
        parameterName: item.parameterName?.S,
        parameterValue: item.parameterValue?.S,
        intentPath: item.intentPath?.S ? JSON.parse(item.intentPath.S) : [],
        extractedAt: item.extractedAt?.S,
      })) || [];

      const stats = analyzeParameterStats(inputParameters);

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ 
          inputParameters,
          stats,
          totalInputParameters: inputParameters.length,
          uniqueInputParameterNames: Object.keys(stats.parameterFrequency).length,
          uniqueIntents: Object.keys(stats.intentParameterFrequency).length
        })
      };
    }

    const isOutputParametersPath = event.path === '/outputParameters' || event.pathParameters?.proxy === 'outputParameters';
    
    if (event.httpMethod === 'GET' && isOutputParametersPath) {
      const results = await dbClient.send(new ScanCommand({ TableName: OUTPUT_PARAMETERS_TABLE_NAME }));
      const outputParameters = results.Items?.map(item => ({
        transcriptId: item.transcriptId?.S,
        parameterName: item.parameterName?.S,
        parameterValue: item.parameterValue?.S,
        intentPath: item.intentPath?.S ? JSON.parse(item.intentPath.S) : [],
        extractedAt: item.extractedAt?.S,
      })) || [];

      const stats = analyzeParameterStats(outputParameters);

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ 
          outputParameters,
          stats,
          totalOutputParameters: outputParameters.length,
          uniqueOutputParameterNames: Object.keys(stats.parameterFrequency).length,
          uniqueIntents: Object.keys(stats.intentParameterFrequency).length
        })
      };
    }

    const isSchemaPath = event.path === '/schema' || event.pathParameters?.proxy === 'schema';
    
    if (event.httpMethod === 'GET' && isSchemaPath) {
      try {
        const result = await dbClient.send(new GetItemCommand({
          TableName: SCHEMA_TABLE_NAME,
          Key: { schemaId: { S: 'default' } },
        }));

        if (!result.Item) {
          return {
            statusCode: 404,
            headers: commonHeaders,
            body: JSON.stringify({ error: 'Schema not found' })
          };
        }

        const schema = JSON.parse(result.Item.schema?.S || '{}');

        return {
          statusCode: 200,
          headers: commonHeaders,
          body: JSON.stringify({ schema })
        };
      } catch (error) {
        console.error('Error fetching schema:', error);
        return {
          statusCode: 500,
          headers: commonHeaders,
          body: JSON.stringify({ error: 'Failed to fetch schema' })
        };
      }
    }


    const isFlowStatsPath = event.path === '/flowStats' || event.pathParameters?.proxy === 'flowStats';
    
    if (event.httpMethod === 'GET' && isFlowStatsPath) {
      const intentPath = event.queryStringParameters?.intentPath;
      
      if (!intentPath) {
        return {
          statusCode: 400,
          headers: commonHeaders,
          body: JSON.stringify({ error: 'intentPath query parameter is required' })
        };
      }

      const inputResults = await dbClient.send(new ScanCommand({ TableName: INPUT_PARAMETERS_TABLE_NAME }));
      const inputParameters = inputResults.Items?.map(item => ({
        transcriptId: item.transcriptId?.S,
        parameterName: item.parameterName?.S,
        parameterValue: item.parameterValue?.S,
        intentPath: item.intentPath?.S ? JSON.parse(item.intentPath.S) : [],
        extractedAt: item.extractedAt?.S,
      })).filter(item => item.intentPath.join(' → ') === intentPath) || [];

      const outputResults = await dbClient.send(new ScanCommand({ TableName: OUTPUT_PARAMETERS_TABLE_NAME }));
      const outputParameters = outputResults.Items?.map(item => ({
        transcriptId: item.transcriptId?.S,
        parameterName: item.parameterName?.S,
        parameterValue: item.parameterValue?.S,
        intentPath: item.intentPath?.S ? JSON.parse(item.intentPath.S) : [],
        extractedAt: item.extractedAt?.S,
      })).filter(item => item.intentPath.join(' → ') === intentPath) || [];

      const classificationResults = await dbClient.send(new ScanCommand({ TableName: RESULT_TABLE_NAME }));
      const flowClassifications = classificationResults.Items?.map(item => ({
        transcriptId: item.transcriptId?.S,
        intentPath: item.intentPath?.S ? JSON.parse(item.intentPath.S) : [],
        inputParams: item.inputParams?.S ? JSON.parse(item.inputParams.S) : {},
        outputParams: item.outputParams?.S ? JSON.parse(item.outputParams.S) : {},
        suggestions: item.suggestions?.S ? JSON.parse(item.suggestions.S) : [],
      })).filter(item => item.intentPath.join(' → ') === intentPath) || [];

      const topInputParams = getTopParameters(inputParameters, 5);
      const topOutputParams = getTopParameters(outputParameters, 5);

      const flowStats = {
        totalConversations: flowClassifications.length,
        totalInputParameters: inputParameters.length,
        totalOutputParameters: outputParameters.length,
        uniqueInputParameterTypes: new Set(inputParameters.map(p => p.parameterName)).size,
        uniqueOutputParameterTypes: new Set(outputParameters.map(p => p.parameterName)).size,
        averageInputParamsPerConversation: flowClassifications.length > 0 ? 
          (inputParameters.length / flowClassifications.length).toFixed(2) : 0,
        averageOutputParamsPerConversation: flowClassifications.length > 0 ? 
          (outputParameters.length / flowClassifications.length).toFixed(2) : 0,
        parameterCompleteness: calculateParameterCompleteness(flowClassifications),
        commonParameterCombinations: findCommonParameterCombinations(inputParameters, outputParameters)
      };

      return {
        statusCode: 200,
        headers: commonHeaders,
        body: JSON.stringify({ 
          intentPath,
          topInputParameters: topInputParams,
          topOutputParameters: topOutputParams,
          flowStatistics: flowStats,
          sampleConversations: flowClassifications.slice(0, 3), // First 3 conversations as examples
          allInputParameters: inputParameters,
          allOutputParameters: outputParameters
        })
      };
    }

    // Handle individual schema endpoints
    const isSchemaByIdPath = event.path.match(/^\/schemas\/[^\/]+$/) || 
                            (event.pathParameters?.proxy && event.pathParameters.proxy.match(/^schemas\/[^\/]+$/));
    
    if (event.httpMethod === 'GET' && isSchemaByIdPath) {
      const schemaId = event.path.split('/').pop() || event.pathParameters?.proxy?.split('/')[1];
      
      if (!schemaId) {
        return {
          statusCode: 400,
          headers: commonHeaders,
          body: JSON.stringify({ error: 'Schema ID is required' })
        };
      }
      
      try {
        const result = await dbClient.send(new GetItemCommand({
          TableName: SCHEMA_TABLE_NAME,
          Key: { schemaId: { S: schemaId } }
        }));

        if (!result.Item) {
          return {
            statusCode: 404,
            headers: commonHeaders,
            body: JSON.stringify({ error: 'Schema not found' })
          };
        }

        const schema = {
          schemaId: result.Item.schemaId?.S,
          schema: result.Item.schema?.S ? JSON.parse(result.Item.schema.S) : {},
        };

        return {
          statusCode: 200,
          headers: commonHeaders,
          body: JSON.stringify({ schema })
        };
      } catch (error) {
        console.error('Error fetching schema:', error);
        return {
          statusCode: 500,
          headers: commonHeaders,
          body: JSON.stringify({ error: 'Failed to fetch schema' })
        };
      }
    }

    // Handle individual result endpoints
    const isResultByIdPath = event.path.match(/^\/results\/[^\/]+$/) || 
                            (event.pathParameters?.proxy && event.pathParameters.proxy.match(/^results\/[^\/]+$/));
    
    if (event.httpMethod === 'GET' && isResultByIdPath) {
      const transcriptId = event.path.split('/').pop() || event.pathParameters?.proxy?.split('/')[1];
      
      if (!transcriptId) {
        return {
          statusCode: 400,
          headers: commonHeaders,
          body: JSON.stringify({ error: 'Transcript ID is required' })
        };
      }
      
      try {
        const result = await dbClient.send(new GetItemCommand({
          TableName: RESULT_TABLE_NAME,
          Key: { transcriptId: { S: transcriptId } }
        }));

        if (!result.Item) {
          return {
            statusCode: 404,
            headers: commonHeaders,
            body: JSON.stringify({ error: 'Result not found' })
          };
        }

        const parsedResult = {
          transcriptId: result.Item.transcriptId?.S,
          intentPath: result.Item.intentPath?.S ? JSON.parse(result.Item.intentPath.S) : [],
          inputParams: result.Item.inputParams?.S ? JSON.parse(result.Item.inputParams.S) : {},
          outputParams: result.Item.outputParams?.S ? JSON.parse(result.Item.outputParams.S) : {},
          suggestions: result.Item.suggestions?.S ? JSON.parse(result.Item.suggestions.S) : [],
        };

        return {
          statusCode: 200,
          headers: commonHeaders,
          body: JSON.stringify({ result: parsedResult })
        };
      } catch (error) {
        console.error('Error fetching result:', error);
        return {
          statusCode: 500,
          headers: commonHeaders,
          body: JSON.stringify({ error: 'Failed to fetch result' })
        };
      }
    }

    return {
      statusCode: 404,
      headers: commonHeaders,
      body: JSON.stringify({ message: 'Route not found', path: event.path, proxy: event.pathParameters?.proxy })
    };
  } catch (err: any) {
    console.error('Lambda error:', err);
    return {
      statusCode: 500,
      headers: commonHeaders,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
