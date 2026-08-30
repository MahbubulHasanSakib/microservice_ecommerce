import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { NotificationsKafkaConsumer } from './notifications-kafka.consumer';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, NotificationsKafkaConsumer],
  exports: [NotificationsService, EmailService, NotificationsKafkaConsumer],
})
export class NotificationsModule {}

