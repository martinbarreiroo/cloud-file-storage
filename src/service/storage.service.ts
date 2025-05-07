import { Injectable, Logger } from '@nestjs/common';
import { UploadFileDto } from 'src/dto/file/upload-file-dto';
import { AzureStorageProvider } from '../providers/storage/azure-storage.provider';
import { MinioStorageProvider } from '../providers/storage/minio-storage.provider';
import {
  StorageProvider,
  FileMetadata,
} from 'src/interfaces/storage-provider-interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { File } from 'src/entities/file/file.entity';
import { StorageProviderEnum } from 'src/enums/storage-provider.enum';
import { UserQuotaService } from './user-quota.service';
import { QuotaExceededException } from '../exceptions/quota-exceeded.exception';
import { BYTES_IN_MB } from '../constants/quota.constants';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private availableProviders: StorageProvider[] = [];

  constructor(
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    private userQuotaService: UserQuotaService,
  ) {
    this.availableProviders = this.initializeProviders();
  }

  async upload(
    file: Express.Multer.File,
    metadata: UploadFileDto,
    userId: string,
  ): Promise<{
    success: boolean;
    message: string;
    fileDetails?: FileMetadata;
  }> {
    try {
      this.logger.log(
        `Uploading file ${metadata.filename} for user ${userId}, size: ${file.size}`,
      );

      // Check if user has enough quota for this file
      const hasQuota = await this.userQuotaService.hasEnoughQuota(
        userId,
        file.size,
      );

      if (!hasQuota) {
        const quotaInfo = await this.userQuotaService.getQuotaInfo(userId);
        const remainingMB = Math.floor(quotaInfo.remainingBytes / BYTES_IN_MB);
        const fileSizeMB = Math.ceil(file.size / BYTES_IN_MB);

        throw new QuotaExceededException(
          `Monthly storage quota exceeded. You have ${remainingMB} MB remaining but tried to upload ${fileSizeMB} MB. Your quota will reset next month.`,
        );
      }

      const fileMetadata = await this.uploadFile(
        file.buffer,
        metadata.filename,
        metadata.contentType,
        userId,
        metadata.description,
      );

      // Update user quota after successful upload
      await this.userQuotaService.incrementUsedQuota(userId, file.size);

      return {
        success: true,
        message: `File uploaded successfully to ${fileMetadata.provider}`,
        fileDetails: fileMetadata,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to upload file: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to upload file: ${errorMessage}`,
      };
    }
  }

  private async uploadFile(
    file: Buffer,
    filename: string,
    contentType: string,
    userId: string,
    description?: string,
  ): Promise<FileMetadata> {
    let lastError: Error | null = null;

    // Try each provider in sequence until one succeeds
    for (const provider of this.availableProviders) {
      try {
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          this.logger.warn(
            `Provider ${provider.getProviderName()} is not available, trying next provider...`,
          );
          continue;
        }

        const metadata = await provider.uploadFile(
          file,
          filename,
          contentType,
          userId,
          description,
        );

        // Save file metadata to database
        const fileEntity = this.fileRepository.create({
          id: metadata.id,
          filename: metadata.filename,
          contentType: metadata.contentType,
          size: metadata.size,
          path: metadata.path,
          provider: metadata.provider,
          url: metadata.url,
          description: metadata.description,
          userId,
        });

        await this.fileRepository.save(fileEntity);
        return metadata;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Failed to upload using ${provider.getProviderName()}: ${lastError.message}`,
        );
      }
    }

    // If we get here, all providers failed
    throw new Error(
      `All storage providers failed. Last error: ${lastError?.message}`,
    );
  }

  // Method to check availability of all providers
  async checkProviders(): Promise<Record<string, boolean>> {
    const availability: Record<string, boolean> = {};

    for (const provider of this.availableProviders) {
      const isAvailable = await provider.isAvailable().catch(() => false);
      availability[provider.getProviderName()] = isAvailable;
    }

    return availability;
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

  private initializeProviders(): StorageProvider[] {
    return Object.values(StorageProviderEnum).map((providerType) => {
      switch (providerType) {
        case StorageProviderEnum.AZURE:
          return new AzureStorageProvider();
        case StorageProviderEnum.MINIO:
          return new MinioStorageProvider();
        default: {
          // This will cause a compile-time error if we add a new enum value
          // without handling it in the switch statement
          const exhaustiveCheck: never = providerType;
          throw new Error(
            `Unhandled provider type: ${String(exhaustiveCheck)}`,
          );
        }
      }
    });
  }
}
