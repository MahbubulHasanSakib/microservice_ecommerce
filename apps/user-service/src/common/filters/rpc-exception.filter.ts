import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { RpcException } from '@nestjs/microservices';

/**
 * RpcExceptionFilter
 *
 * Catches all exceptions inside TCP microservice handlers and wraps them
 * in an RpcException payload ({ statusCode, message }) so NestJS TCP transport
 * preserves the HTTP status code across the network to the API Gateway.
 */
@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _host: ArgumentsHost): Observable<never> {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal service error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'object' && res !== null && 'message' in res
          ? Array.isArray((res as Record<string, unknown>).message)
            ? ((res as Record<string, unknown>).message as string[]).join(', ')
            : String((res as Record<string, unknown>).message)
          : exception.message;
    } else if (exception instanceof RpcException) {
      return throwError(() => exception);
    } else if (typeof exception === 'object' && exception !== null && 'message' in exception) {
      message = String((exception as Record<string, unknown>).message);
    }

    // Must wrap in RpcException for NestJS TCP serializer to transmit payload
    return throwError(() => new RpcException({ statusCode, message }));
  }
}
