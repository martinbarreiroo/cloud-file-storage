import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user/user.entity';
import { UserQuota } from 'src/entities/file/user-quota.entity';
import { Repository, In } from 'typeorm';
import { File } from 'src/entities/file/file.entity';
import { BYTES_IN_MB, BYTES_IN_GB } from 'src/constants/quota.constants';

interface UserStorageStats {
  userId: string;
  username: string;
  email: string;
  uploadedBytes: number;
  uploadedBytesFormatted: string;
  fileCount: number;
}

// Interface for the raw query result
interface FileUploadStats {
  userId: string;
  totalBytes: string;
  fileCount: string;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserQuota)
    private userQuotaRepository: Repository<UserQuota>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
  ) {}

  async getDailyStats(): Promise<UserStorageStats[]> {
    // Get current date boundaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get files uploaded today
    const filesUploadedToday = await this.fileRepository
      .createQueryBuilder('file')
      .select('file.userId', 'userId')
      .addSelect('SUM(file.size)', 'totalBytes')
      .addSelect('COUNT(file.id)', 'fileCount')
      .where('file.createdAt >= :startDate', { startDate: today })
      .andWhere('file.createdAt < :endDate', { endDate: tomorrow })
      .groupBy('file.userId')
      .getRawMany();

    // Return early if no files were uploaded today
    if (!filesUploadedToday.length) {
      return [];
    }

    // Get user information for the users with uploads
    const userIds = filesUploadedToday.map(
      (file: FileUploadStats) => file.userId,
    );
    const users = await this.userRepository.findBy({ id: In(userIds) });

    // Map data to return format
    return filesUploadedToday.map((fileStats: FileUploadStats) => {
      const user = users.find((u) => u.id === fileStats.userId);
      const uploadedBytes = parseInt(fileStats.totalBytes, 10);

      // Format the size
      let uploadedBytesFormatted: string;
      if (uploadedBytes >= BYTES_IN_GB) {
        uploadedBytesFormatted = `${(uploadedBytes / BYTES_IN_GB).toFixed(2)} GB`;
      } else {
        uploadedBytesFormatted = `${Math.round(uploadedBytes / BYTES_IN_MB)} MB`;
      }

      return {
        userId: fileStats.userId,
        username: user?.username || 'Unknown',
        email: user?.email || 'Unknown',
        uploadedBytes,
        uploadedBytesFormatted,
        fileCount: parseInt(fileStats.fileCount, 10),
      };
    });
  }
}
