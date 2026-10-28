import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const webOrigin = configService.get<string>('WEB_ORIGIN', 'http://localhost:5173');

  // Prefix all routes with /api
  app.setGlobalPrefix('api');

  // CORS configuration
  app.enableCors({
    origin: [webOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('YouTube Automation Studio API')
    .setDescription(
      'REST API for planning, producing, reviewing, and publishing original faceless YouTube videos',
    )
    .setVersion('1.0')
    .addTag('Health', 'System health check and readiness probe')
    .addTag('Settings', 'Safe configuration and feature toggle status')
    .addTag('Channels', 'YouTube channel profile configuration')
    .addTag('Topics', 'Content ideas and topic backlog management')
    .addTag('Projects', 'Video project lifecycle and state machine')
    .addTag('Research', 'Factual source references and citation verification')
    .addTag('Scripts', 'Script generation, scene plans, and human approval gate')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'YouTube Automation Studio API Docs',
  });

  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}/api`);
  logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
