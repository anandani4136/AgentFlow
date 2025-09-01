import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
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

    // Create VPC for ElastiCache
    const vpc = new ec2.Vpc(this, 'ConversationBotVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Create ElastiCache Redis cluster
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis cluster',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Security group for Redis cluster',
      allowAllOutbound: true,
    });

    // Create security group for Lambda functions
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    const redisCluster = new elasticache.CfnCacheCluster(this, 'ConversationBotRedis', {
      engine: 'redis',
      cacheNodeType: 'cache.t3.micro', // Start small, can scale up
      numCacheNodes: 1,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
      port: 6379,
      preferredAvailabilityZone: vpc.privateSubnets[0].availabilityZone,
    });

    redisCluster.addDependsOn(redisSubnetGroup);

    // TODO: Add OpenSearch domain for vector store in future iteration
    // For now, we'll use a simpler approach with in-memory storage

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

    // FAQ Sources table for storing FAQ URLs and configurations
    const faqSourcesTableName = process.env.FAQ_SOURCES_TABLE_NAME || 'FAQSourcesTable';
    const faqSourcesTable = new dynamodb.Table(this, 'FAQSourcesTable', {
      tableName: faqSourcesTableName,
      partitionKey: { name: 'sourceId', type: dynamodb.AttributeType.STRING },
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
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        SCHEMA_TABLE_NAME: schemaTable.tableName,
        RESULT_TABLE_NAME: resultTable.tableName,
        PARAMETERS_TABLE_NAME: parametersTable.tableName,
        INPUT_PARAMETERS_TABLE_NAME: inputParametersTable.tableName,
        OUTPUT_PARAMETERS_TABLE_NAME: outputParametersTable.tableName,
        BUCKET_NAME: transcriptBucket.bucketName,
        BEDROCK_MODEL_ID: bedrockModelId,
        REDIS_ENDPOINT: redisCluster.attrRedisEndpointAddress,
        REDIS_PORT: redisCluster.attrRedisEndpointPort,
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
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        SCHEMA_TABLE_NAME: schemaTable.tableName,
        RESULT_TABLE_NAME: resultTable.tableName,
        PARAMETERS_TABLE_NAME: parametersTable.tableName,
        INPUT_PARAMETERS_TABLE_NAME: inputParametersTable.tableName,
        OUTPUT_PARAMETERS_TABLE_NAME: outputParametersTable.tableName,
        CLASSIFIER_FUNCTION_NAME: classifierFunction.functionName,
        REDIS_ENDPOINT: redisCluster.attrRedisEndpointAddress,
        REDIS_PORT: redisCluster.attrRedisEndpointPort,
        REGION: this.region,
      },
    });

    const conversationFunction = new lambda.Function(this, 'ConversationFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-conversation')),
      timeout: cdk.Duration.seconds(300), // 5 minutes for training jobs
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        REDIS_ENDPOINT: redisCluster.attrRedisEndpointAddress,
        REDIS_PORT: redisCluster.attrRedisEndpointPort,
        OPENSEARCH_ENDPOINT: 'placeholder',
        OPENSEARCH_INDEX: 'conversation-knowledge',
        FAQ_SOURCES_TABLE_NAME: faqSourcesTable.tableName,
        REGION: this.region,
        HUGGINGFACE_TOKEN: process.env.HUGGINGFACE_TOKEN || '',
      },
    });

    const api = new apigateway.LambdaRestApi(this, 'TranscriptApi', {
      handler: apiFunction,
      proxy: false,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: true,
      },
    });

    // Add conversation endpoints to API Gateway
    const conversationResource = api.root.addResource('conversation');
    conversationResource.addMethod('POST', new apigateway.LambdaIntegration(conversationFunction));
    
    const historyResource = conversationResource.addResource('history').addResource('{sessionId}');
    historyResource.addMethod('GET', new apigateway.LambdaIntegration(conversationFunction));
    
    const sessionResource = conversationResource.addResource('{sessionId}');
    sessionResource.addMethod('DELETE', new apigateway.LambdaIntegration(conversationFunction));

    // Add intent debug endpoint
    const debugResource = conversationResource.addResource('debug-intent');
    debugResource.addMethod('POST', new apigateway.LambdaIntegration(conversationFunction));

    // Add LangChain processing endpoint
    const langchainResource = conversationResource.addResource('langchain');
    langchainResource.addMethod('POST', new apigateway.LambdaIntegration(conversationFunction));

    // Add HuggingFace fine-tuning endpoints
    const finetuneResource = conversationResource.addResource('finetune');
    
    // Start fine-tuning
    const startResource = finetuneResource.addResource('start');
    startResource.addMethod('POST', new apigateway.LambdaIntegration(conversationFunction));
    
    // Get fine-tuning status
    const statusResource = finetuneResource.addResource('status');
    const jobStatusResource = statusResource.addResource('{jobId}');
    jobStatusResource.addMethod('GET', new apigateway.LambdaIntegration(conversationFunction));
    
    // Get fine-tuned models
    const modelsResource = finetuneResource.addResource('models');
    modelsResource.addMethod('GET', new apigateway.LambdaIntegration(conversationFunction));
    
    // Get recommended configuration
    const configResource = finetuneResource.addResource('config');
    const recommendedResource = configResource.addResource('recommended');
    recommendedResource.addMethod('GET', new apigateway.LambdaIntegration(conversationFunction));

    // Add model testing endpoints
    const testingResource = conversationResource.addResource('testing');
    
    // Test model accuracy
    const testAccuracyResource = testingResource.addResource('accuracy');
    testAccuracyResource.addMethod('POST', new apigateway.LambdaIntegration(conversationFunction));
    
    // Use model for inference
    const inferenceResource = testingResource.addResource('inference');
    inferenceResource.addMethod('POST', new apigateway.LambdaIntegration(conversationFunction));
    
    // Compare models
    const compareResource = testingResource.addResource('compare');
    compareResource.addMethod('POST', new apigateway.LambdaIntegration(conversationFunction));
    
    // Get model performance summary
    const performanceResource = testingResource.addResource('performance');
    performanceResource.addMethod('GET', new apigateway.LambdaIntegration(conversationFunction));

    // Add FAQ management endpoints
    const faqResource = api.root.addResource('faq');
    const faqSourcesResource = faqResource.addResource('sources');
    faqSourcesResource.addMethod('GET', new apigateway.LambdaIntegration(conversationFunction));
    faqSourcesResource.addMethod('POST', new apigateway.LambdaIntegration(conversationFunction));
    
    const faqSourceByIdResource = faqSourcesResource.addResource('{sourceId}');
    faqSourceByIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(conversationFunction));

    // Add existing API routes for transcript functionality
    const schemasResource = api.root.addResource('schemas');
    schemasResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
    schemasResource.addMethod('POST', new apigateway.LambdaIntegration(apiFunction));
    
    const schemaByIdResource = schemasResource.addResource('{schemaId}');
    schemaByIdResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
    schemaByIdResource.addMethod('PUT', new apigateway.LambdaIntegration(apiFunction));
    schemaByIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(apiFunction));
    
    const resultsResource = api.root.addResource('results');
    resultsResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));
    
    const resultByIdResource = resultsResource.addResource('{transcriptId}');
    resultByIdResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));

    // Add transcripts endpoint for frontend compatibility
    const transcriptsResource = api.root.addResource('transcripts');
    transcriptsResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));

    // Add public intents endpoint for transcript analysis frontend
    const intentsResource = api.root.addResource('intents');
    intentsResource.addMethod('GET', new apigateway.LambdaIntegration(apiFunction));

    transcriptBucket.grantRead(classifierFunction);
    schemaTable.grantReadWriteData(classifierFunction);
    resultTable.grantWriteData(classifierFunction);
    parametersTable.grantReadWriteData(classifierFunction);
    inputParametersTable.grantReadWriteData(classifierFunction);
    outputParametersTable.grantReadWriteData(classifierFunction);
    
    // Grant FAQ sources table permissions
    faqSourcesTable.grantReadWriteData(conversationFunction);

    schemaTable.grantReadWriteData(apiFunction);
    resultTable.grantReadData(apiFunction);
    parametersTable.grantReadWriteData(apiFunction);
    inputParametersTable.grantReadWriteData(apiFunction);
    outputParametersTable.grantReadWriteData(apiFunction);
    classifierFunction.grantInvoke(apiFunction);

    // Allow Lambda functions to access Redis
    // Lambda functions in VPC automatically get security groups
    redisSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(6379),
      'Allow Lambda functions to access Redis'
    );

    // Allow Lambda functions to access Redis
    redisSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(lambdaSecurityGroup.securityGroupId),
      ec2.Port.tcp(6379),
      'Allow Lambda functions to access Redis'
    );

    [classifierFunction, apiFunction, conversationFunction].forEach(fn => {
      fn.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'));
      fn.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'));
      fn.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
    });

    // TODO: Grant OpenSearch permissions to conversation function when OpenSearch is added
  }
}
