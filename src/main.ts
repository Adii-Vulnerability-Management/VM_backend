import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { ConnectOptions } from 'mongoose';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const apiPrefix = process.env.API_PREFIX || 'priv';

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const frontendDist = join(__dirname, '..', 'frontend', 'dist');
  const publicAssets = join(__dirname, '..', 'public');

  if (existsSync(frontendDist)) {
    app.useStaticAssets(frontendDist);
    app.use((req, res, next) => {
      const path = req.originalUrl || req.url;
      if (path.startsWith(`/${apiPrefix}`) || path.includes('.')) {
        return next();
      }
      res.sendFile(join(frontendDist, 'index.html'));
    });
  } else {
    app.useStaticAssets(publicAssets);
    app.useStaticAssets(publicAssets, {
      prefix: `/${apiPrefix}/`,
    });
  }

  if (process.env.SWAGGER?.toLowerCase() === 'true') {
    const config = new DocumentBuilder()
      .setTitle('GRC API')
      .setDescription('Local development API')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  const mongoUrl = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/VM-dev';

  try {
    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 3000,
    } as ConnectOptions);
    console.log(`MongoDB connected to ${mongoUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (process.env.NODE_ENV !== 'production') {
      try {
        const mongoMemoryServer = await MongoMemoryServer.create();
        const memoryMongoUrl = await mongoMemoryServer.getUri();
        await mongoose.connect(memoryMongoUrl, {
          serverSelectionTimeoutMS: 3000,
        } as ConnectOptions);
        console.log(`MongoDB connected to embedded server at ${memoryMongoUrl}`);
      } catch (memoryError) {
        const memoryMessage = memoryError instanceof Error ? memoryError.message : String(memoryError);
        console.warn(`MongoDB unavailable at ${mongoUrl}. Continuing without database connection. ${message}`);
        console.warn(`Embedded MongoDB fallback also failed: ${memoryMessage}`);
      }
    } else {
      console.warn(`MongoDB unavailable at ${mongoUrl}. Continuing without database connection. ${message}`);
    }
  }

  const port = Number(process.env.PORT || 3000);
  const fallbackPort = await listenWithFallback(app, port, apiPrefix);
  console.log(`Application is running on: http://localhost:${fallbackPort}/${apiPrefix}`);
}

async function listenWithFallback(app: NestExpressApplication, port: number, apiPrefix: string) {
  let currentPort = port;

  while (true) {
    try {
      await app.listen(currentPort);
      return currentPort;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (err.code === 'EADDRINUSE') {
        console.warn(`Port ${currentPort} is busy. Trying ${currentPort + 1} instead.`);
        currentPort += 1;
        continue;
      }

      throw error;
    }
  }
}

bootstrap();
