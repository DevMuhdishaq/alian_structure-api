import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "src/config/logger";
import {
  DEFAULT_LOGGING_CONFIG,
  LoggingMiddlewareConfig,
  LogLevel,
  REQUEST_ID_HEADER,
} from "./logging.config";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly cfg: Required<LoggingMiddlewareConfig>;
  private readonly log = logger.child({ context: "HTTP" });

  constructor(config?: Partial<LoggingMiddlewareConfig>) {
    this.cfg = { ...DEFAULT_LOGGING_CONFIG, ...config };
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.cfg.enabled) {
      return next();
    }

    const requestId =
      (req.headers[REQUEST_ID_HEADER] as string | undefined) || uuidv4();
    const startNs = process.hrtime.bigint();

    (req as any).requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const routeLevel = this.resolveRouteLogLevel(req.path);

    this.emit(
      routeLevel,
      {
        requestId,
        method: req.method,
        path: req.path,
        query: req.query,
        headers: this.sanitizeHeaders(req.headers as Record<string, unknown>),
        body: this.sanitizeBody(req.body),
        ip: this.extractClientIp(req),
      },
      "Incoming request",
    );

    res.on("finish", () => {
      const latencyMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;

      const contentLength = parseInt(
        (res.getHeader("content-length") as string | undefined) ?? "0",
        10,
      );

      const responseLevel: LogLevel =
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : routeLevel;

      this.emit(
        responseLevel,
        {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          latencyMs: parseFloat(latencyMs.toFixed(3)),
          responseSize: contentLength,
        },
        "Request completed",
      );
    });

    next();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers – exposed for unit testing
  // ---------------------------------------------------------------------------

  sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers)) {
      out[key] = this.cfg.sensitiveHeaders.has(key.toLowerCase())
        ? "[REDACTED]"
        : value;
    }
    return out;
  }

  sanitizeBody(body: unknown, depth = 0): unknown {
    if (body === null || body === undefined || typeof body !== "object") {
      return body;
    }

    if (depth > 5) return "[MAX_DEPTH]";

    if (Array.isArray(body)) {
      return (body as unknown[])
        .slice(0, 20)
        .map((item) => this.sanitizeBody(item, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      body as Record<string, unknown>,
    )) {
      out[key] = this.cfg.sensitiveBodyFields.has(key.toLowerCase())
        ? "[REDACTED]"
        : this.sanitizeBody(value, depth + 1);
    }
    return out;
  }

  extractClientIp(req: Request): string {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
      return xff.split(",")[0].trim();
    }
    return req.ip ?? "unknown";
  }

  private resolveRouteLogLevel(path: string): LogLevel {
    for (const { pattern, level } of this.cfg.routeLogLevels) {
      const matched =
        pattern instanceof RegExp
          ? pattern.test(path)
          : path.startsWith(pattern);
      if (matched) return level;
    }
    return "info";
  }

  private emit(level: LogLevel, obj: object, msg: string): void {
    if (level === "silent") return;
    (this.log as any)[level](obj, msg);
  }

  /**
   * Returns true when the request body is too large to log based on
   * Content-Length header.
   */
  isBodyTooLarge(req: Request): boolean {
    const contentLength = parseInt(
      (req.headers["content-length"] as string | undefined) ?? "0",
      10,
    );
    return contentLength > this.cfg.maxBodySize;
  }
}



