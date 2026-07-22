import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  DeFiPosition,
  PositionStatus,
  PositionType,
  DeFiProtocol,
} from "../entities/defi-position.entity";
import { DeFiYieldRecord } from "../entities/defi-yield-record.entity";
import { ProtocolRegistry } from "../protocols/protocol-registry";
import {
  StakeDto,
  UnstakeDto,
  StakingPositionResponseDto,
  StakingOpportunityDto,
} from "../dto/staking.dto";

@Injectable()
export class StakingService {
  private readonly logger = new Logger(StakingService.name);

  constructor(
    @InjectRepository(DeFiPosition)
    private readonly positionRepository: Repository<DeFiPosition>,
    @InjectRepository(DeFiYieldRecord)
    private readonly yieldRepository: Repository<DeFiYieldRecord>,
    private readonly protocolRegistry: ProtocolRegistry,
  ) {}

  /**
   * Open a new staking position
   */
  async stake(
    userId: string,
    dto: StakeDto,
  ): Promise<StakingPositionResponseDto> {
    const adapter = this.protocolRegistry.getAdapter(dto.protocol);

    let apy = 0;
    try {
      apy = await adapter.getAPY(dto.tokenSymbol);
    } catch (err) {
      this.logger.warn(
        `Could not fetch APY for ${dto.protocol}/${dto.tokenSymbol}: ${err}`,
      );
    }

    const position = this.positionRepository.create({
      user_id: userId,
      protocol: dto.protocol,
      position_type: PositionType.STAKING,
      status: PositionStatus.ACTIVE,
      contract_address: dto.protocol,
      wallet_address: dto.walletAddress,
      token_symbol: dto.tokenSymbol,
      principal_amount: dto.amount,
      current_amount: dto.amount,
      accumulated_yield: 0,
      apy,
      auto_compound_enabled: dto.autoCompound ?? false,
    });

    const saved = await this.positionRepository.save(position);
    return this.toResponseDto(saved);
  }

  /**
   * Close (partially or fully) a staking position
   */
  async unstake(
    userId: string,
    dto: UnstakeDto,
  ): Promise<StakingPositionResponseDto> {
    const position = await this.findOwnedPosition(dto.positionId, userId);

    position.current_amount = Math.max(
      0,
      Number(position.current_amount) - dto.amount,
    );

    if (position.current_amount === 0) {
      position.status = PositionStatus.CLOSED;
    }

    const updated = await this.positionRepository.save(position);
    return this.toResponseDto(updated);
  }

  /**
   * Get all staking positions for a user
   */
  async getStakingPositions(
    userId: string,
  ): Promise<StakingPositionResponseDto[]> {
    const positions = await this.positionRepository.find({
      where: { user_id: userId, position_type: PositionType.STAKING },
    });
    return positions.map((p) => this.toResponseDto(p));
  }

  /**
   * Claim accumulated staking rewards
   */
  async claimRewards(
    userId: string,
    positionId: string,
  ): Promise<{ claimed: number; positionId: string }> {
    const position = await this.findOwnedPosition(positionId, userId);
    const adapter = this.protocolRegistry.getAdapter(position.protocol);

    let totalClaimed = 0;
    try {
      const rewards = await adapter.getRewards(
        [position.contract_address],
        position.wallet_address,
      );

      for (const reward of rewards) {
        if (reward.claimable && reward.amount > 0) {
          totalClaimed += reward.valueUSD;

          await this.yieldRepository.save(
            this.yieldRepository.create({
              position_id: positionId,
              amount: reward.amount,
              token_symbol: reward.token,
              token_value: reward.valueUSD,
              apy: reward.apy,
              yield_type: "staking_reward",
              claimed: true,
              claim_date: new Date(),
            } as any),
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `Could not fetch rewards for position ${positionId}: ${err}`,
      );
    }

    position.accumulated_yield =
      Number(position.accumulated_yield) + totalClaimed;
    await this.positionRepository.save(position);

    return { claimed: totalClaimed, positionId };
  }

  /**
   * Auto-compound rewards back into the staking position
   */
  async autoCompound(
    userId: string,
    positionId: string,
  ): Promise<{ compounded: number; positionId: string }> {
    const position = await this.findOwnedPosition(positionId, userId);

    if (!position.auto_compound_enabled) {
      return { compounded: 0, positionId };
    }

    const adapter = this.protocolRegistry.getAdapter(position.protocol);
    let totalCompounded = 0;

    try {
      const rewards = await adapter.getRewards(
        [position.contract_address],
        position.wallet_address,
      );

      for (const reward of rewards) {
        if (reward.claimable && reward.amount > 0) {
          totalCompounded += reward.amount;
        }
      }
    } catch (err) {
      this.logger.warn(
        `Could not compound rewards for position ${positionId}: ${err}`,
      );
    }

    if (totalCompounded > 0) {
      position.current_amount =
        Number(position.current_amount) + totalCompounded;
      position.accumulated_yield =
        Number(position.accumulated_yield) + totalCompounded;
      await this.positionRepository.save(position);
    }

    return { compounded: totalCompounded, positionId };
  }

  /**
   * Set auto-compound on/off for a position
   */
  async setAutoCompound(
    userId: string,
    positionId: string,
    enabled: boolean,
  ): Promise<StakingPositionResponseDto> {
    const position = await this.findOwnedPosition(positionId, userId);
    position.auto_compound_enabled = enabled;
    const updated = await this.positionRepository.save(position);
    return this.toResponseDto(updated);
  }

  /**
   * Discover staking opportunities across all protocols
   */
  async getStakingOpportunities(
    tokens: string[],
  ): Promise<StakingOpportunityDto[]> {
    const opportunities: StakingOpportunityDto[] = [];

    for (const adapter of this.protocolRegistry.getAllAdapters()) {
      if (typeof adapter.stake !== "function") continue;

      for (const token of tokens) {
        try {
          const apy = await adapter.getAPY(token);
          const metrics = await adapter.getProtocolMetrics();

          opportunities.push({
            protocol: adapter.name as DeFiProtocol,
            tokenSymbol: token,
            apy,
            minStake: 0,
            lockPeriodDays: 0,
            riskScore: this.computeRiskScore(metrics),
          });
        } catch {
          // skip unavailable adapters
        }
      }
    }

    return opportunities.sort(
      (a, b) => b.apy - a.riskScore * 0.1 - (a.apy - b.riskScore * 0.1),
    );
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private async findOwnedPosition(
    positionId: string,
    userId: string,
  ): Promise<DeFiPosition> {
    const position = await this.positionRepository.findOne({
      where: { id: positionId, user_id: userId },
    });
    if (!position) {
      throw new NotFoundException(`Staking position ${positionId} not found`);
    }
    return position;
  }

  private toResponseDto(position: DeFiPosition): StakingPositionResponseDto {
    return {
      id: position.id,
      protocol: position.protocol,
      walletAddress: position.wallet_address,
      tokenSymbol: position.token_symbol,
      stakedAmount: Number(position.principal_amount),
      currentValue: Number(position.current_amount),
      accumulatedRewards: Number(position.accumulated_yield),
      apy: Number(position.apy),
      autoCompound: position.auto_compound_enabled,
      createdAt: position.created_at,
    };
  }

  private computeRiskScore(metrics: { tvl: number; audits: string[] }): number {
    let score = 0;
    if (metrics.tvl < 10_000_000) score += 30;
    else if (metrics.tvl < 100_000_000) score += 15;
    if (!metrics.audits || metrics.audits.length === 0) score += 20;
    return Math.min(100, score);
  }
}
