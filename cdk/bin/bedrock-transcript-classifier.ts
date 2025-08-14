#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BedrockTranscriptClassifierStack } from '../lib/bedrock-transcript-classifier-stack';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = new cdk.App();

// Get environment variables with fallbacks
const region = process.env.REGION || 'us-east-1';

new BedrockTranscriptClassifierStack(app, 'BedrockTranscriptClassifierStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  env: { region: region },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});