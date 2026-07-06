import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Length,
  IsBoolean,
} from "class-validator";
import { Chain, AssetType } from "../entities/portfolio-asset.entity";

export class PortfolioAssetDto {
  @IsString()
  @Length(3, 10)
  ticker: string;

  @IsString()
  name: string;

  @IsEnum(Chain)
  chain: Chain;

  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class AddAssetToPortfolioDto {
  @IsString()
  ticker: string;

  @IsString()
  name: string;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class ConstraintOverrideDto {
  @IsOptional()
  @IsBoolean()
  overrideConstraints?: boolean;

  @IsOptional()
  @IsString()
  overrideReason?: string;

  @IsOptional()
  @IsString()
  acknowledgedBy?: string;
}

export class AddHoldingDto extends ConstraintOverrideDto {
  @IsString()
  @Length(3, 10)
  ticker: string;

  @IsString()
  name: string;

  @IsEnum(Chain)
  chain: Chain;

  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsNumber()
  costBasis: number;
}

export class UpdateHoldingDto extends ConstraintOverrideDto {
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class PortfolioAssetResponseDto {
  id: string;
  ticker: string;
  name: string;
  chain: Chain;
  type: AssetType;
  quantity: number;
  currentPrice?: number;
  value: number;
  allocationPercentage: number;
  suggestedAllocation?: number;
  expectedReturn?: number;
  volatility?: number;
  beta?: number;
  costBasis?: number;
  unrealizedGain?: number;
  updatedAt: Date;
}



