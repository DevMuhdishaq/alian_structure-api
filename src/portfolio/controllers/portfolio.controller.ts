import { Controller, Post, Body, Param, Get } from "@nestjs/common";
import { RebalancingService } from "../services/rebalancing.service";

@Controller("portfolio")
export class PortfolioController {
  constructor(private readonly rebalancingService: RebalancingService) {}

  @Post(":portfolioId/allocations")
  async setTargetAllocations(
    @Param("portfolioId") portfolioId: string,
    @Body() allocations: Map<string, number>,
  ): Promise<void> {
    await this.rebalancingService.setTargetAllocations(
      portfolioId,
      allocations,
    );
  }

  @Get(":portfolioId/rebalancing-recommendations")
  async getRebalancingRecommendations(
    @Param("portfolioId") portfolioId: string,
  ): Promise<any[]> {
    return await this.rebalancingService.getRebalancingRecommendations(
      portfolioId,
    );
  }

  @Post(":portfolioId/rebalance")
  async executeRebalancing(
    @Param("portfolioId") portfolioId: string,
    @Body("dryRun") dryRun: boolean,
  ): Promise<any> {
    return await this.rebalancingService.executeRebalancing(
      portfolioId,
      dryRun,
    );
  }
}



