import { Module } from "@nestjs/common";
import { RebalancingService } from "./services/rebalancing.service";
import { PortfolioController } from "./controllers/portfolio.controller";

@Module({
  controllers: [PortfolioController],
  providers: [RebalancingService],
})
export class PortfolioModule {}



