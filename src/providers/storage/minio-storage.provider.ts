import { Injectable, Logger } from '@nestjs/common';
import {
  StorageProvider,
  FileMetadata,
} from '../../interfaces/storage-provider-interface';
import { v4 as uuidv4 } from 'uuid';
import * as Minio from 'minio';

@Injectable()
export class MinioStorageProvider implements StorageProvider {
  private readonly logger = new Logger(MinioStorageProvider.name);
  private minioClient: Minio.Client;
  private bucketName: string;

  constructor() {
    const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const minioPort = parseInt(process.env.MINIO_PORT || '9000', 10);
    const minioAccessKey = process.env.MINIO_ROOT_USER || 'minioadmin';
    const minioSecretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
    this.bucketName = process.env.MINIO_BUCKET_NAME || 'files';

    try {
      // Initialize MinIO client
      this.minioClient = new Minio.Client({
        endPoint: minioEndpoint,
        port: minioPort,
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: minioAccessKey,
        secretKey: minioSecretKey,
      });

      this.logger.log('MinIO Storage Provider initialized');
    } catch (error: unknown) {
      this.logger.error(
        `MinIO client initialization failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  getProviderName(): string {
    return 'minio';
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.minioClient) {
        return false;
      }

      // Check if bucket exists
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);

      if (!bucketExists) {
        this.logger.warn(
          `Bucket ${this.bucketName} does not exist. Will try to create it.`,
        );
        await this.minioClient.makeBucket(this.bucketName);
        this.logger.log(`Bucket ${this.bucketName} created successfully.`);
      }

      return true;
    } catch (error: unknown) {
      this.logger.error(
        `MinIO availability check failed: ${
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
    try {
      if (!this.minioClient) {
        throw new Error('MinIO client not initialized');
      }

      const fileId = uuidv4();
      const objectName = `${userId}/${fileId}-${filename}`;

      // Ensure bucket exists
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(this.bucketName);
      }

      // Upload file to MinIO
      await this.minioClient.putObject(
        this.bucketName,
        objectName,
        file,
        file.length,
        {
          'Content-Type': contentType,
          'X-Amz-Meta-FileId': fileId,
          'X-Amz-Meta-UserId': userId,
          'X-Amz-Meta-Description': description || '',
        },
      );

      const url = await this.minioClient.presignedGetObject(
        this.bucketName,
        objectName,
        24 * 60 * 60,
      );

      // Create a metadata object to return
      const metadata: FileMetadata = {
        id: fileId,
        filename,
        contentType,
        size: file.length,
        userId,
        path: objectName,
        provider: this.getProviderName(),
        url,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.logger.log(`File uploaded successfully to MinIO: ${objectName}`);
      return metadata;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to upload file to MinIO: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
