import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './entities/user/users.module';
import { StorageModule } from './entities/file/storage.module';
import { AdminModule } from './entities/admin/admin.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user/user.entity';
import { File } from './entities/file/file.entity';
import { UserQuota } from './entities/file/user-quota.entity';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(), // Load environment variables
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD || 'admin',
      database: process.env.DB_NAME || 'cloud-file-storage-db',
      entities: [User, File, UserQuota],
      synchronize: true, // Force synchronize to true for now
      autoLoadEntities: true, // Auto-load all entities
    }),
    AuthModule,
    UsersModule,
    StorageModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
