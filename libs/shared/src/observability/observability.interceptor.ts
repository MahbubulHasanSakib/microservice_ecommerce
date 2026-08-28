import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const type = context.getType();
    const start = process.hrtime();

    if (type === 'http') {
      const http = context.switchToHttp();
      const req = http.getRequest<{ method: string; route?: { path?: string }; path?: string }>();
      const res = http.getResponse<{ statusCode: number }>();

      const method = req.method || 'GET';
      const route = req.route?.path || req.path || 'unknown';

      return next.handle().pipe(
        tap({
          next: () => {
            if (this.metricsService) {
              const diff = process.hrtime(start);
              const durationSec = diff[0] + diff[1] / 1e9;
              const statusCode = (res.statusCode || 200).toString();

              this.metricsService.httpRequestsTotal.inc({
                method,
                route,
                status_code: statusCode,
              });
              this.metricsService.httpRequestDuration.observe(
                { method, route, status_code: statusCode },
                durationSec,
              );
            }
          },
          error: (err) => {
            if (this.metricsService) {
              const diff = process.hrtime(start);
              const durationSec = diff[0] + diff[1] / 1e9;
              const statusCode = (err.status || err.statusCode || 500).toString();

              this.metricsService.httpRequestsTotal.inc({
                method,
                route,
                status_code: statusCode,
              });
              this.metricsService.httpRequestDuration.observe(
                { method, route, status_code: statusCode },
                durationSec,
              );
            }
          },
        }),
      );
    }

    if (type === 'rpc') {
      const rpc = context.switchToRpc();
      const pattern = rpc.getContext<string>() || 'rpc_command';

      return next.handle().pipe(
        tap({
          next: () => {
            if (this.metricsService) {
              const diff = process.hrtime(start);
              const durationSec = diff[0] + diff[1] / 1e9;

              this.metricsService.rpcRequestsTotal.inc({
                service: 'microservice',
                pattern: typeof pattern === 'string' ? pattern : 'rpc',
                status: 'success',
              });
              this.metricsService.rpcRequestDuration.observe(
                {
                  service: 'microservice',
                  pattern: typeof pattern === 'string' ? pattern : 'rpc',
                },
                durationSec,
              );
            }
          },
          error: () => {
            if (this.metricsService) {
              const diff = process.hrtime(start);
              const durationSec = diff[0] + diff[1] / 1e9;

              this.metricsService.rpcRequestsTotal.inc({
                service: 'microservice',
                pattern: typeof pattern === 'string' ? pattern : 'rpc',
                status: 'error',
              });
              this.metricsService.rpcRequestDuration.observe(
                {
                  service: 'microservice',
                  pattern: typeof pattern === 'string' ? pattern : 'rpc',
                },
                durationSec,
              );
            }
          },
        }),
      );
    }

    return next.handle();
  }
}
