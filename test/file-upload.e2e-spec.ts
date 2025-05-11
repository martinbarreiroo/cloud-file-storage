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
import { v4 as uuidv4 } from 'uuid';

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

interface DownloadUrlApiResponse {
  downloadUrl: string;
  filename: string;
  contentType: string;
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
          email: testUser.email,
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
        // Attach a minimal buffer instead of a real file path for this auth test
        .attach('file', Buffer.from('tiny'), 'tiny.txt')
        .field('filename', 'test-file-auth-reject.txt') // Still send a filename field
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

  describe('/storage/download-url (GET)', () => {
    it('should get a download URL successfully', async () => {
      // First upload a file
      const uploadResponse = await request(app.getHttpServer())
        .post('/storage/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('filename', 'test-file.txt')
        .field('description', 'A test file for download URL')
        .field('contentType', 'text/plain');

      const uploadedFileDetails = uploadResponse.body as FileResponse;
      expect(uploadedFileDetails.success).toBe(true);
      const fileId = uploadedFileDetails.fileDetails.id;

      // Get the download URL
      const response = await request(app.getHttpServer())
        .get(`/storage/download-url?fileId=${fileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify the response body for the download URL
      const urlResponse = response.body as DownloadUrlApiResponse;
      expect(urlResponse.downloadUrl).toBeDefined();
      expect(typeof urlResponse.downloadUrl).toBe('string');
      // Basic check for a URL pattern (can be made more sophisticated)
      expect(urlResponse.downloadUrl).toMatch(/^https?:\/\//);
      expect(urlResponse.filename).toBe('test-file.txt'); // Check original filename
      // The contentType might be auto-detected or octet-stream if not perfectly set during upload mock/test
      // For this test, let's assume it should be 'text/plain' or what the upload mock sets.
      // If test-file.txt is used directly, it's often treated as application/octet-stream by supertest if not specified by server
      // However, our service now attempts to auto-detect. For a .txt file, it should be text/plain.
      // Let's check against the uploaded file's determined content type or a reasonable expectation.
      // If the upload actually determined it as 'text/plain', then this should match.
      // The fileEntity.contentType in DB will be the source of truth for this response field.
      expect(urlResponse.contentType).toBeDefined();
      // To be more precise, we could fetch the file metadata from DB first or check against what upload step returned if it had contentType
      // For now, checking if it's defined is a good first step.
      // If the content type of test-file.txt is known, it can be asserted here.
      // Defaulting to check if it is 'text/plain' as it's a .txt file.
      // This might need adjustment based on how contentType is determined for 'test-file.txt' in the test setup.
      // The actual content type is stored in the database by the upload service, and that's what this endpoint returns.
      // For a .txt file uploaded, it should likely be 'text/plain'
      // If the test file 'test-file.txt' is used, its mimetype is 'text/plain' if correctly identified.
      // The `fileType.fromBuffer` in StorageService should identify it as text/plain.
      expect(urlResponse.contentType).toEqual('text/plain');
    });

    it('should reject getting download URL without authentication', async () => {
      // Upload a file first to ensure a fileId exists
      const uploadResponse = await request(app.getHttpServer())
        .post('/storage/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testFilePath)
        .field('filename', 'test-auth-check.txt');
      const fileId = (uploadResponse.body as FileResponse).fileDetails.id;

      await request(app.getHttpServer())
        .get(`/storage/download-url?fileId=${fileId}`)
        .expect(401);
    });

    it('should reject getting download URL for a non-existent file', async () => {
      const nonExistentFileId = uuidv4();
      await request(app.getHttpServer())
        .get(`/storage/download-url?fileId=${nonExistentFileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
