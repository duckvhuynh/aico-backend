import { Transform, Type } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { CompanyProfileDto } from './company-profile.dto';

export class CreateCompanyDto {
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ValidateNested()
  @Type(() => CompanyProfileDto)
  profile!: CompanyProfileDto;
}
