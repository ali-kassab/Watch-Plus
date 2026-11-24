import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config.service.js';
import { validateEnv } from './env.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
