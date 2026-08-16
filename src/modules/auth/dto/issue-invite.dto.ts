import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class IssueInviteDto {
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  display_name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  invite_ttl_seconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(900)
  session_ttl_seconds?: number;
}
