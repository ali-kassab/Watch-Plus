import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.service.js';

/** HTTP-level setup shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const express = app as NestExpressApplication;
  const config = app.get(AppConfig);
  express.set('trust proxy', 'loopback');
  express.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  express.useBodyParser('json', { limit: '100kb' });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableCors({ origin: config.get('FRONTEND_URL'), credentials: true });
}
