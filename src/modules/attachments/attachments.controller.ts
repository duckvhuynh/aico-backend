import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentActor } from '../../common/http/current-actor.decorator';
import { requireIdempotencyKey } from '../../common/http/command-headers';
import type { ContextRequest, RequestActor } from '../../common/http/request-context';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@Controller({ path: 'attachments', version: '1' })
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @HttpCode(201)
  async create(
    @CurrentActor() actor: RequestActor,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateAttachmentDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const request = response.req as ContextRequest;
    const result = await this.attachments.ingest(
      actor,
      requireIdempotencyKey(key),
      request.correlationId,
      dto,
    );
    response.status(result.status);
    response.setHeader('Idempotency-Key', key as string);
    response.setHeader('Location', `/api/v1/attachments/${result.body.id as string}`);
    return {
      data: result.body,
      meta: { correlation_id: request.correlationId, replayed: result.replayed },
    };
  }

  @Get(':attachmentId')
  async get(
    @CurrentActor() actor: RequestActor,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const metadata = await this.attachments.getMetadata(actor, attachmentId);
    return {
      data: metadata,
      meta: { correlation_id: (response.req as ContextRequest).correlationId },
    };
  }
}
