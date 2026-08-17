import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CorrelationMiddleware } from './common/http/correlation.middleware';
import {
  appConfig,
  authConfig,
  databaseConfig,
  objectStorageConfig,
  workerConfig,
} from './config/configuration';
import { assertConfiguration } from './config/validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { HealthModule } from './modules/health/health.module';
import { InitiativesModule } from './modules/initiatives/initiatives.module';
import { ObjectsModule } from './modules/objects/objects.module';
import { RunsModule } from './modules/runs/runs.module';

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
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.access_token',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    DatabaseModule,
    GovernanceModule,
    AuthModule,
    HealthModule,
    CompaniesModule,
    InitiativesModule,
    ObjectsModule,
    RunsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
  }
}
