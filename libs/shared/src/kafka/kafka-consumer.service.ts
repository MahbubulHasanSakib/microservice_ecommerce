import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload, ConsumerConfig } from 'kafkajs';
import { KafkaEventEnvelope, KafkaMessageMetadata, KafkaTopic } from './kafka.types';
import { runWithTraceContext } from '../observability/trace-context';

export type KafkaMessageHandler<T = unknown> = (
  event: KafkaEventEnvelope<T>,
  metadata: KafkaMessageMetadata,
) => Promise<void>;

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka: Kafka | null = null;
  private consumer: Consumer | null = null;
  private handlers = new Map<string, KafkaMessageHandler<any>>();
  private isRunning = false;


  constructor() {}

  /**
   * Initializes and starts a consumer group listening on specified topics.
   */
  async initConsumer(
    groupId: string,
    topics: (KafkaTopic | string)[],
    options?: {
      brokers?: string[];
      fromBeginning?: boolean;
      consumerConfig?: Partial<ConsumerConfig>;
    },
  ): Promise<void> {
    const brokers = options?.brokers || (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');

    this.kafka = new Kafka({
      clientId: `${groupId}-client`,
      brokers,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      ...options?.consumerConfig,
    });

    try {
      await this.consumer.connect();
      this.logger.log(`Kafka Consumer Group [${groupId}] connected`);

      for (const topic of topics) {
        await this.consumer.subscribe({
          topic,
          fromBeginning: options?.fromBeginning ?? false,
        });
        this.logger.log(`Subscribed Consumer Group [${groupId}] to topic [${topic}]`);
      }

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleIncomingMessage(payload);
        },
      });

      this.isRunning = true;
    } catch (error) {
      this.logger.error(
        `Failed to start Kafka Consumer Group [${groupId}]: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Registers an event handler for a specific topic or eventType pattern.
   */
  registerHandler<T>(
    topicOrEventType: string,
    handler: KafkaMessageHandler<T>,
  ): void {
    this.handlers.set(topicOrEventType, handler);
  }

  private async handleIncomingMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const offset = message.offset;
    const key = message.key?.toString() || null;
    const rawValue = message.value?.toString();

    if (!rawValue) {
      this.logger.warn(`Received empty message on topic ${topic}, partition ${partition}, offset ${offset}`);
      return;
    }

    let envelope: KafkaEventEnvelope<any>;
    try {
      envelope = JSON.parse(rawValue);
    } catch {
      envelope = {
        id: `raw-${offset}`,
        eventType: topic,
        source: 'unknown',
        specVersion: '1.0',
        key: key || '',
        data: rawValue,
        timestamp: new Date().toISOString(),
      };
    }

    const metadata: KafkaMessageMetadata = {
      topic,
      partition,
      offset,
      key,
      timestamp: new Date(Number(message.timestamp)).toISOString(),
      headers: message.headers as Record<string, unknown>,
    };

    const handler =
      this.handlers.get(envelope.eventType) ||
      this.handlers.get(topic) ||
      this.handlers.get('*');

    if (!handler) {
      this.logger.debug(`No handler registered for event ${envelope.eventType} on topic ${topic}`);
      return;
    }

    // Execute with OpenTelemetry Trace Context propagation from record headers / envelope
    const carrier = {
      traceparent: message.headers?.traceparent?.toString() || envelope.traceId,
      tracestate: message.headers?.tracestate?.toString(),
    };

    await runWithTraceContext(carrier, `kafka.consume ${topic} ${envelope.eventType}`, async () => {
      try {
        await handler(envelope, metadata);
        this.logger.debug(
          `Processed event ${envelope.eventType} (partition=${partition}, offset=${offset}, key=${key})`,
        );
      } catch (error) {
        this.logger.error(
          `Error processing Kafka message on topic ${topic}, offset ${offset}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer && this.isRunning) {
      try {
        await this.consumer.disconnect();
        this.logger.log('Kafka Consumer disconnected cleanly');
      } catch (error) {
        this.logger.error(`Error disconnecting Kafka Consumer: ${(error as Error).message}`);
      }
    }
  }
}
