export const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

/**
 * Body fields whose values are replaced with [REDACTED] before logging.
 * Field matching is case-insensitive.
 *
 * Add to this set for any application-specific sensitive fields.
 */
export const SENSITIVE_BODY_FIELDS = new Set([
  "password",
  "passwordconfirm",
  "oldpassword",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "apikey",
  "ssn",
  "socialsecuritynumber",
  "creditcard",
  "cardnumber",
  "cvv",
  "pin",
  "privatekey",
  "mnemonic",
  "seed",
  "privatekey",
  "walletpassphrase",
]);

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";

export interface RouteLogConfig {
  /** A string prefix or regex tested against the request path */
  pattern: RegExp | string;
  level: LogLevel;
}

export interface LoggingMiddlewareConfig {
  /** Headers whose values are masked in log output */
  sensitiveHeaders?: Set<string>;
  /** Body field names (lowercase) whose values are masked in log output */
  sensitiveBodyFields?: Set<string>;
  /** Per-route log-level overrides evaluated in order; first match wins */
  routeLogLevels?: RouteLogConfig[];
  /** Bodies larger than this (bytes from Content-Length) are not logged; default 10 KB */
  maxBodySize?: number;
  /** Set to false to disable all logging from this middleware */
  enabled?: boolean;
}

export const DEFAULT_LOGGING_CONFIG: Required<LoggingMiddlewareConfig> = {
  sensitiveHeaders: SENSITIVE_HEADERS,
  sensitiveBodyFields: SENSITIVE_BODY_FIELDS,
  routeLogLevels: [
    { pattern: /^\/health/, level: "debug" },
    { pattern: /^\/metrics/, level: "silent" },
  ],
  maxBodySize: 10 * 1024,
  enabled: true,
};

export const REQUEST_ID_HEADER = "x-request-id";



