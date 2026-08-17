import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * The header name for correlation IDs.
 * Exported so other files (logger, exception filter) use the same constant.
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * CorrelationIdMiddleware
 *
 * Runs on every incoming request. Ensures every request has a correlation ID.
 *
 * WHY CORRELATION IDs:
 * When a bug is reported, you need to find ALL log lines for that specific
 * request across every service. Without a shared ID, you're searching through
 * thousands of log lines with no way to connect them.
 *
 * With a correlation ID, you grep for one UUID and instantly see the full
 * request journey across every service.
 *
 * BEHAVIOR:
 * - If the client already sends X-Correlation-Id (e.g., from a previous hop),
 *   we keep it — the ID should flow through the entire distributed system.
 * - If not, we generate a new UUID v4.
 * - We always echo the ID back in the response header so the client can log it.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existingId = req.headers[CORRELATION_ID_HEADER] as string | undefined;
    const correlationId = existingId ?? uuidv4();

    // Store in request headers so downstream middleware and handlers can read it
    req.headers[CORRELATION_ID_HEADER] = correlationId;

    // Echo back to the client — so the client can log which correlation ID to reference
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    next();
  }
}
