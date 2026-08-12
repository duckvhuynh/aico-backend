import { Body, Controller, Get, Headers, HttpCode, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentActor } from '../../common/http/current-actor.decorator';
import { formatEtag, requireEtag, requireIdempotencyKey } from '../../common/http/command-headers';
import type { ContextRequest, RequestActor } from '../../common/http/request-context';
import { CompaniesService } from './companies.service';
import { CompanyProfileDto } from './dto/company-profile.dto';
import { CreateCompanyDto } from './dto/create-company.dto';

@Controller({ path: 'companies', version: '1' })
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @HttpCode(201)
  async create(
    @CurrentActor() actor: RequestActor,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateCompanyDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const request = response.req as ContextRequest;
    const result = await this.companies.create(
      actor,
      requireIdempotencyKey(key),
      request.correlationId,
      dto,
    );
    response.status(result.status);
    response.setHeader('Location', '/api/v1/companies/current');
    response.setHeader('Idempotency-Key', key as string);
    const profile = result.body.current_profile as { version: number };
    response.setHeader('ETag', formatEtag(profile.version));
    return {
      data: result.body,
      meta: { correlation_id: request.correlationId, replayed: result.replayed },
    };
  }

  @Get('current')
  async getCurrent(
    @CurrentActor() actor: RequestActor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const company = await this.companies.getCurrent(actor);
    const profile = company.current_profile as { version: number };
    response.setHeader('ETag', formatEtag(profile.version));
    return {
      data: company,
      meta: { correlation_id: (response.req as ContextRequest).correlationId },
    };
  }

  @Patch('current/profile')
  async updateProfile(
    @CurrentActor() actor: RequestActor,
    @Headers('idempotency-key') key: string | undefined,
    @Headers('if-match') etag: string | undefined,
    @Body() dto: CompanyProfileDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const request = response.req as ContextRequest;
    const result = await this.companies.updateProfile(
      actor,
      requireIdempotencyKey(key),
      requireEtag(etag),
      request.correlationId,
      dto,
    );
    response.setHeader('Idempotency-Key', key as string);
    const profile = result.body.current_profile as { version: number };
    response.setHeader('ETag', formatEtag(profile.version));
    return {
      data: result.body,
      meta: { correlation_id: request.correlationId, replayed: result.replayed },
    };
  }
}
