import { Injectable, Logger } from '@nestjs/common';
import { UploadFileDto } from 'src/dto/file/upload-file-dto';
import { AzureStorageProvider } from 'src/providers/azure-storage.provider';
import { MinioStorageProvider } from 'src/providers/minio-storage.provider';
import {
  StorageProvider,
  FileMetadata,
} from 'src/interfaces/storage-provider-interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { File } from 'src/entities/file/file.entity';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private primaryProvider: StorageProvider;
  private backupProvider: StorageProvider;

  constructor(
    private azureStorageProvider: AzureStorageProvider,
    private minioStorageProvider: MinioStorageProvider,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
  ) {
    this.primaryProvider = azureStorageProvider;
    this.backupProvider = minioStorageProvider;
  }

  async upload(
    file: Express.Multer.File,
    metadata: UploadFileDto,
    userId: string,
  ) {
    try {
      this.logger.log(`Uploading file ${metadata.filename} for user ${userId}`);

      // First check if primary provider is available
      let provider = this.primaryProvider;
      let result: FileMetadata;

      try {
        const primaryAvailable = await this.primaryProvider.isAvailable();
        if (!primaryAvailable) {
          this.logger.warn(
            `Primary provider (${this.primaryProvider.getProviderName()}) is not available. Trying backup provider (${this.backupProvider.getProviderName()}).`,
          );
          provider = this.backupProvider;
        }

        result = await provider.uploadFile(
          file.buffer,
          metadata.filename,
          metadata.contentType,
          userId,
          metadata.description,
        );

        // Save file metadata to database
        await this.saveFileMetadata(result);
      } catch (error: unknown) {
        // If primary provider failed, try the backup provider
        if (provider === this.primaryProvider) {
          this.logger.warn(
            `Upload with primary provider failed: ${error instanceof Error ? error.message : String(error)}. Trying backup provider.`,
          );
          provider = this.backupProvider;

          // Try upload with backup provider
          result = await provider.uploadFile(
            file.buffer,
            metadata.filename,
            metadata.contentType,
            userId,
            metadata.description,
          );

          // Save file metadata to database
          await this.saveFileMetadata(result);
        } else {
          throw error;
        }
      }

      return {
        success: true,
        message: `File uploaded successfully to ${provider.getProviderName()}`,
        fileDetails: result,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        message: `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async saveFileMetadata(metadata: FileMetadata): Promise<FileMetadata> {
    try {
      const fileEntity = new File();
      fileEntity.id = metadata.id;
      fileEntity.filename = metadata.filename;
      fileEntity.contentType = metadata.contentType;
      fileEntity.size = metadata.size;
      fileEntity.userId = metadata.userId;
      fileEntity.path = metadata.path;
      fileEntity.provider = metadata.provider;
      fileEntity.url = metadata.url;
      fileEntity.description = metadata.description;
      fileEntity.createdAt = metadata.createdAt;
      fileEntity.updatedAt = metadata.updatedAt;

      const savedEntity = await this.fileRepository.save(fileEntity);
      return this.mapFileEntityToMetadata(savedEntity);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Failed to save file metadata: ${errorMessage}`);
      throw new Error(`Failed to save file metadata: ${errorMessage}`);
    }
  }

  async updateFileMetadata(
    fileId: string,
    metadata: Partial<FileMetadata>,
  ): Promise<FileMetadata> {
    try {
      const fileEntity = await this.fileRepository.findOne({
        where: { id: fileId },
      });

      if (!fileEntity) {
        throw new Error(`File with id ${fileId} not found`);
      }

      // Update only provided fields
      if (metadata.filename) fileEntity.filename = metadata.filename;
      if (metadata.description) fileEntity.description = metadata.description;
      if (metadata.path) fileEntity.path = metadata.path;
      if (metadata.url) fileEntity.url = metadata.url;
      fileEntity.updatedAt = new Date();

      const updatedEntity = await this.fileRepository.save(fileEntity);
      return this.mapFileEntityToMetadata(updatedEntity);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Failed to update file metadata: ${errorMessage}`);
      throw new Error(`Failed to update file metadata: ${errorMessage}`);
    }
  }

  private mapFileEntityToMetadata(fileEntity: File): FileMetadata {
    const metadata: FileMetadata = {
      id: fileEntity.id,
      filename: fileEntity.filename,
      contentType: fileEntity.contentType,
      size: fileEntity.size,
      userId: fileEntity.userId,
      path: fileEntity.path,
      provider: fileEntity.provider,
      url: fileEntity.url,
      description: fileEntity.description,
      createdAt: fileEntity.createdAt,
      updatedAt: fileEntity.updatedAt,
    };

    return metadata;
  }

  // Method to check availability of both providers
  async checkProviders(): Promise<{ primary: boolean; backup: boolean }> {
    const primaryAvailable = await this.primaryProvider
      .isAvailable()
      .catch(() => false);
    const backupAvailable = await this.backupProvider
      .isAvailable()
      .catch(() => false);

    return {
      primary: primaryAvailable,
      backup: backupAvailable,
    };
  }

  // Get file metadata from database
  async getFileById(fileId: string): Promise<File> {
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) {
      throw new Error(`File with ID ${fileId} not found`);
    }
    return file;
  }

  // List all files for a user
  async listUserFiles(userId: string): Promise<File[]> {
    return this.fileRepository.find({ where: { userId } });
  }
}
