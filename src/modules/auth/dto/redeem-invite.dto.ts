import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RedeemInviteDto {
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  invite_token!: string;
}
