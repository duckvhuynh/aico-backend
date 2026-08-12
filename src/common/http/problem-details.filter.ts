import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../domain/domain-error';
import { newId } from '../domain/identifiers';
import type { ContextRequest } from './request-context';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  trace_id: string;
  errors: Array<Record<string, unknown>>;
  remediation: string[];
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<ContextRequest>();
    const response = context.getResponse<Response>();
    const traceId = request.correlationId ?? newId();

    let problem: ProblemDetails;
    if (exception instanceof DomainError) {
      problem = this.toProblem(
        exception.status,
        exception.code,
        exception.title,
        exception.message,
        request.originalUrl,
        traceId,
        exception.errors,
        exception.remediation,
      );
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const messages =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? (payload as { message: unknown }).message
          : exception.message;
      const errors = Array.isArray(messages)
        ? messages.map((message) => ({ message: String(message) }))
        : [];
      problem = this.toProblem(
        status,
        status === 400 ? 'validation_failed' : 'http_error',
        status === 400 ? 'Request validation failed' : 'The request could not be completed',
        status === 400 ? 'One or more request fields are invalid.' : exception.message,
        request.originalUrl,
        traceId,
        errors,
        [],
      );
    } else {
      this.logger.error('Unhandled request failure', {
        error:
          exception instanceof Error
            ? { name: exception.name, message: exception.message, stack: exception.stack }
            : String(exception),
        traceId,
        method: request.method,
        path: request.originalUrl,
      });
      problem = this.toProblem(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'internal_error',
        'The service could not complete the request',
        'An unexpected error occurred. Retry later or contact support with the trace ID.',
        request.originalUrl,
        traceId,
        [],
        ['retry_later', 'contact_support'],
      );
    }

    response.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(
    status: number,
    code: string,
    title: string,
    detail: string,
    instance: string,
    traceId: string,
    errors: Array<Record<string, unknown>>,
    remediation: string[],
  ): ProblemDetails {
    return {
      type: `https://api.aicompanyos.dev/problems/${code.replaceAll('_', '-')}`,
      title,
      status,
      detail,
      instance,
      code,
      trace_id: traceId,
      errors,
      remediation,
    };
  }
}
