import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export class BedrockTranscriptClassifierStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucketName = process.env.BUCKET_NAME || 'transcript-upload-bucket';
    const schemaTableName = process.env.SCHEMA_TABLE_NAME || 'IntentSchemaTable';
    const resultTableName = process.env.RESULT_TABLE_NAME || 'ParsedResultsTable';
    const bedrockModelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';

    const transcriptBucket = new s3.Bucket(this, 'TranscriptUploadBucket', {
      bucketName: bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const schemaTable = new dynamodb.Table(this, 'IntentSchemaTable', {
      tableName: schemaTableName,
      partitionKey: { name: 'schemaId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const resultTable = new dynamodb.Table(this, 'ParsedResultsTable', {
      tableName: resultTableName,
      partitionKey: { name: 'transcriptId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const parametersTableName = process.env.PARAMETERS_TABLE_NAME || 'ExtractedParametersTable';
    const parametersTable = new dynamodb.Table(this, 'ExtractedParametersTable', {
      tableName: parametersTableName,
      partitionKey: { name: 'transcriptId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'parameterName', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Separate tables for input and output parameters
    const inputParametersTableName = process.env.INPUT_PARAMETERS_TABLE_NAME || 'InputParametersTable';
    const inputParametersTable = new dynamodb.Table(this, 'InputParametersTable', {
      tableName: inputParametersTableName,
      partitionKey: { name: 'transcriptId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'parameterName', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const outputParametersTableName = process.env.OUTPUT_PARAMETERS_TABLE_NAME || 'OutputParametersTable';
    const outputParametersTable = new dynamodb.Table(this, 'OutputParametersTable', {
      tableName: outputParametersTableName,
      partitionKey: { name: 'transcriptId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'parameterName', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const classifierFunction = new lambda.Function(this, 'ClassifierFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        SCHEMA_TABLE_NAME: schemaTable.tableName,
        RESULT_TABLE_NAME: resultTable.tableName,
        PARAMETERS_TABLE_NAME: parametersTable.tableName,
        INPUT_PARAMETERS_TABLE_NAME: inputParametersTable.tableName,
        OUTPUT_PARAMETERS_TABLE_NAME: outputParametersTable.tableName,
        BUCKET_NAME: transcriptBucket.bucketName,
        BEDROCK_MODEL_ID: bedrockModelId,
        REGION: this.region,
      },
    });

    // Trigger Lambda on S3 upload
    transcriptBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(classifierFunction)
    );

    const apiFunction = new lambda.Function(this, 'ApiRouterFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-api')),
      timeout: cdk.Duration.seconds(30),
      environment: {
        SCHEMA_TABLE_NAME: schemaTable.tableName,
        RESULT_TABLE_NAME: resultTable.tableName,
        PARAMETERS_TABLE_NAME: parametersTable.tableName,
        INPUT_PARAMETERS_TABLE_NAME: inputParametersTable.tableName,
        OUTPUT_PARAMETERS_TABLE_NAME: outputParametersTable.tableName,
        CLASSIFIER_FUNCTION_NAME: classifierFunction.functionName,
        REGION: this.region,
      },
    });

    const api = new apigateway.LambdaRestApi(this, 'TranscriptApi', {
      handler: apiFunction,
      proxy: true,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: true,
      },
    });

    transcriptBucket.grantRead(classifierFunction);
    schemaTable.grantReadWriteData(classifierFunction);
    resultTable.grantWriteData(classifierFunction);
    parametersTable.grantReadWriteData(classifierFunction);
    inputParametersTable.grantReadWriteData(classifierFunction);
    outputParametersTable.grantReadWriteData(classifierFunction);

    schemaTable.grantReadWriteData(apiFunction);
    resultTable.grantReadData(apiFunction);
    parametersTable.grantReadWriteData(apiFunction);
    inputParametersTable.grantReadWriteData(apiFunction);
    outputParametersTable.grantReadWriteData(apiFunction);
    classifierFunction.grantInvoke(apiFunction);

    [classifierFunction, apiFunction].forEach(fn => {
      fn.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'));
      fn.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'));
      fn.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
    });
  }
}
