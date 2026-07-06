import * as Sentry from "@sentry/node";
import { SeverityLevel } from "@sentry/core";
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Global exception filter that sanitizes error responses in production.
 * - Never exposes stack traces or internal details to clients.
 * - Logs full error details server-side with a correlation ID.
 * - Returns structured, generic error responses to clients.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction =
      this.configService.get<string>("NODE_ENV") === "production";
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let clientMessage: string | object = "An unexpected error occurred";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // In production, only expose safe HTTP exception messages
      if (this.isProduction) {
        clientMessage =
          typeof exceptionResponse === "string"
            ? exceptionResponse
            : ((exceptionResponse as any).message ?? "Request failed");
      } else {
        clientMessage =
          typeof exceptionResponse === "string"
            ? exceptionResponse
            : exceptionResponse;
      }
    }

    // Report production-grade errors to Sentry for grouping, breadcrumbs, and alerting.
    if (Sentry.getCurrentHub().getClient()) {
      Sentry.withScope((scope) => {
        scope.setTag("http.method", request.method);
        scope.setTag("http.status_code", String(status));
        scope.setTag("correlation_id", correlationId);
        scope.setExtra("path", request.url);
        scope.setExtra("query", request.query);
        scope.setExtra("params", request.params);
        scope.setUser({ ip_address: request.ip });

        const level: SeverityLevel = status >= 500 ? "error" : "warning";
        scope.setLevel(level);

        const errorToCapture =
          exception instanceof Error ? exception : new Error(String(exception));
        if (status >= 500 || status === 401 || status === 403) {
          Sentry.captureException(errorToCapture);
        }
      });
    }

    // Log full details server-side only
    this.logger.error({
      correlationId,
      method: request.method,
      url: request.url,
      status,
      error:
        exception instanceof Error
          ? {
              name: exception.name,
              message: exception.message,
              stack: this.isProduction ? undefined : exception.stack,
            }
          : String(exception),
    });

    response.status(status).json({
      statusCode: status,
      correlationId,
      message: clientMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}



