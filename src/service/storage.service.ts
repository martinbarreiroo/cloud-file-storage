import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UploadFileDto } from '../dto/file/upload-file-dto';
import { AzureStorageProvider } from '../providers/storage/azure-storage.provider';
import { S3StorageProvider } from '../providers/storage/s3-storage.provider';
import {
  StorageProvider,
  FileMetadata,
} from '../interfaces/storage-provider-interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { File as FileEntity } from '../entities/file/file.entity';
import { StorageProviderEnum } from '../enums/storage-provider.enum';
import { UserQuotaService } from './user-quota.service';
import { QuotaExceededException } from '../exceptions/quota-exceeded.exception';
import { BYTES_IN_MB } from '../constants/quota.constants';
import * as fileType from 'file-type';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private availableProviders: StorageProvider[] = [];

  constructor(
    @InjectRepository(FileEntity)
    private fileRepository: Repository<FileEntity>,
    private userQuotaService: UserQuotaService,
  ) {
    this.availableProviders = this.initializeProviders();
  }

  async upload(
    uploadedMulterFile: Express.Multer.File,
    metadata: UploadFileDto,
    userId: string,
  ): Promise<{
    success: boolean;
    message: string;
    fileDetails?: FileMetadata;
  }> {
    try {
      this.logger.log(
        `Attempting to upload file ${metadata.filename} for user ${userId}, size: ${uploadedMulterFile.size}`,
      );

      let determinedContentType = metadata.contentType;

      if (!determinedContentType) {
        const typeResult = await fileType.fromBuffer(uploadedMulterFile.buffer);
        if (typeResult) {
          determinedContentType = typeResult.mime;
          this.logger.log(
            `Auto-detected content type: ${determinedContentType} for ${metadata.filename}`,
          );
        } else {
          determinedContentType = 'application/octet-stream';
          this.logger.warn(
            `Could not auto-detect content type for ${metadata.filename}. Falling back to ${determinedContentType}.`,
          );
        }
      }

      const finalContentType =
        determinedContentType || 'application/octet-stream';

      const hasQuota = await this.userQuotaService.hasEnoughQuota(
        userId,
        uploadedMulterFile.size,
      );

      if (!hasQuota) {
        const quotaInfo = await this.userQuotaService.getQuotaInfo(userId);
        const remainingMB = Math.floor(quotaInfo.remainingBytes / BYTES_IN_MB);
        const fileSizeMB = Math.ceil(uploadedMulterFile.size / BYTES_IN_MB);

        throw new QuotaExceededException(
          `Monthly storage quota exceeded. You have ${remainingMB} MB remaining but tried to upload ${fileSizeMB} MB. Your quota will reset next month.`,
        );
      }

      const fileMetadataResult = await this.uploadFileInternal(
        uploadedMulterFile.buffer,
        metadata.filename,
        finalContentType,
        userId,
        metadata.description,
      );

      await this.userQuotaService.incrementUsedQuota(
        userId,
        uploadedMulterFile.size,
      );

      return {
        success: true,
        message: `File uploaded successfully to ${fileMetadataResult.provider}`,
        fileDetails: fileMetadataResult,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to upload file: ${errorMessage}`);
      if (error instanceof QuotaExceededException) {
        throw error;
      }
      return {
        success: false,
        message: `Failed to upload file: ${errorMessage}`,
      };
    }
  }

  private async uploadFileInternal(
    fileBuffer: Buffer,
    filename: string,
    contentType: string,
    userId: string,
    description?: string,
  ): Promise<FileMetadata> {
    let lastError: Error | null = null;

    for (const provider of this.availableProviders) {
      try {
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          this.logger.warn(
            `Provider ${provider.getProviderName()} is not available, trying next provider...`,
          );
          continue;
        }

        const metadataResult = await provider.uploadFile(
          fileBuffer,
          filename,
          contentType,
          userId,
          description,
        );

        const fileEntity = this.fileRepository.create({
          id: metadataResult.id,
          filename: metadataResult.filename,
          contentType: metadataResult.contentType,
          size: metadataResult.size,
          path: metadataResult.path,
          provider: metadataResult.provider,
          url: metadataResult.url,
          description: metadataResult.description,
          userId,
        });

        await this.fileRepository.save(fileEntity);
        return metadataResult;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Failed to upload using ${provider.getProviderName()}: ${lastError.message}`,
        );
      }
    }

    throw new Error(
      `All storage providers failed. Last error: ${lastError?.message}`,
    );
  }

  async checkProviders(): Promise<Record<string, boolean>> {
    const availability: Record<string, boolean> = {};

    for (const provider of this.availableProviders) {
      const isAvailable = await provider.isAvailable().catch(() => false);
      availability[provider.getProviderName()] = isAvailable;
    }

    return availability;
  }

  async getFileById(fileId: string): Promise<FileEntity> {
    const file = await this.fileRepository.findOne({ where: { id: fileId } });
    if (!file) {
      throw new Error(`File with ID ${fileId} not found`);
    }
    return file;
  }

  async listUserFiles(userId: string): Promise<FileEntity[]> {
    return this.fileRepository.find({ where: { userId } });
  }

  async getDownloadUrlData(
    fileId: string,
    userId: string,
  ): Promise<{ downloadUrl: string; filename: string; contentType: string }> {
    const fileEntity = await this.fileRepository.findOne({
      where: { id: fileId },
    });

    if (!fileEntity) {
      throw new NotFoundException(`File with ID ${fileId} not found.`);
    }

    if (fileEntity.userId !== userId) {
      throw new ForbiddenException('Access to this file is denied.');
    }

    const provider = this.availableProviders.find(
      (p) => p.getProviderName() === fileEntity.provider,
    );

    if (!provider) {
      this.logger.error(
        `Storage provider configuration for ${fileEntity.provider} not found for file ${fileId}`,
      );
      throw new Error(
        `Storage provider ${fileEntity.provider} not found for file ${fileId}.`,
      );
    }

    const providerIsAvailable = await provider.isAvailable();
    if (!providerIsAvailable) {
      this.logger.warn(
        `The storage provider ${fileEntity.provider} for file ${fileId} is currently unavailable.`,
      );
      throw new ServiceUnavailableException(
        `We will email you your download URL for ${fileEntity.filename} as soon as the service for ${fileEntity.provider} is back up and running.`,
      );
    }

    if (!provider.generateDownloadUrl) {
      this.logger.error(
        `generateDownloadUrl method not implemented for provider ${fileEntity.provider}`,
      );
      throw new Error(
        `generateDownloadUrl method not implemented for provider ${fileEntity.provider}.`,
      );
    }

    try {
      const downloadUrl = await provider.generateDownloadUrl(
        fileEntity.path,
        fileEntity.filename,
      );
      this.logger.log(
        `Generated download URL for file ${fileEntity.filename} from provider ${fileEntity.provider}`,
      );
      return {
        downloadUrl,
        filename: fileEntity.filename,
        contentType: fileEntity.contentType,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error generating download URL for ${fileId} from provider ${fileEntity.provider}: ${errorMessage}`,
      );
      throw new ServiceUnavailableException(
        `Could not generate download URL from ${fileEntity.provider} at this time. Please try again later. Original error: ${errorMessage}`,
      );
    }
  }

  private initializeProviders(): StorageProvider[] {
    return Object.values(StorageProviderEnum).map((providerType) => {
      switch (providerType) {
        case StorageProviderEnum.S3:
          return new S3StorageProvider();
        case StorageProviderEnum.AZURE:
          return new AzureStorageProvider();
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
