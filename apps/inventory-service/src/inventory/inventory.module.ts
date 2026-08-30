import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventoryKafkaConsumer } from './inventory-kafka.consumer';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryKafkaConsumer],
  exports: [InventoryService, InventoryKafkaConsumer],
})
export class InventoryModule {}

