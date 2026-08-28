import {
  context,
  propagation,
  trace,
  Span,
  SpanStatusCode,
  ROOT_CONTEXT,
} from '@opentelemetry/api';

export interface TraceContextPayload {
  traceparent?: string;
  tracestate?: string;
  correlationId?: string;
  [key: string]: unknown;
}

/**
 * Injects current active OpenTelemetry trace context (W3C traceparent) into a target payload / carrier object.
 */
export function injectTraceContext<T>(carrier: T): T {
  if (!carrier || typeof carrier !== 'object') {
    return carrier;
  }

  const activeCtx = context.active();
  const headers: Record<string, string> = {};

  propagation.inject(activeCtx, headers);

  return {
    ...carrier,
    ...(headers['traceparent'] ? { traceparent: headers['traceparent'] } : {}),
    ...(headers['tracestate'] ? { tracestate: headers['tracestate'] } : {}),
  };
}

/**
 * Extracts OpenTelemetry trace context from an incoming carrier / payload object.
 */
export function extractTraceContext(carrier: unknown) {
  if (!carrier || typeof carrier !== 'object') {
    return ROOT_CONTEXT;
  }

  const obj = carrier as Record<string, unknown>;
  const headers: Record<string, string> = {};
  if (typeof obj['traceparent'] === 'string') {
    headers['traceparent'] = obj['traceparent'];
  }
  if (typeof obj['tracestate'] === 'string') {
    headers['tracestate'] = obj['tracestate'];
  }

  return propagation.extract(ROOT_CONTEXT, headers);
}

/**
 * Executes a callback function inside a child OpenTelemetry trace span linked to the parent context in the carrier.
 */
export async function runWithTraceContext<T>(
  carrier: unknown,
  spanName: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const parentContext = extractTraceContext(carrier);
  const tracer = trace.getTracer('ecommerce-microservices');

  return context.with(parentContext, async () => {
    const span = tracer.startSpan(spanName);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Returns the current active trace ID and span ID, useful for log correlation.
 */
export function getActiveTraceIdentifiers(): { traceId?: string; spanId?: string } {
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan) {
    return {};
  }
  const spanContext = activeSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}
