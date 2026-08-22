import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { OrderCreatedEvent, OrderStatus } from '@ecommerce/shared';
import { NotificationsService } from '../src/notifications/notifications.service';
import { EmailService } from '../src/notifications/email.service';
import { NotificationsController } from '../src/notifications/notifications.controller';

describe('Notification Service', () => {
  let controller: NotificationsController;
  let notificationsService: NotificationsService;
  let emailService: EmailService;

  const mockOrderCreatedEvent: OrderCreatedEvent = {
    orderId: 'ord-123',
    orderNumber: 'ORD-TEST-001',
    userId: 'user-456',
    userEmail: 'customer@example.com',
    totalAmount: 199.98,
    status: OrderStatus.PENDING,
    items: [
      {
        productId: 'prod-1',
        productName: 'Mechanical Keyboard',
        unitPrice: 99.99,
        quantity: 2,
        subtotal: 199.98,
      },
    ],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationsService,
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'mail.from') return 'E-Commerce Store <no-reply@ecommerce.com>';
              return null;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    emailService = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(notificationsService).toBeDefined();
    expect(emailService).toBeDefined();
  });

  describe('EmailService', () => {
    it('should format order confirmation email with customer details and line items', () => {
      const email = emailService.formatOrderConfirmationEmail(mockOrderCreatedEvent);

      expect(email.to).toEqual('customer@example.com');
      expect(email.subject).toContain('ORD-TEST-001');
      expect(email.text).toContain('Mechanical Keyboard');
      expect(email.text).toContain('199.98');
      expect(email.html).toContain('Mechanical Keyboard');
      expect(email.html).toContain('ORD-TEST-001');
    });

    it('should fall back to generated email if userEmail is missing', () => {
      const eventWithoutEmail = { ...mockOrderCreatedEvent, userEmail: undefined };
      const email = emailService.formatOrderConfirmationEmail(eventWithoutEmail);

      expect(email.to).toEqual('user_user-456@example.com');
    });

    it('should simulate email dispatch and return success result', async () => {
      const result = await emailService.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test content',
        html: '<p>Test content</p>',
      });

      expect(result.delivered).toBe(true);
      expect(result.recipient).toEqual('test@example.com');
      expect(result.messageId).toBeDefined();
    });
  });

  describe('NotificationsService', () => {
    it('should process OrderCreatedEvent and dispatch confirmation notification', async () => {
      const result = await notificationsService.processOrderCreated(mockOrderCreatedEvent);

      expect(result.delivered).toBe(true);
      expect(result.recipient).toEqual('customer@example.com');
      expect(result.subject).toContain('ORD-TEST-001');
    });
  });

  describe('NotificationsController', () => {
    it('should handle order.created event and manually ACK message', async () => {
      const mockChannel = {
        ack: jest.fn(),
        nack: jest.fn(),
      };
      const mockMessage = { content: Buffer.from(JSON.stringify(mockOrderCreatedEvent)) };

      const mockContext = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMessage,
      } as unknown as RmqContext;

      await controller.handleOrderCreated(mockOrderCreatedEvent, mockContext);

      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should NACK message without requeue when processing throws an error', async () => {
      jest.spyOn(notificationsService, 'processOrderCreated').mockRejectedValueOnce(new Error('Simulated processing failure'));

      const mockChannel = {
        ack: jest.fn(),
        nack: jest.fn(),
      };
      const mockMessage = { content: Buffer.from('invalid') };

      const mockContext = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMessage,
      } as unknown as RmqContext;

      await controller.handleOrderCreated(mockOrderCreatedEvent, mockContext);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });
  });
});
