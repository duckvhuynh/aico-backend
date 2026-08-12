import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateInitiativeDto {
  @IsIn(['PROTOTYPE'])
  type!: 'PROTOTYPE';

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;
}
