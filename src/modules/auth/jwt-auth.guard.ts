import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from '../../common/http/public.decorator';
import type { ContextRequest } from '../../common/http/request-context';
import { DomainError } from '../../common/domain/domain-error';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ContextRequest>();
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new DomainError({
        status: 401,
        code: 'authentication_required',
        title: 'Authentication is required',
        detail: 'Provide an Authorization header with a bearer token.',
        remediation: ['authenticate'],
      });
    }
    request.actor = await this.authService.verifyAccessToken(token);
    return true;
  }
}
