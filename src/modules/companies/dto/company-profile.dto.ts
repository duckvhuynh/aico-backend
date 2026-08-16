import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class NormalizedLimitsDto {
  @IsInt()
  @Min(1)
  @Max(5)
  max_screens!: number;

  @IsInt()
  @Min(1)
  @Max(1)
  primary_flows!: number;

  @IsIn(['mock_or_local'])
  data_mode!: 'mock_or_local';
}

export class CompanyProfileDto {
  @Transform(trimString)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  purpose!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  target_customer!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  constraints!: string[];

  @ValidateNested()
  @Type(() => NormalizedLimitsDto)
  normalized_limits!: NormalizedLimitsDto;

  @IsBoolean()
  sensitive_data_warning_acknowledged!: boolean;
}
