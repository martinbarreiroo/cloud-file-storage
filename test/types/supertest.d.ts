import * as supertest from 'supertest';
import { INestApplication } from '@nestjs/common';

declare module 'supertest' {
  interface SuperTest<T extends supertest.Test> {
    (app: ReturnType<INestApplication['getHttpServer']>): T;
  }
}
