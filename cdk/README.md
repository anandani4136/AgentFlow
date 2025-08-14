# Bedrock Transcript Classifier

A CDK TypeScript project that sets up an AWS infrastructure for classifying and extracting parameters from conversation transcripts using Amazon Bedrock.

## Environment Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your deployment-specific values:
   ```bash
   # AWS Configuration
   REGION=us-east-1
   BUCKET_NAME=transcript-upload-bucket

   # DynamoDB Table Names
   SCHEMA_TABLE_NAME=IntentSchemaTable
   RESULT_TABLE_NAME=ParsedResultsTable
   INPUT_PARAMETERS_TABLE_NAME=InputParametersTable
   OUTPUT_PARAMETERS_TABLE_NAME=OutputParametersTable

   # Bedrock Configuration
   BEDROCK_MODEL_ID=amazon.nova-lite-v1:0

   # Batch Processing
   BATCH_NAME=batch-1

   # Schema Configuration
   SCHEMA_ID=default

   # API Gateway Configuration
   CLASSIFIER_FUNCTION_NAME=BedrockTranscriptClassifierStack-ClassifierFunction
   ```

## Architecture

This project sets up the following AWS resources:
1. **S3 bucket** for transcript uploads with automatic triggering
2. **Four DynamoDB tables**:
   - `IntentSchemaTable` - Stores hierarchical intent classification schemas
   - `ParsedResultsTable` - Stores classified transcript results
   - `InputParametersTable` - Stores customer-provided parameters (account numbers, passwords, etc.)
   - `OutputParametersTable` - Stores agent-needed parameters (backend data requirements)
3. **Lambda functions**:
   - **Classifier Function** - Triggers on S3 upload, classifies transcripts using Bedrock, extracts parameters
   - **API Function** - Handles REST API requests for frontend integration
4. **API Gateway** - RESTful API with CORS support and proxy routing
5. **IAM roles and permissions** for Bedrock, DynamoDB, and S3 access

## API Endpoints

The API Gateway provides the following endpoints:

### **Data Retrieval**
- `GET /transcripts` - Retrieve all classified transcripts with suggestions and parameter data
- `GET /schema` - Retrieve the current intent classification schema
- `GET /inputParameters` - Query customer-provided parameters
- `GET /outputParameters` - Query agent-needed parameters
- `GET /flowStats?intentPath={path}` - Get detailed statistics for a specific intent flow

### **Data Management**
- `POST /updateSchema` - Update the intent classification schema
- `POST /rescanAll` - Trigger reclassification of all existing transcripts

## Parameter Extraction

The system automatically extracts two types of parameters from conversations:

### **Input Parameters** (Customer Provides)
- Account numbers, passwords, addresses
- Personal information for authentication
- Request details and preferences

### **Output Parameters** (Agent Needs)
- Backend system data requirements
- Information needed to fulfill customer requests
- System queries and lookups

## Useful Commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Scripts

* `npm run upload-schema` - Upload the intent schema to DynamoDB
* `npm run update-schema` - Update the schema in DynamoDB
* `npm run upload-transcript` - Upload a single test transcript file (for development/testing)
* `npm run batch-upload` - Upload all transcript files from `/scripts/transcripts` directory

### Transcript Organization

For batch uploading, organize your transcript files in the `/scripts/transcripts` directory:

The batch upload script will:
- Upload all `.txt` files from `/scripts/transcripts/`
- Use the `BATCH_NAME` environment variable (default: `batch-1`) as the S3 prefix
- Trigger automatic classification via the Lambda function
- Provide progress feedback for each file uploaded

## Deployment

### Prerequisites
- AWS CLI configured with appropriate permissions
- Node.js and npm installed
- CDK CLI installed globally (`npm install -g aws-cdk`)

### Deploy to AWS
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Deploy the stack
npx cdk deploy

# Note the API Gateway URL from the output
```

### Environment Variables
After deployment, update your frontend with the API Gateway URL:
```
https://{api-id}.execute-api.{region}.amazonaws.com/prod
```

### Monitoring

Monitor the following CloudWatch metrics:
- Lambda function duration and errors
- API Gateway request count and latency
- DynamoDB read/write capacity
- S3 bucket access patterns
