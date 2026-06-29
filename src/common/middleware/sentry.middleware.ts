import * as Sentry from "@sentry/node";
import { Request, Response, NextFunction } from "express";

export const sentryBreadcrumbMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!Sentry.getCurrentHub().getClient()) {
    return next();
  }

  Sentry.addBreadcrumb({
    category: "request",
    message: `${req.method} ${req.originalUrl}`,
    data: {
      method: req.method,
      path: req.originalUrl,
      params: req.params,
      query: req.query,
    },
    level: "info",
    type: "default",
  });

  next();
};



