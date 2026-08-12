import { Module } from '@nestjs/common';
import { CommandExecutor } from './command-executor.service';
import { DomainEventService } from './domain-event.service';

@Module({
  providers: [CommandExecutor, DomainEventService],
  exports: [CommandExecutor, DomainEventService],
})
export class GovernanceModule {}
