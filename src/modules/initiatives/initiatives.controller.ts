import { Body, Controller, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentActor } from '../../common/http/current-actor.decorator';
import { formatEtag, requireEtag, requireIdempotencyKey } from '../../common/http/command-headers';
import type { ContextRequest, RequestActor } from '../../common/http/request-context';
import { CreateGoalDto } from './dto/create-goal.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { InitiativesService } from './initiatives.service';

@Controller({ path: 'initiatives', version: '1' })
export class InitiativesController {
  constructor(private readonly initiatives: InitiativesService) {}

  @Post()
  @HttpCode(201)
  async create(
    @CurrentActor() actor: RequestActor,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateInitiativeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const request = response.req as ContextRequest;
    const result = await this.initiatives.create(
      actor,
      requireIdempotencyKey(key),
      request.correlationId,
      dto,
    );
    response.status(result.status);
    response.setHeader('Idempotency-Key', key as string);
    response.setHeader('ETag', formatEtag(result.body.row_version as number));
    response.setHeader('Location', `/api/v1/initiatives/${result.body.id as string}`);
    return {
      data: result.body,
      meta: { correlation_id: request.correlationId, replayed: result.replayed },
    };
  }

  @Post(':initiativeId/goals')
  @HttpCode(201)
  async createGoal(
    @CurrentActor() actor: RequestActor,
    @Param('initiativeId', ParseUUIDPipe) initiativeId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('if-match') etag: string | undefined,
    @Body() dto: CreateGoalDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const request = response.req as ContextRequest;
    const result = await this.initiatives.createGoalAndRun(
      actor,
      initiativeId,
      requireEtag(etag),
      requireIdempotencyKey(key),
      request.correlationId,
      dto,
    );
    const run = result.body.run as { id: string };
    response.status(result.status);
    response.setHeader('Idempotency-Key', key as string);
    response.setHeader('ETag', formatEtag(requireEtag(etag) + 1));
    response.setHeader('Location', `/api/v1/runs/${run.id}`);
    return {
      data: result.body,
      meta: { correlation_id: request.correlationId, replayed: result.replayed },
    };
  }
}
