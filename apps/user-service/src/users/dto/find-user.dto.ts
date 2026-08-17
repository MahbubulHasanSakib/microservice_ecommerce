import { IsUUID } from 'class-validator';

export class FindUserDto {
  @IsUUID(4, { message: 'id must be a valid UUID v4' })
  id: string;
}
