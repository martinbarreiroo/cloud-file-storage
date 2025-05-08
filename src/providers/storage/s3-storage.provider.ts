import { Injectable, Logger } from '@nestjs/common';
import {
  StorageProvider,
  FileMetadata,
} from '../../interfaces/storage-provider-interface';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import {
  S3Client,
  HeadBucketCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private s3Client: S3Client;
  private bucketName: string;
  private region: string;

  constructor() {
    // Get AWS S3 credentials from environment variables
    this.region = process.env.AWS_REGION || 'us-east-2';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';

    if (!accessKeyId || !secretAccessKey || !this.bucketName) {
      this.logger.warn(
        'AWS S3 credentials or bucket name not found in environment variables',
      );
    } else {
      // Create the S3 client
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      this.logger.log('AWS S3 Storage Provider initialized successfully');
    }
  }

  getProviderName(): string {
    return 's3';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.s3Client || !this.bucketName) {
      return false;
    }

    try {
      const command = new HeadBucketCommand({ Bucket: this.bucketName });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      this.logger.error(
        `S3 bucket ${this.bucketName} is not available: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async uploadFile(
    file: Buffer,
    filename: string,
    contentType: string,
    userId: string,
    description?: string,
  ): Promise<FileMetadata> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client or bucket name not configured');
    }

    const fileId = uuidv4();
    const key = `${userId}/${fileId}-${filename}`;

    try {
      // Use the Upload utility for larger files (handles multipart uploads)
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: file,
          ContentType: contentType,
          Metadata: {
            description: description || '',
            userId,
          },
        },
      });

      await upload.done();

      const size = file.length;
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;

      return {
        id: fileId,
        filename,
        contentType,
        size,
        userId,
        path: key,
        provider: this.getProviderName(),
        url: fileUrl,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload file to S3: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new Error(`Failed to upload file to S3: ${error}`);
    }
  }

  async downloadFileStream(filePath: string): Promise<Readable> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client or bucket name not configured');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('No response body returned from S3');
      }

      return response.Body as Readable;
    } catch (error) {
      this.logger.error(
        `Failed to download file from S3: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new Error(`Failed to download file from S3: ${error}`);
    }
  }
}
