import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Transform payloads to be objects typed according to their DTO classes
    }),
  );

  // Setup Swagger
  const config = new DocumentBuilder()
    .setTitle('Cloud File Storage API')
    .setDescription('API documentation for Cloud File Storage')
    .setVersion('1.0')
    .addTag('auth', 'Authentication endpoints')
    .addTag('user', 'User management endpoints')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

// Handle the promise properly
void bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
