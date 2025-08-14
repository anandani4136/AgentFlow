import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const REGION = process.env.REGION || 'us-east-1';
const SCHEMA_TABLE_NAME = process.env.SCHEMA_TABLE_NAME || 'IntentSchemaTable';

const dbClient = new DynamoDBClient({ region: REGION });

async function updateSchema() {
  try {
    const schemaPath = path.join(__dirname, 'schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    await dbClient.send(new PutItemCommand({
      TableName: SCHEMA_TABLE_NAME,
      Item: {
        schemaId: { S: 'default' },
        schema: { S: JSON.stringify(schema) }
      },
    }));

    console.log('Successful schema update');
    console.log('Schema includes parameter definitions for all intents');
  } catch (error) {
    console.error('Error updating schema:', error);
  }
}

updateSchema().catch(console.error); 