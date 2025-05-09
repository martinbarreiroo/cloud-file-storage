import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/entities/user/user.entity';
import { Repository } from 'typeorm';
import { createTestApp, cleanTestDatabase } from './test-setup';

/* eslint-disable @typescript-eslint/no-unsafe-argument */

interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    username: string;
    password?: string;
  };
}

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;

  const testUser = {
    email: 'test@example.com',
    username: 'testuser',
    password: 'Password123!',
  };

  beforeAll(async () => {
    // Use the test app setup
    app = await createTestApp();

    userRepository = app.get<Repository<User>>(getRepositoryToken(User));

    // Clean up test users before starting
    await userRepository.delete({ email: testUser.email });
  });

  afterEach(async () => {
    // Clean database between tests
    await cleanTestDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201)
        .expect((res) => {
          const response = res.body as AuthResponse;
          expect(response.access_token).toBeDefined();
          expect(response.user).toBeDefined();
          expect(response.user.email).toEqual(testUser.email);
          expect(response.user.username).toEqual(testUser.username);
          // Password should never be returned
          expect(response.user.password).toBeUndefined();
        });
    });

    it('should reject registration with existing email', async () => {
      // First create a user that will conflict
      const sameEmailUser = {
        ...testUser,
      };

      // First registration should succeed
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(sameEmailUser);

      // Second registration with same email should fail
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(sameEmailUser)
        .expect((res) => {
          expect(res.status).not.toBe(201); // It shouldn't be a success
        });
    });

    it('should reject registration with invalid data', () => {
      const invalidUser = {
        email: 'not-an-email',
        username: 'us', // too short
        password: '123', // too simple
      };

      return request(app.getHttpServer())
        .post('/auth/register')
        .send(invalidUser)
        .expect(400); // Bad request - validation errors
    });
  });

  describe('/auth/login (POST)', () => {
    it('should authenticate a valid user and return a token', async () => {
      // Make sure the user exists first (register if needed)
      try {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(testUser);
      } catch (e) {
        console.log(e);
      }

      // Now try to login
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(201)
        .expect((res) => {
          const response = res.body as AuthResponse;
          expect(response.access_token).toBeDefined();
          expect(response.user).toBeDefined();
          expect(response.user.email).toEqual(testUser.email);
        });
    });

    it('should reject authentication with wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'wrong-password',
        })
        .expect(401); // Unauthorized
    });

    it('should reject authentication with non-existent user', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'doesnt-matter',
        })
        .expect(401); // Unauthorized
    });
  });

  describe('JWT Protected Routes', () => {
    let authToken: string;

    beforeAll(async () => {
      // Register a new user for this test group
      try {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(testUser);
      } catch (e) {
        console.log(e);
      }

      // Login to get a token
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      const authData = response.body as AuthResponse;
      authToken = authData.access_token;
    });

    it('should access protected route with valid token', () => {
      return request(app.getHttpServer())
        .get('/storage/status') // A JWT-protected route
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('should reject access to protected route without token', () => {
      return request(app.getHttpServer()).get('/storage/status').expect(401); // Unauthorized
    });

    it('should reject access with invalid token', () => {
      return request(app.getHttpServer())
        .get('/storage/status')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401); // Unauthorized
    });
  });
});
