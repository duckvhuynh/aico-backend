import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/http/public.decorator';
import { AuthService } from './auth.service';
import { CreateDevTokenDto } from './dto/create-dev-token.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('dev-token')
  createDevelopmentToken(
    @Body() dto: CreateDevTokenDto,
  ): ReturnType<AuthService['createDevelopmentToken']> {
    return this.authService.createDevelopmentToken(dto);
  }
}
