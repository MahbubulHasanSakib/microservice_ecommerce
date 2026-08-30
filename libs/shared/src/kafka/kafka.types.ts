import { KAFKA_TOPICS, KAFKA_CONSUMER_GROUPS } from '../constants/service-patterns';

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
export type KafkaConsumerGroup = (typeof KAFKA_CONSUMER_GROUPS)[keyof typeof KAFKA_CONSUMER_GROUPS];

/**
 * Standard CloudEvents-compliant Envelope for all Kafka Event Streams.
 */
export interface KafkaEventEnvelope<T = unknown> {
  /** Unique identifier for the event instance (UUID v4) */
  id: string;
  /** Hierarchical event type identifier (e.g. 'ecommerce.order.created') */
  eventType: string;
  /** Originating service name */
  source: string;
  /** Specification version */
  specVersion: '1.0';
  /** Partition key used for deterministic topic partition routing */
  key: string;
  /** Payload data */
  data: T;
  /** ISO timestamp when the event was produced */
  timestamp: string;
  /** Distributed tracing Correlation ID */
  correlationId?: string;
  /** OpenTelemetry Trace ID */
  traceId?: string;
  /** OpenTelemetry Span ID */
  spanId?: string;
}

/**
 * Options for publishing records to Apache Kafka.
 */
export interface KafkaPublishOptions {
  /** Explicit partition key (overrides payload key if specified) */
  key?: string;
  /** Explicit target partition number (optional) */
  partition?: number;
  /** Custom record headers */
  headers?: Record<string, string>;
}

/**
 * Kafka Record Context with metadata extracted from consumer records.
 */
export interface KafkaMessageMetadata {
  topic: string;
  partition: number;
  offset: string;
  key?: string | null;
  timestamp: string;
  headers?: Record<string, unknown>;
}

/**
 * Interface for Kafka Configuration Options.
 */
export interface KafkaConfigOptions {
  brokers: string[];
  clientId?: string;
  groupId?: string;
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
}
