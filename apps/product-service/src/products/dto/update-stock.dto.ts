import { IsInt, IsNotEmpty, IsUUID } from 'class-validator';

export class UpdateStockDto {
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @IsInt()
  quantityDelta: number; // e.g. -2 to deduct 2 items, +5 to restock 5 items
}
