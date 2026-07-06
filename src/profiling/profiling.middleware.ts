import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { performance } from "perf_hooks";
import { createSpan } from "../config/tracing";

@Injectable()
export class ProfilingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestStartTime = performance.now();
    const requestId =
      req.headers["x-request-id"] || Math.random().toString(36).substr(2, 9);

    // Track middleware execution
    performance.mark(`${requestId}-middleware-start`);

    // Create OpenTelemetry span for the entire request
    createSpan(`http-${req.method}-${req.path}`, async (span) => {
      span.setAttribute("http.method", req.method);
      span.setAttribute("http.path", req.path);
      span.setAttribute("http.request_id", String(requestId));

      // Track database operations (monkey patch for automatic timeline)
      const originalJson = res.json;
      res.json = function (body) {
        performance.mark(`${requestId}-request-end`);
        performance.measure(
          `${req.method} ${req.path}`,
          `${requestId}-middleware-start`,
          `${requestId}-request-end`,
        );

        span.setAttribute("http.status_code", res.statusCode);
        return originalJson.call(this, body);
      };

      next();
    });
  }
}



