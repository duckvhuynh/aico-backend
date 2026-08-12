import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TaskQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsIn([
    'QUEUED',
    'READY',
    'RUNNING',
    'AWAITING_INPUT',
    'RETRY_WAIT',
    'SUCCEEDED',
    'BLOCKED',
    'FAILED',
    'CANCELED',
  ])
  state?: string;

  @IsOptional()
  @IsString()
  type?: string;
}
