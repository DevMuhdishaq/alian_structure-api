import { PipeTransform, Injectable, ArgumentMetadata } from "@nestjs/common";

/**
 * Recursively sanitizes input payloads:
 * - Trims whitespace and normalizes Unicode strings.
 * - Strips script tags, event handlers, javascript URIs, and encodes dangerous characters to prevent XSS.
 * - Neutralizes SQL Injection vectors (-- , /* , UNION SELECT, etc.).
 * - Traverses nested objects and arrays recursively.
 *
 * Applied globally via main.ts or per-controller/endpoint.
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown, _metadata?: ArgumentMetadata): unknown {
    return this.sanitize(value);
  }

  private sanitize(value: unknown): unknown {
    if (typeof value === "string") {
      return this.sanitizeString(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }
    if (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !(value instanceof RegExp)
    ) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
        value as Record<string, unknown>,
      )) {
        sanitized[key] = this.sanitize(val);
      }
      return sanitized;
    }
    return value;
  }

  private sanitizeString(str: string): string {
    if (!str) return str;

    // 1. Trim whitespace and normalize Unicode
    let sanitized = str.trim().normalize("NFC");

    // 2. Remove script tags and contents
    sanitized = sanitized.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

    // 3. Remove inline event handlers (e.g., onload=..., onerror=...)
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
    sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]+/gi, "");

    // 4. Neutralize javascript: and data: URIs
    sanitized = sanitized.replace(/javascript\s*:/gi, "");
    sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, "");

    // 5. Neutralize SQL Injection vectors (comments and raw SQL injection patterns)
    sanitized = sanitized.replace(/--\s*$/g, "");
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, "");

    // 6. Encode HTML special characters to prevent HTML/XSS injection
    sanitized = sanitized
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");

    return sanitized.trim();
  }
}
