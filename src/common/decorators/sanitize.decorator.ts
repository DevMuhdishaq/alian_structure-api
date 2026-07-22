import { Transform, TransformFnParams } from "class-transformer";

/**
 * Class-transformer decorator that automatically trims leading and trailing whitespace from string properties.
 */
export function Trim() {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value === "string") {
      return value.trim();
    }
    return value;
  });
}

/**
 * Class-transformer decorator that sanitizes string properties to prevent XSS payloads and normalizes unicode characters.
 */
export function SanitizeString() {
  return Transform(({ value }: TransformFnParams) => {
    if (typeof value === "string") {
      return value
        .trim()
        .normalize("NFC")
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/javascript\s*:/gi, "")
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;");
    }
    return value;
  });
}
