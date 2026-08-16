import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Cookie Parser ─────────────────────────────────────────────────────────
  app.use(cookieParser());

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true, // Required for HttpOnly cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── Global Validation Pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true,           // Auto-transform to DTO class instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Global API Prefix ─────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1', {
    exclude: ['api/docs', 'api/docs-json'], // Don't prefix Swagger
  });

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('RAG Chat API')
    .setDescription(
      'NestJS authentication gateway for the RAG Chatbot microservice.\n\n' +
        '## Roles\n' +
        '- **admin** — full access to chat + document upload + user management\n' +
        '- **user** — can use the chat endpoint\n' +
        '- **guest** — can use the chat endpoint up to **2 times per hour**\n\n' +
        '## Auth Flow\n' +
        '1. Call `/api/v1/auth/login` or `/api/v1/auth/guest-token`\n' +
        '2. Use the returned `accessToken` as `Authorization: Bearer <token>`\n' +
        '3. When it expires (15m), call `/api/v1/auth/refresh` — the HttpOnly ' +
        'cookie handles the refresh token automatically.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste your access token here',
      },
      'Bearer',
    )
    .addCookieAuth('refreshToken')
    .addTag('Auth', 'Authentication & token management')
    .addTag('Chat', 'RAG chatbot proxy endpoints')
    .addTag('Users (Admin)', 'User management — admin role required')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`\n🚀 NestJS Auth Gateway running on: http://localhost:${port}`);
  console.log(`📄 Swagger docs:                  http://localhost:${port}/api/docs`);
  console.log(`🤖 Proxying to RAG microservice:  ${process.env.RAG_MICROSERVICE_URL || 'http://localhost:8000'}\n`);
}

bootstrap();
