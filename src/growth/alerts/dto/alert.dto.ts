import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
  Max,
} from "class-validator";
import { AlertCondition } from "../entities/alert.entity";

export class CreatePriceAlertDto {
  @IsString()
  userId: string;

  @IsString()
  asset: string;

  @IsEnum(AlertCondition)
  condition: AlertCondition;

  @IsNumber()
  @Min(0)
  threshold: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cooldownSeconds?: number;
}

export class CreatePortfolioAlertDto {
  @IsString()
  userId: string;

  @IsEnum(AlertCondition)
  condition: AlertCondition;

  @IsNumber()
  @Min(0)
  threshold: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cooldownSeconds?: number;
}

export class CreateAllocationDriftAlertDto {
  @IsString()
  userId: string;

  @IsString()
  asset: string;

  /** Maximum allowed deviation percentage (e.g. 10 = 10%) */
  @IsNumber()
  @Min(0)
  @Max(100)
  threshold: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cooldownSeconds?: number;
}

export class CreateMilestoneAlertDto {
  @IsString()
  userId: string;

  /** Target portfolio value to trigger milestone */
  @IsNumber()
  @Min(0)
  threshold: number;

  @IsEnum(AlertCondition)
  condition: AlertCondition;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cooldownSeconds?: number;
}

export class CreatePerformanceAlertDto {
  @IsString()
  userId: string;

  /** Percentage change threshold (e.g. 5 = 5% loss/gain) */
  @IsNumber()
  @Min(0)
  threshold: number;

  @IsEnum(AlertCondition)
  condition: AlertCondition;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cooldownSeconds?: number;
}



