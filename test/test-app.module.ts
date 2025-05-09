import { Module } from '@nestjs/common';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/entities/user/users.module';
import { StorageModule } from '../src/entities/file/storage.module';
import { AdminModule } from '../src/entities/admin/admin.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../src/entities/user/user.entity';
import { File } from '../src/entities/file/file.entity';
import { UserQuota } from '../src/entities/file/user-quota.entity';
import { ConfigModule } from '@nestjs/config';

/**
 * Special module configuration for E2E tests
 * This module connects to the test database instance
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      // Load .env file but override with test values
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      name: 'default', // Override the default connection
      type: 'postgres',
      host: 'localhost',
      port: 5433, // Test DB port
      username: 'test',
      password: 'test',
      database: 'cloud-file-storage-test',
      entities: [User, File, UserQuota],
      synchronize: true, // Always synchronize test database
      dropSchema: false, // Don't drop schema by default
      autoLoadEntities: true,
    }),
    AuthModule,
    UsersModule,
    StorageModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class TestAppModule {}
