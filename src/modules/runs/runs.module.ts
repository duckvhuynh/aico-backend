import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [AttachmentsModule],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
