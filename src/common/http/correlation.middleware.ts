import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { DomainError } from '../domain/domain-error';
import { isUuid, newId } from '../domain/identifiers';
import type { ContextRequest } from './request-context';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: ContextRequest, response: Response, next: NextFunction): void {
    const supplied = request.header('x-correlation-id');
    if (supplied && !isUuid(supplied)) {
      throw new DomainError({
        status: 400,
        code: 'validation_failed',
        title: 'The correlation identifier is invalid',
        detail: 'X-Correlation-Id must be a UUID when provided.',
      });
    }
    request.correlationId = supplied ?? newId();
    response.setHeader('X-Correlation-Id', request.correlationId);
    next();
  }
}
