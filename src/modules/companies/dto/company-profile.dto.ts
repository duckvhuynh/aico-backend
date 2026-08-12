import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class NormalizedLimitsDto {
  @IsInt()
  @Min(1)
  max_screens!: number;

  @IsInt()
  @Min(1)
  primary_flows!: number;

  @IsIn(['mock_or_local'])
  data_mode!: 'mock_or_local';
}

export class CompanyProfileDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  purpose!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  target_customer!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  constraints!: string[];

  @ValidateNested()
  @Type(() => NormalizedLimitsDto)
  normalized_limits!: NormalizedLimitsDto;

  @IsBoolean()
  sensitive_data_warning_acknowledged!: boolean;
}
