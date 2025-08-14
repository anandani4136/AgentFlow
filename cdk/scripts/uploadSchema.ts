import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const REGION = process.env.REGION || 'us-east-1';
const TABLE_NAME = process.env.SCHEMA_TABLE_NAME || 'IntentSchemaTable';
const SCHEMA_ID = process.env.SCHEMA_ID || 'default';

const schemaPath = path.join(__dirname, 'schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

async function upload() {
  const client = new DynamoDBClient({ region: REGION });
  const command = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      schemaId: { S: SCHEMA_ID },
      schema: { S: JSON.stringify(schema) },
    },
  });

  await client.send(command);
  console.log(`Uploaded schema to ${TABLE_NAME} with schemaId = '${SCHEMA_ID}'`);
}

upload().catch((err) => {
  console.error('Failed to upload schema:', err);
});
