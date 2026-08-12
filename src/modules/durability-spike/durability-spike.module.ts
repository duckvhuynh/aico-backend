import { Module } from '@nestjs/common';
import { GovernanceModule } from '../governance/governance.module';
import { DeterministicModelProvider } from '../orchestration/deterministic-model.provider';
import { MODEL_PROVIDER } from '../orchestration/model-provider.port';
import { OrchestrationWorkerService } from '../orchestration/orchestration-worker.service';
import { OutboxPublisherService } from '../orchestration/outbox-publisher.service';
import { DurableWaitSpikeService } from './durable-wait-spike.service';

@Module({
  imports: [GovernanceModule],
  providers: [
    DurableWaitSpikeService,
    DeterministicModelProvider,
    { provide: MODEL_PROVIDER, useExisting: DeterministicModelProvider },
    OrchestrationWorkerService,
    OutboxPublisherService,
  ],
  exports: [DurableWaitSpikeService, OrchestrationWorkerService, OutboxPublisherService],
})
export class DurabilitySpikeModule {}
