import * as Sentry from "@sentry/node";
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
import { AppException } from "../errors/app.exception";
import { ErrorCode } from "../errors/error-codes";

interface ValidationConstraints {
  [property: string]: string[];
}

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

    const correlationId =
      (request.headers["x-request-id"] as string) || uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let clientMessage: string | object = "An unexpected error occurred";
    let errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let errors: ValidationConstraints | undefined;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      errorCode = exception.errorCode;
      clientMessage = this.extractMessage(exception);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (
        status === HttpStatus.BAD_REQUEST &&
        typeof exceptionResponse === "object"
      ) {
        const response = exceptionResponse as any;
        if (Array.isArray(response.message)) {
          errors = this.formatValidationErrors(response.message);
          clientMessage = "Validation failed";
          errorCode = ErrorCode.VALIDATION_ERROR;
        } else {
          clientMessage = this.isProduction
            ? (response.message ?? "Request failed")
            : exceptionResponse;
          errorCode = this.mapStatusToCode(status);
        }
      } else {
        clientMessage = this.isProduction
          ? typeof exceptionResponse === "string"
            ? exceptionResponse
            : ((exceptionResponse as any).message ?? "Request failed")
          : exceptionResponse;
        errorCode = this.mapStatusToCode(status);
      }
    }

    this.reportToSentry(exception, status, correlationId, request);
    this.logError(exception, status, correlationId, request);

    response.status(status).json({
      statusCode: status,
      errorCode,
      message: clientMessage,
      ...(errors && { errors }),
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private extractMessage(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === "string") return response;
    return (response as any).message ?? "Request failed";
  }

  private formatValidationErrors(messages: string[]): ValidationConstraints {
    const errors: ValidationConstraints = {};
    for (const msg of messages) {
      const match = msg.match(/^(\w+)\s/);
      const field = match ? match[1] : "body";
      if (!errors[field]) errors[field] = [];
      errors[field].push(msg);
    }
    return errors;
  }

  private mapStatusToCode(status: number): ErrorCode {
    const map: Record<number, ErrorCode> = {
      400: ErrorCode.VALIDATION_ERROR,
      401: ErrorCode.UNAUTHORIZED,
      403: ErrorCode.FORBIDDEN,
      404: ErrorCode.NOT_FOUND,
      409: ErrorCode.CONFLICT,
      429: ErrorCode.RATE_LIMITED,
    };
    return map[status] ?? ErrorCode.INTERNAL_ERROR;
  }

  private reportToSentry(
    exception: unknown,
    status: number,
    correlationId: string,
    request: Request,
  ): void {
    if (!Sentry.getCurrentHub().getClient()) return;

    Sentry.withScope((scope) => {
      scope.setTag("http.method", request.method);
      scope.setTag("http.status_code", String(status));
      scope.setTag("correlation_id", correlationId);
      scope.setExtra("path", request.url);
      scope.setExtra("query", request.query);
      scope.setExtra("params", request.params);
      scope.setUser({ ip_address: request.ip });

      const level: "error" | "warning" = status >= 500 ? "error" : "warning";
      scope.setLevel(level);

      const errorToCapture =
        exception instanceof Error ? exception : new Error(String(exception));
      if (status >= 500 || status === 401 || status === 403) {
        Sentry.captureException(errorToCapture);
      }
    });
  }

  private logError(
    exception: unknown,
    status: number,
    correlationId: string,
    request: Request,
  ): void {
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
  }
}
