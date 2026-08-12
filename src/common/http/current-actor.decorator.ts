import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ContextRequest, RequestActor } from './request-context';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestActor => {
    const request = context.switchToHttp().getRequest<ContextRequest>();
    if (!request.actor) {
      throw new Error('Authenticated actor was not attached to the request');
    }
    return request.actor;
  },
);
