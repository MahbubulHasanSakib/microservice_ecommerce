import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @IsString()
  userId: string;

  @IsString()
  jti: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;
}
