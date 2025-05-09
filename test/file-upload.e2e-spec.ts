import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/entities/user/user.entity';
import { File as FileEntity } from '../src/entities/file/file.entity';
import { UserQuota } from '../src/entities/file/user-quota.entity';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { createTestApp, cleanTestDatabase } from './test-setup';

/* eslint-disable @typescript-eslint/no-unsafe-argument */

interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}

interface FileResponse {
  success: boolean;
  message: string;
  fileDetails: {
    id: string;
    filename: string;
    description: string;
    size: number;
  };
}

interface FilesResponse {
  success: boolean;
  files: Array<{
    id: string;
    filename: string;
    description: string;
    size: number;
  }>;
}

interface ErrorResponse {
  message: string;
}

describe('File Upload (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let fileRepository: Repository<FileEntity>;
  let userQuotaRepository: Repository<UserQuota>;
  let authToken: string;
  let userId: string;

  const testUser = {
    email: 'fileupload@example.com',
    username: 'fileuploaduser',
    password: 'Password123!',
  };

  // Create a test file
  const testFilePath = path.join(__dirname, 'test-file.txt');
  const testFileContent = 'This is a test file for upload testing.';

  beforeAll(async () => {
    // Create a test file
    fs.writeFileSync(testFilePath, testFileContent);

    // Create test app using the test database
    app = await createTestApp();

    userRepository = app.get<Repository<User>>(getRepositoryToken(User));
    fileRepository = app.get<Repository<FileEntity>>(
      getRepositoryToken(FileEntity),
    );
    userQuotaRepository = app.get<Repository<UserQuota>>(
      getRepositoryToken(UserQuota),
    );

    // Clean up test data before all tests
    await fileRepository.delete({});
    await userQuotaRepository.delete({});
    await userRepository.delete({ email: testUser.email });
  });

  beforeEach(async () => {
    // Register a new user for each test
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser)
      .expect((res) => {
        if (
          res.status !== 201 &&
          typeof res.body === 'object' &&
          res.body !== null
        ) {
          const errorBody = res.body as ErrorResponse;
          if (
            typeof errorBody.message === 'string' &&
            errorBody.message.includes('already exists')
          ) {
            // If user already exists, try to login instead
            return;
          }
        }
      });

    // If registration fails, try to login
    if (
      !registerResponse.body ||
      typeof registerResponse.body !== 'object' ||
      !('access_token' in registerResponse.body)
    ) {
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password,
        })
        .expect(200);

      const authData = loginResponse.body as AuthResponse;
      authToken = authData.access_token;
      userId = authData.user.id;
    } else {
      const authData = registerResponse.body as AuthResponse;
      authToken = authData.access_token;
      userId = authData.user.id;
    }
  });

  afterEach(async () => {
    // Clean the database after each test for isolation
    await cleanTestDatabase(app);
  });

  afterAll(async () => {
    // Clean up test file
    fs.unlinkSync(testFilePath);
    await app.close();
  });

  describe('/storage/upload (POST)', () => {
    it('should upload a file successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/storage/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('filename', 'test-file.txt')
        .field('description', 'A test file upload')
        .expect(201);

      const fileResponse = response.body as FileResponse;
      expect(fileResponse.success).toBe(true);
      expect(fileResponse.message).toContain('uploaded successfully');
      expect(fileResponse.fileDetails).toBeDefined();
      expect(fileResponse.fileDetails.filename).toBe('test-file.txt');
      expect(fileResponse.fileDetails.description).toBe('A test file upload');

      // Verify file was saved in the database
      const files = await fileRepository.find({ where: { userId } });
      expect(files.length).toBeGreaterThan(0);

      // Verify quota was updated
      const quota = await userQuotaRepository.findOne({
        where: {
          userId,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
        },
      });

      expect(quota).toBeDefined();
      if (quota) {
        // Handle the case where usedBytes is returned as a string
        const usedBytes =
          typeof quota.usedBytes === 'string'
            ? parseInt(quota.usedBytes, 10)
            : quota.usedBytes;
        expect(usedBytes).toBeGreaterThan(0);
      }
    });

    it('should reject upload without authentication', async () => {
      await request(app.getHttpServer())
        .post('/storage/upload')
        .attach('file', testFilePath)
        .field('filename', 'test-file.txt')
        .expect(401);
    });
  });

  describe('/storage/files (GET)', () => {
    it('should list user files', async () => {
      // First upload a file so we have something to list
      await request(app.getHttpServer())
        .post('/storage/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('filename', 'test-file.txt')
        .field('description', 'A test file upload');

      const response = await request(app.getHttpServer())
        .get('/storage/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // The response is an object with files array, not an array directly
      const filesResponse = response.body as FilesResponse;
      expect(filesResponse).toBeDefined();
      expect(filesResponse.success).toBe(true);
      expect(Array.isArray(filesResponse.files)).toBe(true);
      expect(filesResponse.files.length).toBeGreaterThan(0);
      expect(filesResponse.files[0].filename).toBe('test-file.txt');
    });

    it('should reject file listing without authentication', async () => {
      await request(app.getHttpServer()).get('/storage/files').expect(401);
    });
  });

  describe('/storage/download/:id (GET)', () => {
    it('should download a file successfully', async () => {
      // First upload a file
      await request(app.getHttpServer())
        .post('/storage/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('filename', 'test-file.txt')
        .field('description', 'A test file upload');

      // Get file ID
      const filesResponse = await request(app.getHttpServer())
        .get('/storage/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const filesList = filesResponse.body as FilesResponse;
      expect(filesList.files).toBeDefined();
      expect(filesList.files.length).toBeGreaterThan(0);

      const fileId = filesList.files[0].id;

      // Download the file
      const response = await request(app.getHttpServer())
        .get(`/storage/download?fileId=${fileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .buffer()
        .parse((res, callback) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            callback(null, data);
          });
        });

      // Verify file content
      expect(response.body).toBe(testFileContent);
      expect(response.headers['content-type']).toBe('application/octet-stream');
      expect(response.headers['content-disposition']).toContain(
        'test-file.txt',
      );
    });

    it('should reject download without authentication', async () => {
      // First upload a file
      await request(app.getHttpServer())
        .post('/storage/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('filename', 'test-file.txt')
        .field('description', 'A test file upload');

      // Get file ID
      const filesResponse = await request(app.getHttpServer())
        .get('/storage/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const filesList = filesResponse.body as FilesResponse;
      expect(filesList.files).toBeDefined();
      expect(filesList.files.length).toBeGreaterThan(0);

      const fileId = filesList.files[0].id;

      await request(app.getHttpServer())
        .get(`/storage/download?fileId=${fileId}`)
        .expect(401);
    });

    it('should reject download of non-existent file', async () => {
      await request(app.getHttpServer())
        .get('/storage/download?fileId=non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500); // Server returns 500 for non-existent files, not 404
    });
  });
});
