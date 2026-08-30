import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsKafkaConsumer } from './payments-kafka.consumer';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsKafkaConsumer],
  exports: [PaymentsService, PaymentsKafkaConsumer],
})
export class PaymentsModule {}

