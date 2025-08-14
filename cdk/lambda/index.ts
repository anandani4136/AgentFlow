import { S3Handler, Context, Callback } from 'aws-lambda';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Readable } from 'stream';

const REGION = process.env.REGION!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const SCHEMA_TABLE_NAME = process.env.SCHEMA_TABLE_NAME!;
const RESULT_TABLE_NAME = process.env.RESULT_TABLE_NAME!;
const PARAMETERS_TABLE_NAME = process.env.PARAMETERS_TABLE_NAME!;
const INPUT_PARAMETERS_TABLE_NAME = process.env.INPUT_PARAMETERS_TABLE_NAME!;
const OUTPUT_PARAMETERS_TABLE_NAME = process.env.OUTPUT_PARAMETERS_TABLE_NAME!;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID!;

const s3Client = new S3Client({ region: REGION });
const dbClient = new DynamoDBClient({ region: REGION });
const bedrockClient = new BedrockRuntimeClient({ region: REGION });

interface Suggestion {
  text: string;
  level: number;
  parentPath: string[];
  confidence: number;
  context: string;
  alternativePaths?: string[][];
}

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function analyzeSuggestionContext(
  suggestion: string, 
  currentPath: string[], 
  schema: any, 
  content: string
): Suggestion {
  // Determine the level where this suggestion should be placed
  const level = currentPath.length;
  
  // Find potential parent paths by analyzing the current schema structure
  const potentialParents = findPotentialParents(schema, currentPath);
  
  // Analyze the content to determine confidence and context
  const confidence = analyzeConfidence(suggestion, content);
  const context = extractContext(suggestion, content);
  
  return {
    text: suggestion,
    level,
    parentPath: currentPath,
    confidence,
    context,
    alternativePaths: potentialParents
  };
}

function findPotentialParents(schema: any, currentPath: string[]): string[][] {
  const parents: string[][] = [];
  
  // If at root level, return all top-level intents
  if (currentPath.length === 0) {
    return Object.keys(schema).map(key => [key]);
  }
  
  // Navigate to the current level in the schema
  let currentLevel = schema;
  for (const segment of currentPath) {
    if (currentLevel[segment]) {
      currentLevel = currentLevel[segment];
    } else {
      break;
    }
  }
  
  // Find all possible parent paths at this level
  const siblings = Object.keys(currentLevel);
  for (const sibling of siblings) {
    parents.push([...currentPath, sibling]);
  }
  
  return parents;
}

function analyzeConfidence(suggestion: string, content: string): number {
  // confidence scoring based on keyword frequency
  const suggestionWords = suggestion.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();
  
  let matches = 0;
  for (const word of suggestionWords) {
    if (contentLower.includes(word)) {
      matches++;
    }
  }
  
  return Math.min(matches / suggestionWords.length, 1.0);
}

function extractContext(suggestion: string, content: string): string {
  const suggestionLower = suggestion.toLowerCase();
  const contentLower = content.toLowerCase();
  
  const index = contentLower.indexOf(suggestionLower);
  if (index === -1) {
    // look for partial matches if no exact match
    const words = suggestion.split(/\s+/);
    for (const word of words) {
      const wordIndex = contentLower.indexOf(word.toLowerCase());
      if (wordIndex !== -1) {
        const start = Math.max(0, wordIndex - 50);
        const end = Math.min(content.length, wordIndex + word.length + 50);
        return content.substring(start, end).trim();
      }
    }
    return content.substring(0, 100) + "...";
  }
  
  const start = Math.max(0, index - 50);
  const end = Math.min(content.length, index + suggestion.length + 50);
  return content.substring(start, end).trim();
}

async function classifyRecursively(
  content: string,
  schema: any,
  path: string[] = [],
  suggestions: Suggestion[] = []
): Promise<{ path: string[]; inputParams: any; outputParams: any; suggestions: Suggestion[] }> {
  const currentLevel = Object.keys(schema);
  if (currentLevel.length === 0) {
    // extract parameters automatically if leaf node
    const { inputParams, outputParams } = await extractCommonParameters(content, path);
    return { path, inputParams, outputParams, suggestions };
  } else {
    const options = currentLevel.join(', ');
    const prompt = `Given this text:\n\n${content}\n\nWhich category does it best fit: [${options}]?\nOnly respond with one category name from the list, without explanation or affirmations.\nIf none are a good fit, pick the closest, but also suggest a better label like: \"Suggested: plan cancellation\".`;
    const result = await bedrockClient.send(new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              {
                text: prompt
              }
            ],
          },
        ],
      }),
    }));

    const responseJson = JSON.parse(Buffer.from(result.body!).toString());
    let rawText = responseJson.output?.message?.content?.[0]?.text?.trim();
    let choice: string | undefined = undefined;
    let suggestion: string | undefined = undefined;

    const suggestMatch = rawText?.match(/suggested:?\s*([a-zA-Z0-9_\s]+)/i);
    if (suggestMatch) {
      suggestion = suggestMatch[1].trim();
    }

    const fallback = currentLevel.find(key => rawText?.toLowerCase().includes(key.toLowerCase()));
    if (fallback) choice = fallback;
    if (!choice && currentLevel.includes('other')) {
      choice = 'other';
    }
    if (!choice || !schema[choice]) {
      const enhancedSuggestions = suggestion 
        ? [...suggestions, analyzeSuggestionContext(suggestion, path, schema, content)]
        : suggestions;
      return {
        path,
        inputParams: {},
        outputParams: {},
        suggestions: enhancedSuggestions
      };
    }

    const nextNode = schema[choice];
    const enhancedSuggestions = suggestion 
      ? [...suggestions, analyzeSuggestionContext(suggestion, path, schema, content)]
      : suggestions;
    return classifyRecursively(content, nextNode, [...path, choice], enhancedSuggestions);
  }
}

async function extractCommonParameters(content: string, intentPath: string[]): Promise<{inputParams: any, outputParams: any}> {
  const inputParams: any = {};
  const outputParams: any = {};
  
  // extract input parameters (what customer provides)
  const inputPrompt = `Analyze this customer service conversation and identify information that the CUSTOMER provides to the agent.

Conversation:
${content}

Intent Path: ${intentPath.join(' → ')}

Extract information that the CUSTOMER provides such as:
- Account numbers, IDs, or references they give
- Contact information they share (phone, email, address)
- Names and personal details they provide
- Financial information they mention (amounts, balances, payments)
- Dates and times they specify
- Technical details they describe (device info, service details)
- Any other information the customer actively provides

IMPORTANT: Respond with ONLY a valid JSON object. Do not include any other text, explanations, or formatting.
If no information is provided by the customer, respond with an empty JSON object: {}

Example format:
{
  "account_number": "123456789",
  "customer_name": "John Smith",
  "phone_number": "555-123-4567",
  "payment_amount": "$150.00",
  "issue_description": "Internet not working"
}`;

  // extract output parameters (what agent needs from backend)
  const outputPrompt = `Analyze this customer service conversation and identify information that the AGENT would need to retrieve from backend systems to fulfill the customer's request.

Conversation:
${content}

Intent Path: ${intentPath.join(' → ')}

Identify information the AGENT needs to look up or retrieve such as:
- Account details and balances
- Service status and configuration
- Billing information and history
- Technical support data
- Customer profile information
- System status and availability
- Any other data the agent would need to access from databases or systems

IMPORTANT: Respond with ONLY a valid JSON object. Do not include any other text, explanations, or formatting.
If no backend data is needed, respond with an empty JSON object: {}

Example format:
{
  "account_balance": "current account balance",
  "service_status": "current service status",
  "billing_history": "recent billing history",
  "technical_ticket": "existing support ticket",
  "customer_profile": "customer account details"
}`;

  try {
    // extract input parameters
    const inputResult = await bedrockClient.send(new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              {
                text: inputPrompt
              }
            ],
          },
        ],
      }),
    }));

    const inputResponseJson = JSON.parse(Buffer.from(inputResult.body!).toString());
    const inputExtractedText = inputResponseJson.output?.message?.content?.[0]?.text?.trim();
    
    if (inputExtractedText) {
      try {
        const extractedInputParams = JSON.parse(inputExtractedText);
        if (typeof extractedInputParams === 'object' && extractedInputParams !== null) {
          Object.assign(inputParams, extractedInputParams);
        }
      } catch (parseError) {
        console.log('Failed to parse input parameters as JSON:', inputExtractedText);
        // Only use fallback if the text doesn't look like JSON
        if (!inputExtractedText.trim().startsWith('{') && !inputExtractedText.trim().startsWith('[')) {
          const fallbackParams = extractKeyValuePairs(inputExtractedText);
          Object.assign(inputParams, fallbackParams);
        } else {
          console.log('Text appears to be JSON but failed to parse, skipping input parameters');
        }
      }
    }

    // extract output parameters
    const outputResult = await bedrockClient.send(new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              {
                text: outputPrompt
              }
            ],
          },
        ],
      }),
    }));

    const outputResponseJson = JSON.parse(Buffer.from(outputResult.body!).toString());
    const outputExtractedText = outputResponseJson.output?.message?.content?.[0]?.text?.trim();
    
    if (outputExtractedText) {
      try {
        const extractedOutputParams = JSON.parse(outputExtractedText);
        if (typeof extractedOutputParams === 'object' && extractedOutputParams !== null) {
          Object.assign(outputParams, extractedOutputParams);
        }
      } catch (parseError) {
        console.log('Failed to parse output parameters as JSON:', outputExtractedText);
        // Only use fallback if the text doesn't look like JSON
        if (!outputExtractedText.trim().startsWith('{') && !outputExtractedText.trim().startsWith('[')) {
          const fallbackParams = extractKeyValuePairs(outputExtractedText);
          Object.assign(outputParams, fallbackParams);
        } else {
          console.log('Text appears to be JSON but failed to parse, skipping output parameters');
        }
      }
    }

  } catch (error) {
    console.error('Error extracting parameters:', error);
  }

  return { inputParams, outputParams };
}

function extractKeyValuePairs(text: string): any {
  const params: any = {};
  
  const patterns = [
    /(\w+)[:\s]+([^,\n]+)/g,      // key: value
    /"([^"]+)"[:\s]+"([^"]+)"/g,  // "key": "value"
    /'([^']+)'[:\s]+'([^']+)'/g,  // 'key': 'value'
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const key = match[1].toLowerCase().replace(/\s+/g, '_');
      const value = match[2].trim();
      if (value && value !== 'null' && value !== 'undefined') {
        params[key] = value;
      }
    }
  }
  
  return params;
}

function isValidParameter(paramName: string, paramValue: any): boolean {
  const invalidNames = ['json', 'object', 'array', 'null', 'undefined', 'true', 'false'];
  if (invalidNames.includes(paramName.toLowerCase())) {
    return false;
  }
  
  const invalidValues = ['{', '}', '[', ']', 'null', 'undefined', 'true', 'false', ''];
  const stringValue = String(paramValue).trim();
  if (invalidValues.includes(stringValue)) {
    return false;
  }
  
  if (stringValue.length < 2 || stringValue.length > 500) {
    return false;
  }
  
  // Filter out JSON fragments
  if (stringValue.startsWith('{') || stringValue.startsWith('[') || 
      stringValue.endsWith('}') || stringValue.endsWith(']')) {
    return false;
  }
  
  return true;
}

async function extractIntentSpecificParameters(content: string, intentPath: string[]): Promise<any> {
  const parameters: any = {};
  
  if (intentPath.length > 0) {
    // Add intent context to help with parameter interpretation
    const intentContext = intentPath.join('_');
    parameters.intent_context = intentContext;
  }
  
  return parameters;
}

export const handler: S3Handler = async (event, context: Context, callback: Callback) => {
  let transcriptId: string;
  let key: string = '';

  // Support S3-triggered or direct-invoke
  if ((event as any).rescan && (event as any).transcriptId) {
    transcriptId = (event as any).transcriptId;
    const possiblePrefixes = ['incoming/', 'batch-1/', 'transcripts/'];
    let found = false;
    
    for (const prefix of possiblePrefixes) {
      try {
        const list = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix }));
        const match = list.Contents?.find(obj => obj.Key?.includes(transcriptId));
        if (match?.Key) {
          key = match.Key;
          found = true;
          console.log(`Found transcript ${transcriptId} in S3 key: ${key}`);
          break;
        }
      } catch (error) {
        console.log(`No files found in prefix ${prefix}`);
      }
    }
    
    if (!found) {
      throw new Error(`Transcript file for ID '${transcriptId}' not found in S3. Checked prefixes: ${possiblePrefixes.join(', ')}`);
    }
  } else {
    const record = event.Records[0];
    key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    transcriptId = key.split('/').pop()?.split('.')[0] || `transcript-${Date.now()}`;
  }

  console.log(`Processing transcript: ${transcriptId} from S3 key: ${key}`);

  const s3Data = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  const transcript = await streamToString(s3Data.Body as Readable);

  const schemaResp = await dbClient.send(new GetItemCommand({
    TableName: SCHEMA_TABLE_NAME,
    Key: { schemaId: { S: 'default' } },
  }));

  const schemaJSON = schemaResp.Item?.schema?.S;
  if (!schemaJSON) throw new Error('Schema not found');
  const schema = JSON.parse(schemaJSON);

  const { path, inputParams, outputParams, suggestions } = await classifyRecursively(transcript, schema);

  await dbClient.send(new PutItemCommand({
    TableName: RESULT_TABLE_NAME,
    Item: {
      transcriptId: { S: transcriptId },
      intentPath: { S: JSON.stringify(path) },
      inputParams: { S: JSON.stringify(inputParams) },
      outputParams: { S: JSON.stringify(outputParams) },
      suggestions: suggestions.length > 0 ? { S: JSON.stringify(suggestions) } : { NULL: true }
    }
  }));

  for (const [paramName, paramValue] of Object.entries(inputParams)) {
    if (paramValue && isValidParameter(paramName, paramValue)) {
      await dbClient.send(new PutItemCommand({
        TableName: INPUT_PARAMETERS_TABLE_NAME,
        Item: {
          transcriptId: { S: transcriptId },
          parameterName: { S: paramName },
          parameterValue: { S: String(paramValue) },
          intentPath: { S: JSON.stringify(path) },
          extractedAt: { S: new Date().toISOString() }
        }
      }));
    }
  }

  for (const [paramName, paramValue] of Object.entries(outputParams)) {
    if (paramValue && isValidParameter(paramName, paramValue)) {
      await dbClient.send(new PutItemCommand({
        TableName: OUTPUT_PARAMETERS_TABLE_NAME,
        Item: {
          transcriptId: { S: transcriptId },
          parameterName: { S: paramName },
          parameterValue: { S: String(paramValue) },
          intentPath: { S: JSON.stringify(path) },
          extractedAt: { S: new Date().toISOString() }
        }
      }));
    }
  }

  console.log(`Processed ${key}: ${path.join(' → ')}`);
  console.log(`Extracted ${Object.keys(inputParams).length} input parameters and ${Object.keys(outputParams).length} output parameters`);
  
  if (Object.keys(inputParams).length > 0) {
    console.log('Input parameters:', JSON.stringify(inputParams, null, 2));
  }
  if (Object.keys(outputParams).length > 0) {
    console.log('Output parameters:', JSON.stringify(outputParams, null, 2));
  }
};
