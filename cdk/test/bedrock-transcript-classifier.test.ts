import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as BedrockTranscriptClassifier from '../lib/bedrock-transcript-classifier-stack';

describe('BedrockTranscriptClassifierStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new BedrockTranscriptClassifier.BedrockTranscriptClassifierStack(app, 'MyTestStack');
    template = Template.fromStack(stack);
  });

  test('S3 Bucket Created', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.anyValue(),
    });
  });

  test('S3 Bucket Has Notification Configuration', () => {
    // Check that S3 bucket notifications are configured
    template.hasResourceProperties('Custom::S3BucketNotifications', {
      BucketName: Match.anyValue(),
      NotificationConfiguration: {
        LambdaFunctionConfigurations: Match.arrayWith([
          Match.objectLike({
            Events: ['s3:ObjectCreated:*'],
          }),
        ]),
      },
    });
  });

  test('DynamoDB Tables Created', () => {
    // Intent Schema Table
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'IntentSchemaTable',
      KeySchema: [
        {
          AttributeName: 'schemaId',
          KeyType: 'HASH',
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'schemaId',
          AttributeType: 'S',
        },
      ],
    });

    // Parsed Results Table
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'ParsedResultsTable',
      KeySchema: [
        {
          AttributeName: 'transcriptId',
          KeyType: 'HASH',
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'transcriptId',
          AttributeType: 'S',
        },
      ],
    });

    // Input Parameters Table
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'InputParametersTable',
      KeySchema: [
        {
          AttributeName: 'transcriptId',
          KeyType: 'HASH',
        },
        {
          AttributeName: 'parameterName',
          KeyType: 'RANGE',
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'transcriptId',
          AttributeType: 'S',
        },
        {
          AttributeName: 'parameterName',
          AttributeType: 'S',
        },
      ],
    });

    // Output Parameters Table
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'OutputParametersTable',
      KeySchema: [
        {
          AttributeName: 'transcriptId',
          KeyType: 'HASH',
        },
        {
          AttributeName: 'parameterName',
          KeyType: 'RANGE',
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'transcriptId',
          AttributeType: 'S',
        },
        {
          AttributeName: 'parameterName',
          AttributeType: 'S',
        },
      ],
    });
  });

  test('Lambda Functions Created', () => {
    // Classifier Lambda Function
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs20.x',
      Handler: 'index.handler',
      Timeout: 30,
      Environment: {
        Variables: Match.objectLike({
          SCHEMA_TABLE_NAME: Match.anyValue(),
          RESULT_TABLE_NAME: Match.anyValue(),
          INPUT_PARAMETERS_TABLE_NAME: Match.anyValue(),
          OUTPUT_PARAMETERS_TABLE_NAME: Match.anyValue(),
          BEDROCK_MODEL_ID: Match.anyValue(),
        }),
      },
    });

    // API Lambda Function
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs20.x',
      Handler: 'index.handler',
      Timeout: 30,
      Environment: {
        Variables: Match.objectLike({
          SCHEMA_TABLE_NAME: Match.anyValue(),
          RESULT_TABLE_NAME: Match.anyValue(),
          INPUT_PARAMETERS_TABLE_NAME: Match.anyValue(),
          OUTPUT_PARAMETERS_TABLE_NAME: Match.anyValue(),
        }),
      },
    });
  });

  test('API Gateway Created', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: Match.stringLikeRegexp('.*TranscriptApi.*'),
    });
  });

  test('API Gateway CORS Configuration', () => {
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'OPTIONS',
      AuthorizationType: 'NONE',
      Integration: {
        Type: 'MOCK',
        RequestTemplates: {
          'application/json': '{ statusCode: 200 }',
        },
      },
      MethodResponses: [
        {
          StatusCode: '204',
          ResponseParameters: {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
          },
        },
      ],
    });
  });

  test('IAM Roles Created', () => {
    // Lambda execution role
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
          },
        ],
      },
    });
  });

  test('IAM Policies Exist', () => {
    // Check that IAM policies exist with the expected structure
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.anyValue(),
            Resource: Match.anyValue(),
          }),
        ]),
      },
    });
  });

  test('Lambda Permission for S3 Trigger', () => {
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 's3.amazonaws.com',
      SourceArn: Match.anyValue(),
    });
  });

  test('Lambda Permission for API Gateway', () => {
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: Match.anyValue(),
    });
  });

  test('Stack Has Required Resources', () => {
    // Verify all required resource types exist
    const resources = template.toJSON().Resources;
    const resourceTypes = Object.values(resources).map((resource: any) => resource.Type);
    
    expect(resourceTypes).toContain('AWS::S3::Bucket');
    expect(resourceTypes).toContain('AWS::DynamoDB::Table');
    expect(resourceTypes).toContain('AWS::Lambda::Function');
    expect(resourceTypes).toContain('AWS::ApiGateway::RestApi');
    expect(resourceTypes).toContain('AWS::IAM::Role');
    expect(resourceTypes).toContain('AWS::IAM::Policy');
    expect(resourceTypes).toContain('AWS::Lambda::Permission');
  });

  test('Specific Table Names Exist', () => {
    const resources = template.toJSON().Resources;
    const tableNames = Object.values(resources)
      .filter((resource: any) => resource.Type === 'AWS::DynamoDB::Table')
      .map((resource: any) => resource.Properties.TableName);
    
    expect(tableNames).toContain('IntentSchemaTable');
    expect(tableNames).toContain('ParsedResultsTable');
    expect(tableNames).toContain('InputParametersTable');
    expect(tableNames).toContain('OutputParametersTable');
  });
});
