import { Test, TestingModule } from '@nestjs/testing';
import { UserQuotaService } from './user-quota.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserQuota } from '../entities/file/user-quota.entity';
import { QUOTA_LIMIT } from '../constants/quota.constants';

// Define a test version of UserQuota that allows null user
interface TestUserQuota extends Omit<UserQuota, 'user'> {
  user: null | UserQuota['user'];
}

// Interface for mock repository
interface MockRepository {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
}

describe('UserQuotaService', () => {
  let service: UserQuotaService;
  let mockRepository: MockRepository;

  const userId = 'test-user-id';

  beforeEach(async () => {
    // Mock repository implementation
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserQuotaService,
        {
          provide: getRepositoryToken(UserQuota),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UserQuotaService>(UserQuotaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCurrentMonthQuota', () => {
    it('should return existing quota if found', async () => {
      // Arrange
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      const existingQuota: TestUserQuota = {
        id: 'quota-id-1',
        userId,
        month,
        year,
        usedBytes: 1000,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: null,
      };

      mockRepository.findOne.mockResolvedValue(existingQuota);

      // Act
      const result = await service.getCurrentMonthQuota(userId);

      // Assert
      expect(result).toEqual(existingQuota);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          userId,
          month,
          year,
        },
      });
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should create new quota if not found for current month', async () => {
      // Arrange
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      const newQuota = {
        userId,
        month,
        year,
        usedBytes: 0,
      };

      const savedQuota: TestUserQuota = {
        id: 'quota-id-1',
        ...newQuota,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: null,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(newQuota);
      mockRepository.save.mockResolvedValue(savedQuota);

      // Act
      const result = await service.getCurrentMonthQuota(userId);

      // Assert
      expect(result).toEqual(newQuota);
      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalledWith(newQuota);
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('hasEnoughQuota', () => {
    it('should return true if user has enough quota', async () => {
      // Arrange
      const fileSizeBytes = 1000;
      const usedBytes = QUOTA_LIMIT - 2000; // 2000 bytes remaining

      const quotaWithEnoughSpace: TestUserQuota = {
        id: 'quota-id-1',
        userId,
        month: 1,
        year: 2025,
        usedBytes,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: null,
      };

      jest
        .spyOn(service, 'getCurrentMonthQuota')
        .mockResolvedValue(quotaWithEnoughSpace as UserQuota);

      // Act
      const result = await service.hasEnoughQuota(userId, fileSizeBytes);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false if user does not have enough quota', async () => {
      // Arrange
      const fileSizeBytes = 2000;
      const usedBytes = QUOTA_LIMIT - 1000; // 1000 bytes remaining

      const quotaWithInsufficientSpace: TestUserQuota = {
        id: 'quota-id-1',
        userId,
        month: 1,
        year: 2025,
        usedBytes,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: null,
      };

      jest
        .spyOn(service, 'getCurrentMonthQuota')
        .mockResolvedValue(quotaWithInsufficientSpace as UserQuota);

      // Act
      const result = await service.hasEnoughQuota(userId, fileSizeBytes);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('incrementUsedQuota', () => {
    it('should correctly increment the used quota', async () => {
      // Arrange
      const initialUsedBytes = 1000;
      const fileSizeBytes = 500;
      const expectedUsedBytes = initialUsedBytes + fileSizeBytes;

      const quota: TestUserQuota = {
        id: 'quota-id-1',
        userId,
        month: 1,
        year: 2025,
        usedBytes: initialUsedBytes,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: null,
      };

      jest
        .spyOn(service, 'getCurrentMonthQuota')
        .mockResolvedValue(quota as UserQuota);

      mockRepository.save.mockImplementation((savedQuota) =>
        Promise.resolve(savedQuota),
      );

      // Act
      const result = await service.incrementUsedQuota(userId, fileSizeBytes);

      // Assert
      expect(result.usedBytes).toBe(expectedUsedBytes);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          usedBytes: expectedUsedBytes,
        }),
      );
    });
  });

  describe('getQuotaInfo', () => {
    it('should return correct quota info', async () => {
      // Arrange
      const usedBytes = 1024 * 1024; // 1MB

      const quota: TestUserQuota = {
        id: 'quota-id-1',
        userId,
        month: 1,
        year: 2025,
        usedBytes,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: null,
      };

      jest
        .spyOn(service, 'getCurrentMonthQuota')
        .mockResolvedValue(quota as UserQuota);

      // Act
      const result = await service.getQuotaInfo(userId);

      // Assert
      expect(result).toEqual({
        usedBytes,
        totalBytes: QUOTA_LIMIT,
        remainingBytes: QUOTA_LIMIT - usedBytes,
        percentUsed: (usedBytes / QUOTA_LIMIT) * 100,
      });
    });
  });
});
