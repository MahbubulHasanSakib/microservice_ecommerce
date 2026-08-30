import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  PAYMENT_PATTERNS,
  PaymentResponse,
  ProcessPaymentDto,
} from '@ecommerce/shared';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}


  /**
   * RPC Message Pattern: Direct synchronous payment command.
   */
  @MessagePattern(PAYMENT_PATTERNS.PROCESS)
  async processPaymentCommand(@Payload() dto: ProcessPaymentDto): Promise<PaymentResponse> {
    return this.paymentsService.processPayment(dto);
  }

  /**
   * RPC Message Pattern: Retrieve payment details by order ID.
   */
  @MessagePattern(PAYMENT_PATTERNS.FIND_BY_ORDER_ID)
  async findByOrderId(@Payload() data: { orderId: string }): Promise<PaymentResponse> {
    return this.paymentsService.findByOrderId(data.orderId);
  }

  /**
   * RPC Message Pattern: Retrieve payment details by ID.
   */
  @MessagePattern(PAYMENT_PATTERNS.FIND_BY_ID)
  async findById(@Payload() data: { id: string }): Promise<PaymentResponse> {
    return this.paymentsService.findById(data.id);
  }

  /**
   * RPC Message Pattern: Refund a completed payment.
   */
  @MessagePattern(PAYMENT_PATTERNS.REFUND)
  async refundPayment(
    @Payload() data: { orderId: string; reason?: string },
  ): Promise<PaymentResponse> {
    return this.paymentsService.refundPayment(data.orderId, data.reason);
  }
}

