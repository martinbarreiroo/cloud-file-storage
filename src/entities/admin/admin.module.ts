import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { File } from '../file/file.entity';
import { UserQuota } from '../file/user-quota.entity';
import { AdminService } from '../../service/admin.service';
import { AdminController } from '../../controller/admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, File, UserQuota])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
