import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional, Inject } from '@nestjs/common';
import { Kafka, Producer, RecordMetadata, ProducerConfig } from 'kafkajs';
import { randomUUID } from 'crypto';
import {
  KafkaEventEnvelope,
  KafkaPublishOptions,
  KafkaTopic,
} from './kafka.types';
import { getActiveTraceIdentifiers } from '../observability/trace-context';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka;
  private producer: Producer;
  private isConnected = false;

  constructor(
    @Optional() @Inject('KAFKA_BROKERS') brokers?: string[],
    @Optional() @Inject('KAFKA_CLIENT_ID') clientId?: string,
    @Optional() @Inject('KAFKA_PRODUCER_CONFIG') producerConfig?: ProducerConfig,
  ) {
    const resolvedBrokers =
      brokers || (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const resolvedClientId = clientId || 'ecommerce-producer';

    this.kafka = new Kafka({
      clientId: resolvedClientId,
      brokers: resolvedBrokers,
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });

    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      ...producerConfig,
    });
  }


  async onModuleInit() {
    try {
      await this.connect();
    } catch (error) {
      this.logger.warn(`Kafka producer initial connection postponed: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log('Kafka Producer connected successfully');
    } catch (error) {
      this.logger.error(`Failed to connect Kafka Producer: ${(error as Error).message}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.producer.disconnect();
      this.isConnected = false;
      this.logger.log('Kafka Producer disconnected');
    } catch (error) {
      this.logger.error(`Error disconnecting Kafka Producer: ${(error as Error).message}`);
    }
  }

  /**
   * Publishes a strongly-typed domain event to an Apache Kafka topic.
   * Encapsulates the payload into a CloudEvents-compliant KafkaEventEnvelope,
   * stamps it with a deterministic partition key, and propagates trace context.
   */
  async emitEvent<T>(
    topic: KafkaTopic | string,
    eventType: string,
    key: string,
    data: T,
    source = 'ecommerce-system',
    options?: KafkaPublishOptions,
  ): Promise<RecordMetadata[]> {
    if (!this.isConnected) {
      await this.connect();
    }

    const { traceId, spanId } = getActiveTraceIdentifiers();
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    const envelope: KafkaEventEnvelope<T> = {
      id: eventId,
      eventType,
      source,
      specVersion: '1.0',
      key,
      data,
      timestamp,
      ...(traceId ? { traceId } : {}),
      ...(spanId ? { spanId } : {}),
    };

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'ce-id': eventId,
      'ce-type': eventType,
      'ce-source': source,
      'ce-specversion': '1.0',
      'ce-time': timestamp,
      ...(traceId ? { 'x-trace-id': traceId, traceparent: `00-${traceId}-${spanId || '0000000000000000'}-01` } : {}),
      ...(options?.headers || {}),
    };

    try {
      const records = await this.producer.send({
        topic,
        messages: [
          {
            key: options?.key ?? key,
            value: JSON.stringify(envelope),
            partition: options?.partition,
            headers,
          },
        ],
      });

      this.logger.debug(
        `Published event ${eventType} [id=${eventId}] to topic ${topic} (partition=${records[0]?.partition}, offset=${records[0]?.offset}) with key=${key}`,
      );

      return records;
    } catch (error) {
      this.logger.error(
        `Failed to emit event ${eventType} to topic ${topic}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Publishes multiple event envelopes in a single batch to maximize Kafka streaming throughput.
   */
  async emitBatch<T>(
    topic: KafkaTopic | string,
    events: Array<{
      eventType: string;
      key: string;
      data: T;
      source?: string;
      options?: KafkaPublishOptions;
    }>,
  ): Promise<RecordMetadata[]> {
    if (!this.isConnected) {
      await this.connect();
    }

    const { traceId, spanId } = getActiveTraceIdentifiers();
    const timestamp = new Date().toISOString();

    const messages = events.map((event) => {
      const eventId = randomUUID();
      const envelope: KafkaEventEnvelope<T> = {
        id: eventId,
        eventType: event.eventType,
        source: event.source ?? 'ecommerce-system',
        specVersion: '1.0',
        key: event.key,
        data: event.data,
        timestamp,
        ...(traceId ? { traceId } : {}),
        ...(spanId ? { spanId } : {}),
      };

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'ce-id': eventId,
        'ce-type': event.eventType,
        'ce-source': event.source ?? 'ecommerce-system',
        'ce-specversion': '1.0',
        'ce-time': timestamp,
        ...(traceId ? { 'x-trace-id': traceId, traceparent: `00-${traceId}-${spanId || '0000000000000000'}-01` } : {}),
        ...(event.options?.headers || {}),
      };

      return {
        key: event.options?.key ?? event.key,
        value: JSON.stringify(envelope),
        partition: event.options?.partition,
        headers,
      };
    });

    try {
      const records = await this.producer.send({
        topic,
        messages,
      });

      this.logger.debug(`Published batch of ${messages.length} events to topic ${topic}`);
      return records;
    } catch (error) {
      this.logger.error(`Failed to emit batch to topic ${topic}: ${(error as Error).message}`);
      throw error;
    }
  }
}
