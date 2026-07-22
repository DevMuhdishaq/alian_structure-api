import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-codes";

export interface ErrorResponse {
  statusCode: number;
  errorCode: ErrorCode;
  message: string | object;
  correlationId: string;
  timestamp: string;
  path: string;
  errors?: Record<string, string[]>;
}

export class AppException extends HttpException {
  public readonly errorCode: ErrorCode;

  constructor(
    message: string,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,
  ) {
    super(message, status);
    this.errorCode = errorCode;
  }
}

export class NotFoundException extends AppException {
  constructor(message = "Resource not found") {
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = "Unauthorized") {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
  }
}

export class ForbiddenException extends AppException {
  constructor(message = "Forbidden") {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
  }
}

export class BadRequestException extends AppException {
  constructor(message = "Bad request") {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
  }
}

export class ConflictException extends AppException {
  constructor(message = "Resource conflict") {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT);
  }
}

export class RateLimitException extends AppException {
  constructor(message = "Too many requests") {
    super(message, HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED);
  }
}
