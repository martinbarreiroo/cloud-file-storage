import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TestAppModule } from './test-app.module';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

/**
 * Creates a test application instance connected to the test database
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe());
  await app.init();

  return app;
}

/**
 * Cleans the test database between test runs.
 * Call this in afterEach or afterAll to ensure a clean slate
 */
export async function cleanTestDatabase(app: INestApplication) {
  // Get the data source from the app instance
  // Use 'default' as the connection name
  const dataSource = app.get<DataSource>(getDataSourceToken('default'));

  // Get all entities
  const entities = dataSource.entityMetadatas;

  // Clear data from all tables
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(`TRUNCATE "${entity.tableName}" CASCADE;`);
  }
}

/**
 * Completely resets the test database by dropping and recreating schema
 * Use with caution - this is destructive and slow
 */
export async function resetTestDatabase(app: INestApplication) {
  const dataSource = app.get<DataSource>(getDataSourceToken('default'));
  await dataSource.dropDatabase();
  await dataSource.synchronize();
}
