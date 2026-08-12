import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { OrchestrationWorkerService } from './orchestration-worker.service';
import { OutboxPublisherService } from './outbox-publisher.service';

@Injectable()
export class WorkerLoopService implements OnModuleInit, OnApplicationShutdown {
  private stopped = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly worker: OrchestrationWorkerService,
    private readonly outbox: OutboxPublisherService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WorkerLoopService.name);
  }

  onModuleInit(): void {
    this.loopPromise = this.runLoop();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    await this.loopPromise;
  }

  private async runLoop(): Promise<void> {
    const pollInterval = this.config.getOrThrow<number>('worker.pollIntervalMs');
    this.logger.info({ pollInterval }, 'Durable worker loop started');
    while (!this.stopped) {
      const published = await this.outbox.publishOnce();
      const processed = await this.worker.processOnce();
      if (!published && !processed) {
        await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
      }
    }
  }
}
