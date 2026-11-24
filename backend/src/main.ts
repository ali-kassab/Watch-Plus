import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { AppConfig } from './config/app-config.service.js';

const production = process.env.NODE_ENV === 'production';
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bufferLogs: true,
  bodyParser: false,
  logger: new ConsoleLogger({
    json: production,
    colors: !production,
    logLevels: production ? ['log', 'warn', 'error', 'fatal'] : ['log', 'warn', 'error', 'fatal', 'debug'],
  }),
});
configureApp(app);
app.enableShutdownHooks();

const config = app.get(AppConfig);
if (!config.isProduction) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('PulseWatch API').setVersion('1.0').addBearerAuth().build(),
  );
  SwaggerModule.setup('api/docs', app, document);
}

await app.listen(config.get('PORT'));
console.info(`PulseWatch API listening on http://localhost:${config.get('PORT')}/api`);
