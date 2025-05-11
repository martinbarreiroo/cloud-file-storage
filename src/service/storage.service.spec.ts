import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { File as FileEntity } from '../entities/file/file.entity';
import { UserQuotaService } from './user-quota.service';
import { QuotaExceededException } from '../exceptions/quota-exceeded.exception';
import { Repository } from 'typeorm';
import { UserQuota } from '../entities/file/user-quota.entity';
import { StorageProvider } from '../interfaces/storage-provider-interface';
/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */

interface UploadedFileInfo {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  userId: string;
  path: string;
  provider: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

// Define a test version of UserQuota that allows null user
interface TestUserQuota extends Omit<UserQuota, 'user'> {
  user: null | UserQuota['user'];
}

// Mock providers
class MockAzureProvider {
  getProviderName(): string {
    return 'azure';
  }

  async isAvailable(): Promise<boolean> {
    // Mock implementation with actual await
    await Promise.resolve();
    return true;
  }

  async uploadFile(
    file: Buffer,
    filename: string,
    contentType: string,
    userId: string,
    description: string,
  ): Promise<UploadedFileInfo> {
    // Mock implementation with actual await
    await Promise.resolve();
    return {
      id: 'azure-file-id',
      filename,
      contentType,
      size: file.length,
      userId,
      path: `${userId}/azure-file-id-${filename}`,
      provider: 'azure',
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async generateDownloadUrl(
    filePath: string,
    filename: string,
  ): Promise<string> {
    await Promise.resolve();
    return `https://mockazure.com/${filePath}?sasTokenFor=${filename}`;
  }
}

class MockS3Provider {
  getProviderName(): string {
    return 's3';
  }

  async isAvailable(): Promise<boolean> {
    // Mock implementation with actual await
    await Promise.resolve();
    return false; // Simulate S3 unavailable by default in these mocks
  }

  async uploadFile(): Promise<never> {
    // Mock implementation with actual await
    await Promise.resolve();
    throw new Error('S3 not available');
  }

  async generateDownloadUrl(): Promise<string> {
    await Promise.resolve();
    // Simulate S3 not available for URL generation in this specific mock if needed by a test
    // For a success case, it would return a URL like the Azure one.
    // To test the S3 success path, a dedicated MockS3Provider with isAvailable=true and working generateDownloadUrl would be needed.
    // For now, let's make it work for Azure path in the tests and S3 can fail over.
    // Or, let's assume S3 also works for a generic test case, if S3 was available:
    // return `https://mocks3.com/bucket/${filePath}?sigFor=${filename}`;
    // For this specific mock setup where S3.isAvailable() is false, this won't be hit often unless forced.
    throw new Error('S3 not available for URL gen in this mock');
  }
}

describe('StorageService', () => {
  let service: StorageService;
  let userQuotaService: UserQuotaService;
  let fileRepository: Repository<FileEntity>;

  beforeEach(async () => {
    // Mock implementations
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const userQuotaServiceMock = {
      hasEnoughQuota: jest.fn(),
      incrementUsedQuota: jest.fn(),
      getQuotaInfo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: getRepositoryToken(FileEntity),
          useValue: mockRepository,
        },
        {
          provide: UserQuotaService,
          useValue: userQuotaServiceMock,
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    userQuotaService = module.get<UserQuotaService>(UserQuotaService);
    fileRepository = module.get(getRepositoryToken(FileEntity));

    // Override the initializeProviders method to return our mock providers
    jest
      .spyOn(service as any, 'initializeProviders')
      .mockImplementation(() => [
        new MockS3Provider(),
        new MockAzureProvider(),
      ]);

    // Re-initialize providers
    service['availableProviders'] = service['initializeProviders']();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    const userId = 'test-user-id';
    const testFile = {
      buffer: Buffer.from('test file content'),
      originalname: 'test-file.txt',
      mimetype: 'text/plain',
      size: 1024,
    } as Express.Multer.File;

    const uploadMetadata = {
      filename: 'test-file.txt',
      contentType: 'text/plain',
      description: 'Test file description',
    };

    it('should successfully upload a file when quota is available', async () => {
      // Arrange
      const mockQuota: TestUserQuota = {
        id: 'quota-id',
        userId,
        month: 1,
        year: 2025,
        usedBytes: 1024,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: null,
      };

      jest.spyOn(userQuotaService, 'hasEnoughQuota').mockResolvedValue(true);
      jest
        .spyOn(userQuotaService, 'incrementUsedQuota')
        .mockResolvedValue(mockQuota as UserQuota);

      const mockCreate = jest.fn().mockImplementation((entity) => entity);
      const mockSave = jest
        .fn()
        .mockImplementation((entity) => Promise.resolve(entity));

      // Type assertion to access mock functions
      (fileRepository.create as jest.Mock) = mockCreate;
      (fileRepository.save as jest.Mock) = mockSave;

      // Act
      const result = await service.upload(testFile, uploadMetadata, userId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain('uploaded successfully');
      expect(result.fileDetails).toBeDefined();
      if (result.fileDetails) {
        expect(result.fileDetails.provider).toBe('azure'); // Azure provider should be used
      }
      expect(userQuotaService.hasEnoughQuota).toHaveBeenCalledWith(
        userId,
        testFile.size,
      );
      expect(userQuotaService.incrementUsedQuota).toHaveBeenCalledWith(
        userId,
        testFile.size,
      );
      expect(fileRepository.save).toHaveBeenCalled();
    });

    it('should return error when quota is exceeded', async () => {
      // Arrange
      const quotaInfo = {
        usedBytes: 4 * 1024 * 1024 * 1024, // 4GB used
        totalBytes: 5 * 1024 * 1024 * 1024, // 5GB total
        remainingBytes: 1 * 1024 * 1024 * 1024, // 1GB remaining
        percentUsed: 80,
      };

      jest.spyOn(userQuotaService, 'hasEnoughQuota').mockResolvedValue(false);
      jest.spyOn(userQuotaService, 'getQuotaInfo').mockResolvedValue(quotaInfo);

      // Act & Assert
      await expect(
        service.upload(testFile, uploadMetadata, userId),
      ).rejects.toThrow(QuotaExceededException);
      expect(userQuotaService.hasEnoughQuota).toHaveBeenCalledWith(
        userId,
        testFile.size,
      );
      expect(fileRepository.save).not.toHaveBeenCalled();
    });

    it('should try all available providers and use the first one available', async () => {
      // Arrange
      const mockQuota: TestUserQuota = {
        id: 'quota-id',
        userId,
        month: 1,
        year: 2025,
        usedBytes: 1024,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: null,
      };

      jest.spyOn(userQuotaService, 'hasEnoughQuota').mockResolvedValue(true);
      jest
        .spyOn(userQuotaService, 'incrementUsedQuota')
        .mockResolvedValue(mockQuota as UserQuota);

      const mockCreate = jest.fn().mockImplementation((entity) => entity);
      const mockSave = jest
        .fn()
        .mockImplementation((entity) => Promise.resolve(entity));

      // Type assertion to access mock functions
      (fileRepository.create as jest.Mock) = mockCreate;
      (fileRepository.save as jest.Mock) = mockSave;

      // Act
      const result = await service.upload(testFile, uploadMetadata, userId);

      // Assert
      expect(result.success).toBe(true);
      if (result.fileDetails) {
        expect(result.fileDetails.provider).toBe('azure'); // Should fall back to Azure after S3 fails
      }
    });
  });

  describe('getDownloadUrlData', () => {
    const userId = 'test-user-id';
    const fileId = 'test-file-id';

    it('should return download URL data for valid file owned by the user', async () => {
      // Arrange
      const fileEntity = {
        id: fileId,
        userId,
        provider: 'azure',
        path: 'user-files/test.txt',
        filename: 'test.txt',
        contentType: 'text/plain',
      };

      const mockFindOne = jest.fn().mockResolvedValue(fileEntity);
      (fileRepository.findOne as jest.Mock) = mockFindOne;

      // Act
      const result = await service.getDownloadUrlData(fileId, userId);

      // Assert
      expect(result).toBeDefined();
      expect(result.downloadUrl).toBe(
        `https://mockazure.com/${fileEntity.path}?sasTokenFor=${fileEntity.filename}`,
      );
      expect(result.filename).toBe(fileEntity.filename);
      expect(result.contentType).toBe(fileEntity.contentType);
    });

    it('should throw NotFoundException for non-existent file', async () => {
      // Arrange
      const mockFindOne = jest.fn().mockResolvedValue(null);
      (fileRepository.findOne as jest.Mock) = mockFindOne;

      // Act & Assert
      await expect(
        service.getDownloadUrlData(fileId, userId),
      ).rejects.toThrow();
    });

    it('should throw ForbiddenException for file owned by different user', async () => {
      // Arrange
      const fileEntity = {
        id: fileId,
        userId: 'different-user-id',
        provider: 'azure',
        path: 'user-files/test.txt',
        filename: 'test.txt',
        contentType: 'text/plain',
      };

      const mockFindOne = jest.fn().mockResolvedValue(fileEntity);
      (fileRepository.findOne as jest.Mock) = mockFindOne;

      // Act & Assert
      await expect(
        service.getDownloadUrlData(fileId, userId),
      ).rejects.toThrow();
    });

    it('should throw error if provider does not implement generateDownloadUrl', async () => {
      // Arrange
      const fileEntity = {
        id: fileId,
        userId,
        provider: 'azure',
        path: 'user-files/test.txt',
        filename: 'test.txt',
        contentType: 'text/plain',
      };
      (fileRepository.findOne as jest.Mock).mockResolvedValue(fileEntity);

      // Temporarily break the mock provider
      const originalAzureProvider: StorageProvider | undefined = service[
        'availableProviders'
      ].find((p) => p.getProviderName() === 'azure');
      if (originalAzureProvider) {
        const originalMethod = originalAzureProvider.generateDownloadUrl;
        // Temporarily cast to allow undefined for the test
        (
          originalAzureProvider as {
            generateDownloadUrl?: typeof originalMethod;
          }
        ).generateDownloadUrl = undefined;
        await expect(
          service.getDownloadUrlData(fileId, userId),
        ).rejects.toThrow(
          'generateDownloadUrl method not implemented for provider azure.',
        );
        // Restore the method
        (
          originalAzureProvider as {
            generateDownloadUrl?: typeof originalMethod;
          }
        ).generateDownloadUrl = originalMethod;
      } else {
        throw new Error('Azure mock provider not found for test setup');
      }
    });

    it('should throw error if provider fails to generate URL', async () => {
      // Arrange
      const fileEntity = {
        id: fileId,
        userId,
        provider: 'azure',
        path: 'user-files/test.txt',
        filename: 'test.txt',
        contentType: 'text/plain',
      };
      (fileRepository.findOne as jest.Mock).mockResolvedValue(fileEntity);

      // Make the mock provider throw an error
      const azureProvider = service['availableProviders'].find(
        (p) => p.getProviderName() === 'azure',
      );
      if (azureProvider) {
        jest
          .spyOn(azureProvider, 'generateDownloadUrl')
          .mockRejectedValueOnce(new Error('Azure URL gen failed'));
        await expect(
          service.getDownloadUrlData(fileId, userId),
        ).rejects.toThrow(
          'Could not generate download URL from azure at this time. Please try again later. Original error: Azure URL gen failed',
        );
      } else {
        throw new Error('Azure mock provider not found for test setup');
      }
    });
  });
});
