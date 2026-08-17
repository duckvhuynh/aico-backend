import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentActor } from '../../common/http/current-actor.decorator';
import { formatEtag } from '../../common/http/command-headers';
import type { ContextRequest, RequestActor } from '../../common/http/request-context';
import { AttachmentRetrievalService } from '../attachments/attachment-retrieval.service';
import { EventQueryDto } from './dto/event-query.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { RunsService } from './runs.service';

@Controller({ path: 'runs', version: '1' })
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly attachments: AttachmentRetrievalService,
  ) {}

  @Get(':runId/attachments/:attachmentId')
  async retrieveAttachment(
    @CurrentActor() actor: RequestActor,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.attachments.retrieveForRun(actor, runId, attachmentId);
    response.setHeader('Content-Type', result.mediaType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename.replaceAll('"', '')}"`,
    );
    return new StreamableFile(result.body);
  }

  @Get(':runId')
  async get(
    @CurrentActor() actor: RequestActor,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const run = await this.runs.get(actor, runId);
    response.setHeader('ETag', formatEtag(run.version as number));
    return {
      data: run,
      meta: { correlation_id: (response.req as ContextRequest).correlationId },
    };
  }

  @Get(':runId/tasks')
  async tasks(
    @CurrentActor() actor: RequestActor,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query() query: TaskQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const tasks = await this.runs.tasks(actor, runId, query);
    return {
      data: tasks,
      page: { next_cursor: null, has_more: false },
      meta: { correlation_id: (response.req as ContextRequest).correlationId },
    };
  }

  @Get(':runId/events')
  async events(
    @CurrentActor() actor: RequestActor,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query() query: EventQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const result = await this.runs.events(actor, runId, query);
    return {
      data: result.events,
      page: { next_cursor: null, has_more: result.hasMore },
      meta: { correlation_id: (response.req as ContextRequest).correlationId },
    };
  }

  @Delete(':runId')
  async remove(
    @CurrentActor() actor: RequestActor,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<void> {
    await this.runs.denyDelete(actor, runId);
  }
}
