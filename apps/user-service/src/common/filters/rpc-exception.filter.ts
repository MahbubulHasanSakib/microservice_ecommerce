import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
  catch(exception: any, _host: ArgumentsHost): Observable<any> {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal service error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'object' && res !== null && 'message' in res
          ? Array.isArray((res as any).message)
            ? (res as any).message.join(', ')
            : (res as any).message
          : exception.message;
    } else if (exception instanceof RpcException) {
      return throwError(() => exception);
    } else if (exception?.message) {
      message = exception.message;
    }

    // Must wrap in RpcException for NestJS TCP serializer to transmit payload
    return throwError(() => new RpcException({ statusCode, message }));
  }
}
