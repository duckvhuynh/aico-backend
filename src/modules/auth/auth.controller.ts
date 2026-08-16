import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentActor } from '../../common/http/current-actor.decorator';
import { Public } from '../../common/http/public.decorator';
import type { RequestActor } from '../../common/http/request-context';
import { AuthService } from './auth.service';
import { IssueInviteDto } from './dto/issue-invite.dto';
import { RedeemInviteDto } from './dto/redeem-invite.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(): never {
    return this.authService.unavailableRegistration();
  }

  @Public()
  @Post('dev-token')
  createDevelopmentToken(): never {
    return this.authService.unavailableRegistration();
  }

  @Public()
  @Post('invites')
  @HttpCode(201)
  async issueInvite(
    @Body() dto: IssueInviteDto,
  ): Promise<{ data: Awaited<ReturnType<AuthService['issueInvite']>> }> {
    return { data: await this.authService.issueInvite(dto) };
  }

  @Public()
  @Post('session')
  @HttpCode(201)
  async redeemInvite(
    @Body() dto: RedeemInviteDto,
  ): Promise<{ data: Awaited<ReturnType<AuthService['redeemInvite']>> }> {
    return { data: await this.authService.redeemInvite(dto) };
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(@CurrentActor() actor: RequestActor): Promise<void> {
    await this.authService.signOut(actor);
  }
}
