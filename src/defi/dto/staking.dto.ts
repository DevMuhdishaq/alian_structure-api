import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  Min,
  Max,
} from "class-validator";
import { DeFiProtocol } from "../entities/defi-position.entity";

export class StakeDto {
  @IsEnum(DeFiProtocol)
  protocol: DeFiProtocol;

  @IsString()
  walletAddress: string;

  @IsString()
  tokenSymbol: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsBoolean()
  @IsOptional()
  autoCompound?: boolean;
}

export class UnstakeDto {
  @IsString()
  positionId: string;

  @IsNumber()
  @Min(0)
  amount: number;
}

export class StakingRewardsDto {
  @IsString()
  positionId: string;

  @IsBoolean()
  @IsOptional()
  claimAll?: boolean;
}

export class AutoCompoundConfigDto {
  @IsString()
  positionId: string;

  @IsBoolean()
  enabled: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  minRewardThresholdPercent?: number;
}

export class StakingPositionResponseDto {
  id: string;
  protocol: DeFiProtocol;
  walletAddress: string;
  tokenSymbol: string;
  stakedAmount: number;
  currentValue: number;
  accumulatedRewards: number;
  apy: number;
  autoCompound: boolean;
  createdAt: Date;
}

export class StakingOpportunityDto {
  protocol: DeFiProtocol;
  tokenSymbol: string;
  apy: number;
  minStake: number;
  lockPeriodDays: number;
  riskScore: number;
}
