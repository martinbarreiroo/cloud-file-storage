import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from './file.entity';
import { UserQuota } from './user-quota.entity';
import { StorageService } from '../../service/storage.service';
import { StorageController } from '../../controller/storage.controller';
import { AzureStorageProvider } from '../../providers/storage/azure-storage.provider';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserQuotaService } from '../../service/user-quota.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([File, UserQuota]),
    // Configure Multer to use memory storage for file uploads
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [StorageController],
  providers: [StorageService, AzureStorageProvider, UserQuotaService],
  exports: [StorageService, UserQuotaService],
})
export class StorageModule {}
