import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class RestockItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}
