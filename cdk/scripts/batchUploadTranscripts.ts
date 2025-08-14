import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const REGION = process.env.REGION || 'us-east-1';
const BUCKET_NAME = process.env.BUCKET_NAME || 'transcript-upload-bucket';
const BATCH_NAME = process.env.BATCH_NAME || 'batch-1';

const s3 = new S3Client({ region: REGION });

async function uploadFile(localPath: string, s3Key: string) {
  const content = fs.readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: content,
    ContentType: 'text/plain',
  }));
  console.log(`✅ Uploaded ${localPath} → ${s3Key}`);
}

async function main() {
  const dir = path.join(__dirname, 'transcripts');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));

  await Promise.all(
    files.map(file => {
      const localPath = path.join(dir, file);
      const s3Key = `${BATCH_NAME}/${file}`;
      return uploadFile(localPath, s3Key);
    })
  );

  console.log(`✅ Uploaded ${files.length} total files`);
}

main();