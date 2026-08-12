import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('database.url'),
        ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: true } : false,
        synchronize: false,
        migrationsRun: false,
        autoLoadEntities: false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsTableName: 'aico_migrations',
        applicationName: 'aico-backend',
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
