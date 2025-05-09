import { S3StorageProvider } from '../src/providers/storage/s3-storage.provider';
import * as fs from 'fs';
import * as path from 'path';

// Set environment variables for MinIO
process.env.AWS_ENDPOINT = 'http://localhost:9000';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'minioadmin';
process.env.AWS_SECRET_ACCESS_KEY = 'minioadmin';
process.env.AWS_S3_BUCKET_NAME = 'test-bucket';

async function main() {
  console.log('Testing S3StorageProvider with MinIO...');
  
  // Create the provider
  const provider = new S3StorageProvider();
  
  // Check if MinIO is available
  console.log('Checking if MinIO is available...');
  const isAvailable = await provider.isAvailable();
  console.log(`MinIO available: ${isAvailable}`);
  
  if (!isAvailable) {
    console.error('MinIO is not available. Exiting.');
    return;
  }
  
  // Create a test file
  const testFilePath = path.join(__dirname, 'test-file.txt');
  const testContent = 'This is a test file for MinIO upload.';
  fs.writeFileSync(testFilePath, testContent);
  
  // Upload the file
  console.log('Uploading file to MinIO...');
  try {
    const fileBuffer = fs.readFileSync(testFilePath);
    const result = await provider.uploadFile(
      fileBuffer,
      'test-file.txt',
      'text/plain',
      'test-user',
      'Test file description'
    );
    
    console.log('Upload successful!');
    console.log('Result:', result);
    
    // Clean up
    fs.unlinkSync(testFilePath);
    console.log('Test completed successfully.');
  } catch (error) {
    console.error('Error during upload:', error);
  }
}

main().catch(console.error); 