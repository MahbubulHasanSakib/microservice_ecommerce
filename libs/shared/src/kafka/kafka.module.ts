import { DynamicModule, Global, Module } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaConfigOptions } from './kafka.types';

@Global()
@Module({
  providers: [KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService, KafkaConsumerService],
})
export class KafkaModule {
  /**
   * Configures KafkaModule globally with custom broker and client options.
   */
  static forRoot(options?: KafkaConfigOptions): DynamicModule {
    const producerProvider = {
      provide: KafkaProducerService,
      useFactory: () => {
        const brokers =
          options?.brokers || (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
        const clientId = options?.clientId || 'ecommerce-kafka-client';
        return new KafkaProducerService(brokers, clientId);
      },
    };

    return {
      module: KafkaModule,
      providers: [producerProvider, KafkaConsumerService],
      exports: [producerProvider, KafkaConsumerService],
    };
  }
}
