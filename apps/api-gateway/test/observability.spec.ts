import { MetricsService } from '@ecommerce/shared';
import { injectTraceContext, extractTraceContext, runWithTraceContext } from '@ecommerce/shared';

describe('Phase 9 Observability & Prometheus Metrics', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
    metricsService.onModuleInit();
  });

  describe('Prometheus Metrics Registry', () => {
    it('should record HTTP request counter and histogram', async () => {
      metricsService.httpRequestsTotal.inc({
        method: 'POST',
        route: '/api/v1/orders',
        status_code: '201',
      });

      metricsService.httpRequestDuration.observe(
        {
          method: 'POST',
          route: '/api/v1/orders',
          status_code: '201',
        },
        0.045,
      );

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('http_requests_total{method="POST",route="/api/v1/orders",status_code="201"} 1');
      expect(metrics).toContain('http_request_duration_seconds');
    });

    it('should record RabbitMQ domain event metrics', async () => {
      metricsService.rabbitmqEventsTotal.inc({
        event_name: 'order.created',
        action: 'consumed',
        status: 'success',
      });

      metricsService.rabbitmqEventDuration.observe(
        { event_name: 'order.created' },
        0.012,
      );

      const metrics = await metricsService.getMetrics();
      expect(metrics).toContain('rabbitmq_events_total{event_name="order.created",action="consumed",status="success"} 1');
      expect(metrics).toContain('rabbitmq_event_duration_seconds');
    });

    it('should record Circuit Breaker gauge state transitions', async () => {
      metricsService.circuitBreakerState.set({ breaker_name: 'OrderBreaker' }, 0); // CLOSED
      let metrics = await metricsService.getMetrics();
      expect(metrics).toContain('circuit_breaker_state{breaker_name="OrderBreaker"} 0');

      metricsService.circuitBreakerState.set({ breaker_name: 'OrderBreaker' }, 2); // OPEN
      metrics = await metricsService.getMetrics();
      expect(metrics).toContain('circuit_breaker_state{breaker_name="OrderBreaker"} 2');
    });
  });

  describe('OpenTelemetry Trace Context Propagation', () => {
    it('should inject and extract trace context correctly', () => {
      const payload = { orderId: '123-abc', totalAmount: 99.99 };
      const injected = injectTraceContext(payload);

      expect(injected.orderId).toBe('123-abc');
      expect(injected.totalAmount).toBe(99.99);

      const extracted = extractTraceContext(injected);
      expect(extracted).toBeDefined();
    });

    it('should run inside trace span and return function result', async () => {
      const carrier = { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' };

      const result = await runWithTraceContext(carrier, 'test-operation', async (span) => {
        expect(span).toBeDefined();
        return { success: true, count: 42 };
      });

      expect(result).toEqual({ success: true, count: 42 });
    });
  });
});
