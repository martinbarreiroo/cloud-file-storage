import { Injectable, Logger } from '@nestjs/common';
import {
  StorageProvider,
  FileMetadata,
} from '../interfaces/storage-provider-interface';
import { v4 as uuidv4 } from 'uuid';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

@Injectable()
export class AzureStorageProvider implements StorageProvider {
  private readonly logger = new Logger(AzureStorageProvider.name);
  private blobServiceClient: BlobServiceClient;
  private containerName: string;
  private accountName: string;
  private accountKey: string;

  constructor() {
    // Get Azure Storage credentials from environment variables
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT || '';
    this.accountKey = process.env.AZURE_STORAGE_KEY || '';
    this.containerName = process.env.AZURE_STORAGE_CONTAINER || 'files';

    if (!this.accountName || !this.accountKey) {
      this.logger.warn(
        'Azure Storage credentials not found in environment variables',
      );
    } else {
      // Create the BlobServiceClient
      const sharedKeyCredential = new StorageSharedKeyCredential(
        this.accountName,
        this.accountKey,
      );

      const blobServiceUri = `https://${this.accountName}.blob.core.windows.net`;
      this.blobServiceClient = new BlobServiceClient(
        blobServiceUri,
        sharedKeyCredential,
      );

      this.logger.log('Azure Storage Provider initialized successfully');
    }
  }

  getProviderName(): string {
    return 'azure';
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.blobServiceClient) {
        return false;
      }

      // Try to get properties of the container to check if Azure is available
      const containerClient = this.blobServiceClient.getContainerClient(
        this.containerName,
      );
      await containerClient.getProperties();
      return true;
    } catch (error: unknown) {
      this.logger.error(
        `Azure availability check failed: ${
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
      if (!this.blobServiceClient) {
        throw new Error('Azure Blob Storage client not initialized');
      }

      const fileId = uuidv4();
      const blobName = `${userId}/${fileId}-${filename}`;

      // Get a container client
      const containerClient = this.blobServiceClient.getContainerClient(
        this.containerName,
      );

      // Ensure container exists
      await containerClient.createIfNotExists();

      // Get a block blob client
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Upload the file
      await blockBlobClient.upload(file, file.length, {
        blobHTTPHeaders: {
          blobContentType: contentType,
        },
      });

      // Generate a URL for the blob
      const url = blockBlobClient.url;

      // Create a metadata object to return
      const metadata: FileMetadata = {
        id: fileId,
        filename,
        contentType,
        size: file.length,
        userId,
        path: blobName,
        provider: this.getProviderName(),
        url,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.logger.log(`File uploaded successfully to Azure: ${blobName}`);
      return metadata;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to upload file to Azure: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
