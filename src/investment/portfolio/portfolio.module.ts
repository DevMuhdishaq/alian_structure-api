import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";

// Entities
import { Portfolio } from "./entities/portfolio.entity";
import { PortfolioAsset } from "./entities/portfolio-asset.entity";
import { Transaction } from "./entities/transaction.entity";
import { RiskProfile } from "./entities/risk-profile.entity";
import { OptimizationHistory } from "./entities/optimization-history.entity";
import { RebalancingEvent } from "./entities/rebalancing-event.entity";
import { PerformanceMetric } from "./entities/performance-metric.entity";
import { BacktestResult } from "./entities/backtest-result.entity";

// Services
import { PortfolioService } from "./services/portfolio.service";
import { RebalancingService } from "./services/rebalancing.service";
import { PerformanceAnalyticsService } from "./services/performance-analytics.service";
import { BacktestingService } from "./services/backtesting.service";
import { MLPredictionService } from "./services/ml-prediction.service";
import { PortfolioConstraintService } from "./services/portfolio-constraint.service";
import { AuditLogService } from "src/infrastructure/audit/audit-log.service";
import { TradingTransactionService } from "./services/trading-transaction.service";

// Controllers
import { PortfolioController } from "./portfolio.controller";
import { PortfolioManagementController } from "./portfolio-management.controller";
import { TransactionController } from "./controllers/transaction.controller";
import { PortfolioOwnerGuard } from "./guards/portfolio-owner.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Portfolio,
      PortfolioAsset,
      Transaction,
      RiskProfile,
      OptimizationHistory,
      RebalancingEvent,
      PerformanceMetric,
      BacktestResult,
    ]),
    BullModule.registerQueue(
      {
        name: "portfolio-optimization",
      },
      {
        name: "rebalancing",
      },
      {
        name: "performance-analytics",
      },
      {
        name: "backtesting",
      },
      {
        name: "ml-predictions",
      },
    ),
  ],
  providers: [
    PortfolioService,
    RebalancingService,
    PerformanceAnalyticsService,
    BacktestingService,
    MLPredictionService,
    PortfolioConstraintService,
    AuditLogService,
    TradingTransactionService,
    PortfolioOwnerGuard,
  ],
  controllers: [
    PortfolioController,
    PortfolioManagementController,
    TransactionController,
  ],

  exports: [
    PortfolioService,
    RebalancingService,
    PerformanceAnalyticsService,
    BacktestingService,
    MLPredictionService,
    PortfolioConstraintService,
    TradingTransactionService,
  ],
})
export class PortfolioModule {}
