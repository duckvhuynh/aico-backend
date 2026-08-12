import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import {
  appConfig,
  authConfig,
  databaseConfig,
  objectStorageConfig,
  workerConfig,
} from './config/configuration';
import { configurationSchema } from './config/validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { DurabilitySpikeModule } from './modules/durability-spike/durability-spike.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, authConfig, databaseConfig, workerConfig, objectStorageConfig],
      validationSchema: configurationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
    DatabaseModule,
    DurabilitySpikeModule,
  ],
})
export class DurableWaitSpikeModule {}
