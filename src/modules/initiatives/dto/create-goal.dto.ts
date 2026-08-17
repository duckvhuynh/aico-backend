import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MustHaveDto {
  @IsString()
  @Matches(/^MH-[0-9]{3}$/)
  id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  text!: string;
}

export class GoalConstraintsDto {
  @IsInt()
  @Min(1)
  @Max(5)
  max_screens!: number;

  @IsInt()
  @Min(1)
  @Max(1)
  primary_flows!: number;

  @IsBoolean()
  client_only!: boolean;

  @IsIn(['mock_or_local'])
  data_mode!: 'mock_or_local';
}

export class StructuredGoalDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  target_user!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  problem!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  desired_outcome!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  primary_flow!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MustHaveDto)
  must_haves!: MustHaveDto[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  non_goals!: string[];

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  visual_direction!: string;

  @ValidateNested()
  @Type(() => GoalConstraintsDto)
  constraints!: GoalConstraintsDto;

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  reference_ids!: string[];
}

export class CreateGoalDto {
  @IsInt()
  @Min(1)
  @Max(1)
  schema_version!: 1;

  @IsDefined()
  @ValidateNested()
  @Type(() => StructuredGoalDto)
  goal!: StructuredGoalDto;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  attachment_ids!: string[];

  @IsBoolean()
  start_run!: boolean;
}

export function canonicalStructuredGoal(goal: StructuredGoalDto): Record<string, unknown> {
  return {
    target_user: goal.target_user,
    problem: goal.problem,
    desired_outcome: goal.desired_outcome,
    primary_flow: goal.primary_flow,
    must_haves: goal.must_haves.map((item) => ({ id: item.id, text: item.text })),
    non_goals: [...goal.non_goals],
    visual_direction: goal.visual_direction,
    constraints: {
      max_screens: goal.constraints.max_screens,
      primary_flows: goal.constraints.primary_flows,
      client_only: goal.constraints.client_only,
      data_mode: goal.constraints.data_mode,
    },
    reference_ids: [...goal.reference_ids],
  };
}
