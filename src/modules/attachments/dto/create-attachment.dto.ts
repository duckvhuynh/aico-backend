import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAttachmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  declared_media_type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  filename!: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  content_sha256!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(14_000_000)
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/)
  content_base64!: string;
}
