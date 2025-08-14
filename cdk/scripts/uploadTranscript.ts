import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const REGION = process.env.REGION || 'us-east-1';
const BUCKET_NAME = process.env.BUCKET_NAME || 'transcript-upload-bucket';

const s3 = new S3Client({ region: REGION });

async function uploadTranscript(filePath: string, s3Key: string) {
  const content = fs.readFileSync(filePath);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: content,
    ContentType: 'text/plain',
  });

  await s3.send(command);
  console.log(`Uploaded '${s3Key}' to S3 bucket '${BUCKET_NAME}'`);
}

const filePath = path.join(__dirname, 'sample-transcript.txt');
const s3Key = `incoming/sample-transcript.txt`;

uploadTranscript(filePath, s3Key).catch(console.error);