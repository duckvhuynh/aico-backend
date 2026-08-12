import { Module } from '@nestjs/common';
import { GovernanceModule } from '../governance/governance.module';
import { DeterministicModelProvider } from './deterministic-model.provider';
import { MODEL_PROVIDER } from './model-provider.port';
import { OrchestrationWorkerService } from './orchestration-worker.service';
import { OutboxPublisherService } from './outbox-publisher.service';
import { WorkerLoopService } from './worker-loop.service';

@Module({
  imports: [GovernanceModule],
  providers: [
    DeterministicModelProvider,
    { provide: MODEL_PROVIDER, useExisting: DeterministicModelProvider },
    OrchestrationWorkerService,
    OutboxPublisherService,
    WorkerLoopService,
  ],
  exports: [OrchestrationWorkerService],
})
export class OrchestrationModule {}
