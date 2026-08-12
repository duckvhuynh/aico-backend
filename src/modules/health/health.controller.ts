import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Public } from '../../common/http/public.decorator';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  private readonly objectStore: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>('objectStorage.bucket');
    this.objectStore = new S3Client({
      endpoint: config.getOrThrow<string>('objectStorage.endpoint'),
      region: config.getOrThrow<string>('objectStorage.region'),
      forcePathStyle: config.getOrThrow<boolean>('objectStorage.forcePathStyle'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('objectStorage.accessKey'),
        secretAccessKey: config.getOrThrow<string>('objectStorage.secretKey'),
      },
    });
  }

  @Public()
  @Get('live')
  liveness(): Record<string, unknown> {
    return { status: 'ok', role: 'api' };
  }

  @Public()
  @Get('ready')
  async readiness(): Promise<Record<string, unknown>> {
    const checks: Record<string, string> = {
      database: 'down',
      object_store: 'down',
      migrations: 'unknown',
    };
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'up';
      const rows = await this.dataSource.query<Array<{ compatible: boolean }>>(
        `SELECT to_regclass('public.runs') IS NOT NULL AS compatible`,
      );
      checks.migrations = rows[0]?.compatible ? 'compatible' : 'missing';
      await this.objectStore.send(new HeadBucketCommand({ Bucket: this.bucket }));
      checks.object_store = 'up';
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready', role: 'api', checks });
    }
    if (checks.migrations !== 'compatible') {
      throw new ServiceUnavailableException({ status: 'not_ready', role: 'api', checks });
    }
    return { status: 'ready', role: 'api', checks };
  }
}
