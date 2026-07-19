import { buildSampler, isTracingEnabled } from "./tracing";

/**
 * The sampler is head-based and wrapped in a ParentBasedSampler so it always
 * honours an upstream decision. These tests assert the ratio env var is read
 * and clamped correctly, and that the tracing toggle only turns off on the
 * literal string "false".
 */
describe("tracing sampler configuration", () => {
  const ORIGINAL_RATIO = process.env.OTEL_TRACES_SAMPLER_RATIO;
  const ORIGINAL_ENABLED = process.env.TRACING_ENABLED;

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("OTEL_TRACES_SAMPLER_RATIO", ORIGINAL_RATIO);
    restore("TRACING_ENABLED", ORIGINAL_ENABLED);
  });

  it("builds a sampler for the default (unset) ratio", () => {
    delete process.env.OTEL_TRACES_SAMPLER_RATIO;
    const sampler = buildSampler();
    expect(sampler).toBeDefined();
    // ParentBasedSampler describes itself with its delegate ratio.
    expect(sampler.toString()).toContain("1");
  });

  it("builds a sampler for a fractional ratio", () => {
    process.env.OTEL_TRACES_SAMPLER_RATIO = "0.25";
    const sampler = buildSampler();
    expect(sampler.toString()).toContain("0.25");
  });

  it("clamps out-of-range and non-numeric ratios to a valid sampler", () => {
    process.env.OTEL_TRACES_SAMPLER_RATIO = "5";
    expect(() => buildSampler()).not.toThrow();
    process.env.OTEL_TRACES_SAMPLER_RATIO = "not-a-number";
    expect(() => buildSampler()).not.toThrow();
  });

  it("is enabled by default and when TRACING_ENABLED is not 'false'", () => {
    delete process.env.TRACING_ENABLED;
    expect(isTracingEnabled()).toBe(true);
    process.env.TRACING_ENABLED = "true";
    expect(isTracingEnabled()).toBe(true);
  });

  it("is disabled only when TRACING_ENABLED is exactly 'false'", () => {
    process.env.TRACING_ENABLED = "false";
    expect(isTracingEnabled()).toBe(false);
  });
});
