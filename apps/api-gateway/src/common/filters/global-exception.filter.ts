import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TimeoutError } from 'rxjs';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

/**
 * GlobalExceptionFilter
 *
 * Catches ALL unhandled exceptions (HTTP errors, RPC errors over TCP, timeouts)
 * and normalizes them into a consistent JSON response shape with accurate HTTP status codes.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = request.headers[CORRELATION_ID_HEADER] as string | undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';

    // 1. Standard NestJS HttpExceptions (400, 401, 403, 404, 409, etc.)
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'object' && res !== null && 'message' in res
          ? Array.isArray((res as any).message)
            ? (res as any).message.join(', ')
            : (res as any).message
          : exception.message;
    }
    // 2. RxJS Timeout (Downstream microservice did not reply within SLA)
    else if (exception instanceof TimeoutError || exception?.name === 'TimeoutError') {
      status = HttpStatus.GATEWAY_TIMEOUT;
      message = 'Downstream microservice timed out';
    }
    // 3. Serialized RPC Exceptions from downstream TCP microservices
    else if (exception && typeof exception === 'object') {
      // Check for nested error object (e.g. exception.error) or direct properties
      const errorPayload = exception.error ?? exception;
      
      const code =
        errorPayload.statusCode ??
        errorPayload.status ??
        exception.statusCode ??
        exception.status;

      if (typeof code === 'number' && code >= 400 && code < 600) {
        status = code;
      } else if (exception.code === 'ECONNREFUSED' || errorPayload.code === 'ECONNREFUSED') {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message = 'Downstream microservice is currently unreachable';
      }

      const msg =
        errorPayload.message ??
        exception.message ??
        (typeof errorPayload === 'string' ? errorPayload : null);

      if (msg && typeof msg === 'string') {
        message = msg;
      }
    } else if (typeof exception === 'string') {
      message = exception;
    }

    // Log the error with correlation ID for distributed tracing
    this.logger.error({
      message: 'Request failed',
      correlationId,
      method: request.method,
      path: request.url,
      statusCode: status,
      error: message,
    });

    response.status(status).json({
      statusCode: status,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
