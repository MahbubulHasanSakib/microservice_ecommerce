import { IsUUID } from 'class-validator';

export class FindUserParamDto {
  @IsUUID(4, { message: 'id parameter must be a valid UUID v4' })
  id: string;
}
