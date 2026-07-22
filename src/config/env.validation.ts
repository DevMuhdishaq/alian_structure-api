import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsUrl,
  Min,
  Max,
} from "class-validator";
import { Transform } from "class-transformer";

export enum NodeEnv {
  Development = "development",
  Production = "production",
  Test = "test",
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @Min(1)
  @Max(65535)
  @Transform(({ value }) => parseInt(value, 10) || 3000)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  API_PREFIX: string = "/api/v1";

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  // RBAC bootstrap: promote the account matching one of these to ADMIN on
  // startup so a fresh deployment has an initial administrator. Optional —
  // when both are unset no seeding occurs. See docs/RBAC.md.
  @IsOptional()
  @IsString()
  ADMIN_BOOTSTRAP_EMAIL?: string;

  @IsOptional()
  @IsString()
  ADMIN_BOOTSTRAP_WALLET?: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRATION: string = "24h";

  // AI Services
  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GROK_API_KEY?: string;

  @IsOptional()
  @IsString()
  LLAMA_API_BASE_URL?: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string = "http://localhost:3001";

  @IsString()
  LOG_LEVEL: string = "info";

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  SENTRY_ENVIRONMENT?: string;

  @IsOptional()
  @IsString()
  SENTRY_RELEASE?: string;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @Min(0)
  @Max(1)
  SENTRY_TRACES_SAMPLE_RATE?: number = 0.1;

  @IsOptional()
  @IsUrl()
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  // Observability toggles
  // Master switch for OpenTelemetry tracing. When false the SDK is never
  // started, so there is zero tracing overhead.
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value !== "false")
  TRACING_ENABLED?: boolean = true;

  // Head-based trace sampling ratio in the range [0, 1]. 1 = sample every
  // trace, 0 = sample none. Keeps tracing overhead bounded in production.
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (value === undefined ? 1 : parseFloat(value)))
  @Min(0)
  @Max(1)
  OTEL_TRACES_SAMPLER_RATIO?: number = 1;

  // Optional bearer/query token that protects the Prometheus /metrics
  // endpoint. When unset the endpoint is open (fine for private networks
  // and local dev); set it in production so only the scraper can read it.
  @IsOptional()
  @IsString()
  METRICS_AUTH_TOKEN?: string;

  // Blockchain configuration
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 1)
  CHAIN_ID: number = 1;

  // Blockchain RPC URLs
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ETH_RPC_URL?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ARB_RPC_URL?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  POLY_RPC_URL?: string;
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  OPT_RPC_URL?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  BSC_RPC_URL?: string;

  // Oracle configuration
  @IsOptional()
  @IsString()
  ORACLE_CONTRACT_ADDRESS?: string;

  @IsOptional()
  @IsString()
  SUBMITTER_PRIVATE_KEY?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 3)
  SUBMITTER_MAX_RETRIES?: number = 3;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 5000)
  SUBMITTER_RETRY_DELAY?: number = 5000;

  // Email configuration
  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10) || 587)
  SMTP_PORT?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  SMTP_SECURE?: boolean;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsString()
  EMAIL_VERIFICATION_URL: string = "http://localhost:3000/auth/verify-email";

  @IsString()
  EMAIL_FROM: string = '"alian-structure" <noreply@alian-structure.com>';

  // Redis
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  // Health check timeouts
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Transform(({ value }) => (value ? parseInt(value, 10) : 5000))
  HEALTH_CHECK_TIMEOUT_MS?: number;

  // Additional OpenAI Configuration
  @IsOptional()
  @IsString()
  OPENAI_BASE_URL?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 3)
  OPENAI_MAX_RETRIES?: number = 3;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 1000)
  OPENAI_RETRY_DELAY?: number = 1000;

  // Oracle submitter additional configuration
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @Min(1)
  SUBMITTER_GAS_LIMIT_MULTIPLIER?: number = 1.2;

  // Compute Job Queue Configuration
  @IsOptional()
  @IsString()
  COMPUTE_JOB_RETRY_POLICIES?: string;

  // Referral System Configuration
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 10)
  REFERRAL_MAX_PER_USER?: number = 10;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 5)
  REFERRAL_MAX_CLAIMS_PER_IP?: number = 5;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 3)
  REFERRAL_MAX_CLAIMS_PER_DEVICE?: number = 3;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 365)
  REFERRAL_CODE_EXPIRY_DAYS?: number = 365;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 3)
  REFERRAL_SUSPICIOUS_IP_THRESHOLD?: number = 3;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 2)
  REFERRAL_SUSPICIOUS_DEVICE_THRESHOLD?: number = 2;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 3600000)
  REFERRAL_RATE_LIMIT_WINDOW_MS?: number = 3600000;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) || 10)
  REFERRAL_RATE_LIMIT_MAX_ATTEMPTS?: number = 10;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  REFERRAL_ENABLE_BOT_DETECTION?: boolean = true;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  REFERRAL_ENABLE_VPN_DETECTION?: boolean = false;
}
