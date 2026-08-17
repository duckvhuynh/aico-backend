import { Module } from '@nestjs/common';
import { GovernanceModule } from '../governance/governance.module';
import { ObjectsModule } from '../objects/objects.module';
import { AttachmentRetrievalService } from './attachment-retrieval.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [GovernanceModule, ObjectsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentRetrievalService],
  exports: [AttachmentsService, AttachmentRetrievalService],
})
export class AttachmentsModule {}
