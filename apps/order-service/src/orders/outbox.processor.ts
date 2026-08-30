import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { KAFKA_TOPICS, KafkaProducerService } from '@ecommerce/shared';
import { PrismaService } from '../prisma/prisma.service';

const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 20;
const MAX_RETRIES = 5;

@Injectable()
export class OutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly kafkaProducer?: KafkaProducerService,
  ) {}

  onModuleInit(): void {
    this.startPolling();
    this.logger.log('Transactional Outbox Kafka Relay initialized.');
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  startPolling(): void {
    this.timer = setInterval(() => {
      this.processOutbox().catch((err) => {
        this.logger.error(`Error in outbox polling loop: ${(err as Error).message}`, (err as Error).stack);
      });
    }, POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Reads unpublished outbox events and dispatches them to Apache Kafka.
   */
  async processOutbox(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;

    try {
      const pendingEvents = await this.prisma.outboxEvent.findMany({
        where: {
          status: 'PENDING',
          retryCount: { lt: MAX_RETRIES },
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      if (pendingEvents.length === 0) {
        return 0;
      }

      this.logger.debug(`Found ${pendingEvents.length} pending outbox events to stream to Kafka.`);

      for (const event of pendingEvents) {
        try {
          const payload = event.payload as Record<string, unknown>;

          // Stream to Kafka topic partitioned by aggregateId
          if (this.kafkaProducer) {
            await this.kafkaProducer.emitEvent(
              KAFKA_TOPICS.ORDER_EVENTS,
              event.eventType,
              event.aggregateId,
              payload,
              'order-service',
            );
          }

          // Mark outbox event as successfully published
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              errorMessage: null,
            },
          });

          this.logger.log(
            `[OUTBOX KAFKA RELAY] Successfully streamed '${event.eventType}' for aggregate ${event.aggregateId}`,
          );
        } catch (dispatchError) {
          const newRetryCount = event.retryCount + 1;
          const isFailed = newRetryCount >= MAX_RETRIES;

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              retryCount: newRetryCount,
              status: isFailed ? 'FAILED' : 'PENDING',
              errorMessage: (dispatchError as Error).message,
            },
          });

          this.logger.warn(
            `[OUTBOX KAFKA RELAY] Failed to stream event ${event.id} (Attempt ${newRetryCount}/${MAX_RETRIES}): ${(dispatchError as Error).message}`,
          );
        }
      }

      return pendingEvents.length;
    } finally {
      this.isProcessing = false;
    }
  }
}

