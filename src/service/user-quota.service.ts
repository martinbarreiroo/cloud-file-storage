import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserQuota } from '../entities/file/user-quota.entity';
import { QUOTA_LIMIT } from '../constants/quota.constants';

@Injectable()
export class UserQuotaService {
  private readonly logger = new Logger(UserQuotaService.name);

  constructor(
    @InjectRepository(UserQuota)
    private userQuotaRepository: Repository<UserQuota>,
  ) {}

  /**
   * Get or create a quota record for the current month
   */
  async getCurrentMonthQuota(userId: string): Promise<UserQuota> {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // getMonth returns 0-11
    const currentYear = now.getFullYear();

    let quota = await this.userQuotaRepository.findOne({
      where: {
        userId,
        month: currentMonth,
        year: currentYear,
      },
    });

    if (!quota) {
      // Create a new quota record for this month
      quota = this.userQuotaRepository.create({
        userId,
        month: currentMonth,
        year: currentYear,
        usedBytes: 0,
      });
      await this.userQuotaRepository.save(quota);
      this.logger.log(
        `Created new quota record for user ${userId} for ${currentMonth}/${currentYear}`,
      );
    }

    return quota;
  }

  /**
   * Check if user has enough quota to upload a file
   */
  async hasEnoughQuota(
    userId: string,
    fileSizeBytes: number,
  ): Promise<boolean> {
    const quota = await this.getCurrentMonthQuota(userId);
    const remainingBytes = QUOTA_LIMIT - quota.usedBytes;

    return fileSizeBytes <= remainingBytes;
  }

  /**
   * Get remaining quota in bytes
   */
  async getRemainingQuota(userId: string): Promise<number> {
    const quota = await this.getCurrentMonthQuota(userId);
    return Math.max(0, QUOTA_LIMIT - quota.usedBytes);
  }

  /**
   * Update user quota after file upload
   */
  async incrementUsedQuota(
    userId: string,
    fileSizeBytes: number,
  ): Promise<UserQuota> {
    const quota = await this.getCurrentMonthQuota(userId);

    // Fix string concatenation bug - ensure both are treated as numbers
    const currentBytes = Number(quota.usedBytes);
    quota.usedBytes = currentBytes + Number(fileSizeBytes);

    this.logger.log(
      `Updated quota for user ${userId}: ${quota.usedBytes} bytes used (added ${fileSizeBytes} bytes)`,
    );
    await this.userQuotaRepository.save(quota);

    return quota;
  }

  /**
   * Get user's quota usage info
   */
  async getQuotaInfo(userId: string): Promise<{
    usedBytes: number;
    totalBytes: number;
    remainingBytes: number;
    percentUsed: number;
  }> {
    const quota = await this.getCurrentMonthQuota(userId);
    const usedBytes = quota.usedBytes;
    const totalBytes = QUOTA_LIMIT;
    const remainingBytes = Math.max(0, totalBytes - usedBytes);
    const percentUsed = (usedBytes / totalBytes) * 100;

    return {
      usedBytes,
      totalBytes,
      remainingBytes,
      percentUsed,
    };
  }
}
