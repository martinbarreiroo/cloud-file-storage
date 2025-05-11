import { Injectable, Logger } from '@nestjs/common';
import {
  StorageProvider,
  FileMetadata,
} from '../../interfaces/storage-provider-interface';
import { v4 as uuidv4 } from 'uuid';
import {
  S3Client,
  HeadBucketCommand,
  GetObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private s3Client: S3Client;
  private bucketName: string;
  private region: string;
  private endpoint: string | undefined;
  private isMinIO: boolean = false;
  private signedUrlExpiresIn: number = 3600;

  constructor() {
    // Get AWS S3 credentials from environment variables
    this.region = process.env.AWS_REGION || 'us-east-2';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';
    this.endpoint = process.env.AWS_ENDPOINT;
    this.isMinIO = !!this.endpoint;
    this.signedUrlExpiresIn = parseInt(
      process.env.AWS_SIGNED_URL_EXPIRES_IN || '3600',
      10,
    );

    // Debug log all environment variables for diagnosing issues
    this.logger.log('S3 Provider Environment Variables:');
    this.logger.log(`AWS_REGION: ${this.region}`);
    this.logger.log(`AWS_S3_BUCKET_NAME: ${this.bucketName}`);
    this.logger.log(`AWS_ENDPOINT: ${this.endpoint}`);
    this.logger.log(
      `AWS_ACCESS_KEY_ID: ${accessKeyId ? '[REDACTED]' : 'not set'}`,
    );
    this.logger.log(
      `AWS_SECRET_ACCESS_KEY: ${secretAccessKey ? '[REDACTED]' : 'not set'}`,
    );
    this.logger.log(`isMinIO: ${this.isMinIO}`);
    this.logger.log(`AWS_SIGNED_URL_EXPIRES_IN: ${this.signedUrlExpiresIn}`);

    if (!accessKeyId || !secretAccessKey || !this.bucketName) {
      this.logger.warn(
        'AWS S3 credentials or bucket name not found in environment variables',
      );
    } else {
      // Create the S3 client with optional endpoint for MinIO
      const clientConfig: S3ClientConfig = {
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      };

      // If endpoint is provided (for MinIO), add it to the config
      if (this.endpoint) {
        clientConfig.endpoint = this.endpoint;
        clientConfig.forcePathStyle = true; // Required for MinIO
        this.logger.log(`Using custom S3 endpoint: ${this.endpoint}`);
      }

      this.s3Client = new S3Client(clientConfig);

      this.logger.log(
        `S3 Storage Provider initialized successfully (${this.isMinIO ? 'MinIO' : 'AWS S3'})`,
      );
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

      // Generate URL based on whether we're using MinIO or S3
      let fileUrl: string;
      if (this.isMinIO && this.endpoint) {
        fileUrl = `${this.endpoint}/${this.bucketName}/${key}`;
      } else {
        fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      }

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

  async generateDownloadUrl(
    filePath: string,
    filename: string,
  ): Promise<string> {
    if (!this.s3Client || !this.bucketName) {
      throw new Error(
        'S3 client or bucket name not configured for generating download URL.',
      );
    }
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      });
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: this.signedUrlExpiresIn,
      });
      this.logger.log(
        `Generated pre-signed URL for ${filePath} (expires in ${this.signedUrlExpiresIn}s)`,
      );
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate pre-signed URL for ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new Error(`Failed to generate pre-signed URL: ${error}`);
    }
  }
}
