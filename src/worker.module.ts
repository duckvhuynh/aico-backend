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
import { assertConfiguration } from './config/validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { OrchestrationModule } from './modules/orchestration/orchestration.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, authConfig, databaseConfig, workerConfig, objectStorageConfig],
      validate: assertConfiguration,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    DatabaseModule,
    GovernanceModule,
    OrchestrationModule,
  ],
})
export class WorkerModule {}
