import { NestFactory } from '@nestjs/core';
import { DomainError } from './common/domain/domain-error';
import { DurableWaitSpikeModule } from './durable-wait-spike.module';
import { DurableWaitSpikeService } from './modules/durability-spike/durable-wait-spike.service';
import { OrchestrationWorkerService } from './modules/orchestration/orchestration-worker.service';
import { OutboxPublisherService } from './modules/orchestration/outbox-publisher.service';

interface SpikeInput {
  [key: string]: unknown;
}

function input(): SpikeInput {
  const encoded = process.env.AICO_SPIKE_INPUT_BASE64;
  if (!encoded) return {};
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SpikeInput;
}

function stringInput(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DurableWaitSpikeModule, { logger: false });
  const service = app.get(DurableWaitSpikeService);
  const worker = app.get(OrchestrationWorkerService);
  const outbox = app.get(OutboxPublisherService);
  const command = process.env.AICO_SPIKE_COMMAND;
  const value = input();
  let result: unknown;
  try {
    switch (command) {
      case 'open':
        result = await service.open(value as never);
        break;
      case 'answer':
        result = await service.answer(value as never);
        break;
      case 'inspect':
        result = await service.inspect(
          stringInput(value.companyId, 'companyId'),
          stringInput(value.runId, 'runId'),
        );
        break;
      case 'event-effect':
        result = await service.eventEffect(stringInput(value.eventId, 'eventId'));
        break;
      case 'append-concurrent-events':
        result = await service.appendConcurrentEvents(
          stringInput(value.companyId, 'companyId'),
          stringInput(value.runId, 'runId'),
          stringInput(value.actorId, 'actorId'),
          stringInput(value.correlationId, 'correlationId'),
          Number(value.count),
        );
        break;
      case 'cancel-fixture':
        result = await service.cancelFixture(
          stringInput(value.companyId, 'companyId'),
          stringInput(value.runId, 'runId'),
          stringInput(value.actorId, 'actorId'),
          stringInput(value.correlationId, 'correlationId'),
        );
        break;
      case 'worker-once':
        result = {
          processed: await worker.processOnce(
            value.runId === undefined ? undefined : stringInput(value.runId, 'runId'),
          ),
        };
        break;
      case 'publish-once':
        result = {
          published: await outbox.publishOnce({
            eventId:
              value.eventId === undefined ? undefined : stringInput(value.eventId, 'eventId'),
            stopAfterConsumerCommit: value.stopAfterConsumerCommit === true,
          }),
        };
        break;
      default:
        throw new Error(`Unsupported AICO_SPIKE_COMMAND: ${String(command)}`);
    }
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        command,
        process: { pid: process.pid, worker_id: process.env.WORKER_ID ?? 'local-worker-1' },
        result,
      })}\n`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((error: unknown) => {
  const domain = error instanceof DomainError ? error : null;
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        code: domain?.code ?? 'spike_command_failed',
        status: domain?.status ?? 500,
        message: error instanceof Error ? error.message : String(error),
      },
    })}\n`,
  );
  process.exitCode = 1;
});
