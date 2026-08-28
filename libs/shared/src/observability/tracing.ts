import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { propagation } from '@opentelemetry/api';

let sdkInstance: NodeSDK | null = null;

/**
 * Initializes OpenTelemetry Distributed Tracing with OTLP HTTP exporter and W3C TraceContext propagation.
 * Should be called at the very first line of main.ts before any NestJS modules are imported.
 */
export function initTracing(serviceName: string): NodeSDK | null {
  if (sdkInstance) {
    return sdkInstance;
  }

  // Set W3C TraceContext as the global propagator
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  const otlpEndpoint =
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318/v1/traces';

  try {
    const traceExporter = new OTLPTraceExporter({
      url: otlpEndpoint,
      timeoutMillis: 2000,
    });

    sdkInstance = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: '1.0.0',
      }),
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable noisy instrumentations
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
        }),
      ],
    });

    sdkInstance.start();

    process.on('SIGTERM', async () => {
      try {
        await sdkInstance?.shutdown();
      } catch (err) {
        // Ignore shutdown error on exit
      }
    });

    return sdkInstance;
  } catch (error) {
    // Fail gracefully if OTel fails to start so local app still runs
    console.warn(`[OpenTelemetry] Warning: Failed to initialize tracing for ${serviceName}: ${(error as Error).message}`);
    return null;
  }
}
