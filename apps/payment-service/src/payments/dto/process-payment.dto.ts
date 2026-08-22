import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class ProcessPaymentInputDto {
  @IsUUID('4')
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsOptional()
  orderNumber?: string;

  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  userEmail?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;
}
