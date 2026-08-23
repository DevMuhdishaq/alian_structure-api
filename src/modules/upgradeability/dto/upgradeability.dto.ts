import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsSemVer,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// ---------------------------------------------------------------------------
// Plan upgrade
// ---------------------------------------------------------------------------

export class PlanUpgradeDto {
  @ApiProperty({ example: "oracle-service" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  moduleKey: string;

  @ApiProperty({ example: "1.0.0" })
  @IsSemVer()
  fromVersion: string;

  @ApiProperty({ example: "1.1.0" })
  @IsSemVer()
  toVersion: string;

  @ApiPropertyOptional({ example: "Adds price-feed caching layer" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description?: string;
}

// ---------------------------------------------------------------------------
// Execute upgrade
// ---------------------------------------------------------------------------

export class ExecuteUpgradeDto {
  @ApiProperty({ example: "oracle-service" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  moduleKey: string;

  @ApiProperty({ example: "1.0.0" })
  @IsSemVer()
  fromVersion: string;

  @ApiProperty({ example: "1.1.0" })
  @IsSemVer()
  toVersion: string;

  @ApiProperty({
    example: "operator@example.com",
    description: "Principal that authorises this upgrade (from JWT context).",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  authorisedBy: string;
}

// ---------------------------------------------------------------------------
// Register implementation version
// ---------------------------------------------------------------------------

export class RegisterImplementationDto {
  @ApiProperty({ example: "oracle-service" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  moduleKey: string;

  @ApiProperty({ example: "1.1.0" })
  @IsSemVer()
  version: string;

  @ApiProperty({ example: "sha256:ab12cd34..." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  checksum: string;

  @ApiProperty({ example: "s3://artifacts/oracle-service/1.1.0.tar.gz" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  artifactUri: string;

  @ApiPropertyOptional({ example: ">=0.1.0 <1.0.0" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  coreCompatibilityRange?: string;

  @ApiPropertyOptional({ example: "Adds price-feed caching layer" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  releaseNotes?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Rollback upgrade
// ---------------------------------------------------------------------------

export class RollbackUpgradeDto {
  @ApiProperty({ example: "oracle-service" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  moduleKey: string;

  @ApiProperty({ example: "1.1.0" })
  @IsSemVer()
  failedVersion: string;

  @ApiProperty({ example: "1.0.0" })
  @IsSemVer()
  targetVersion: string;

  @ApiProperty({
    example: "operator@example.com",
    description: "Principal that authorises this rollback (from JWT context).",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  authorisedBy: string;
}

// ---------------------------------------------------------------------------
// Register migration hook
// ---------------------------------------------------------------------------

export class RegisterMigrationHookDto {
  @ApiProperty({ example: "oracle-service" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  moduleKey: string;

  @ApiProperty({ example: "migrate-price-cache-schema" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @ApiProperty({ example: "pre", enum: ["pre", "post"] })
  @IsString()
  @IsNotEmpty()
  phase: "pre" | "post";

  @ApiPropertyOptional({
    example: { targetTable: "price_cache", addColumn: "source_v2" },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Simulate upgrade (testing utility)
// ---------------------------------------------------------------------------

export class SimulateUpgradeDto {
  @ApiProperty({ example: "oracle-service" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  moduleKey: string;

  @ApiProperty({ example: "1.0.0" })
  @IsSemVer()
  fromVersion: string;

  @ApiProperty({ example: "1.1.0" })
  @IsSemVer()
  toVersion: string;

  @ApiPropertyOptional({
    description:
      "When true, persist the simulation result as a real upgrade record with status 'completed'.",
  })
  @IsOptional()
  @IsBoolean()
  persist?: boolean;
}

// ---------------------------------------------------------------------------
// Batch simulate (testing utility)
// ---------------------------------------------------------------------------

export class SimulateBatchDto {
  @ApiProperty({
    type: [PlanUpgradeDto],
    description: "List of upgrades to simulate sequentially.",
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanUpgradeDto)
  upgrades: PlanUpgradeDto[];
}

// ---------------------------------------------------------------------------
// Query upgrades
// ---------------------------------------------------------------------------

export class QueryUpgradesDto {
  @ApiPropertyOptional({ example: "oracle-service" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  moduleKey?: string;

  @ApiPropertyOptional({ example: "completed", enum: ["pending", "migrating", "completed", "failed", "rolled_back"] })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  status?: string;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;
}

// ---------------------------------------------------------------------------
// Update config
// ---------------------------------------------------------------------------

export class UpdateConfigDto {
  @ApiPropertyOptional({ example: ["ADMIN"] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authorisedRoles?: string[];

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxConcurrentUpgrades?: number;

  @ApiPropertyOptional({ example: 30000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  hookTimeoutMs?: number;
}
