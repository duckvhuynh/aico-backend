import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { GovernanceModule } from '../governance/governance.module';
import { GoalScopePolicy } from './goal-scope.policy';
import { InitiativesController } from './initiatives.controller';
import { InitiativesService } from './initiatives.service';

@Module({
  imports: [GovernanceModule, AttachmentsModule],
  controllers: [InitiativesController],
  providers: [InitiativesService, GoalScopePolicy],
  exports: [InitiativesService, GoalScopePolicy],
})
export class InitiativesModule {}
