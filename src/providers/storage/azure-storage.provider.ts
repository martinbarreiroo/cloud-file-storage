import { Injectable, Logger } from '@nestjs/common';
import {
  StorageProvider,
  FileMetadata,
} from '../../interfaces/storage-provider-interface';
import { v4 as uuidv4 } from 'uuid';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from '@azure/storage-blob';

@Injectable()
export class AzureStorageProvider implements StorageProvider {
  private readonly logger = new Logger(AzureStorageProvider.name);
  private blobServiceClient: BlobServiceClient;
  private containerName: string;
  private accountName: string;
  private accountKey: string;
  private sasTokenDuration: number = 3600;

  constructor() {
    // Get Azure Storage credentials from environment variables
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT || '';
    this.accountKey = process.env.AZURE_STORAGE_KEY || '';
    this.containerName = process.env.AZURE_STORAGE_CONTAINER || 'files';
    this.sasTokenDuration = parseInt(
      process.env.AZURE_SAS_TOKEN_DURATION_SECONDS || '3600',
      10,
    );

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
      this.logger.log(`Azure SAS Token Duration: ${this.sasTokenDuration}s`);
    }
  }

  getProviderName(): string {
    return 'azure';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.blobServiceClient) {
      return false;
    }
    try {
      // Check if we can list containers (requires 'Microsoft.Storage/storageAccounts/blobServices/containers/list' permission)
      // A more lightweight check might be to get container properties if it always exists.
      const iter = this.blobServiceClient.listContainers();
      await iter.next(); // Attempt to get the first item
      return true;
    } catch (error) {
      this.logger.error(
        `Azure Storage service is not available: ${
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

  async generateDownloadUrl(
    filePath: string,
    filename: string,
  ): Promise<string> {
    if (!this.blobServiceClient) {
      throw new Error(
        'Azure Blob Storage client not initialized for generating SAS URL.',
      );
    }
    try {
      const containerClient = this.blobServiceClient.getContainerClient(
        this.containerName,
      );
      const blobClient = containerClient.getBlobClient(filePath);

      const sasOptions = {
        containerName: this.containerName,
        blobName: filePath,
        startsOn: new Date(),
        expiresOn: new Date(
          new Date().valueOf() + this.sasTokenDuration * 1000,
        ),
        permissions: BlobSASPermissions.parse('r'),
        protocol: SASProtocol.Https,
        contentDisposition: `attachment; filename="${filename}"`,
      };

      const sasToken = generateBlobSASQueryParameters(
        sasOptions,
        this.blobServiceClient.credential as StorageSharedKeyCredential,
      ).toString();

      const sasUrl = `${blobClient.url}?${sasToken}`;
      this.logger.log(
        `Generated SAS URL for ${filePath} (expires in ${this.sasTokenDuration}s)`,
      );
      return Promise.resolve(sasUrl);
    } catch (error) {
      this.logger.error(
        `Failed to generate SAS URL for ${filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return Promise.reject(new Error(`Failed to generate SAS URL: ${error}`));
    }
  }
}
