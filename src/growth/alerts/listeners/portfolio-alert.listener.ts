import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AlertDispatcherService } from "../services/alert-dispatcher.service";

@Injectable()
export class PortfolioAlertListener {
  constructor(private readonly dispatcher: AlertDispatcherService) {}

  @OnEvent("portfolio.rebalanced")
  async handleRebalanced(payload: { userId: string; details: any }) {
    await this.dispatcher.dispatch(payload.userId, {
      type: "portfolio.rebalanced",
      ...payload.details,
    });
  }

  @OnEvent("portfolio.allocation.drift")
  async handleAllocationDrift(payload: {
    userId: string;
    asset: string;
    deviation: number;
    threshold: number;
  }) {
    await this.dispatcher.dispatch(payload.userId, {
      type: "portfolio.allocation.drift",
      asset: payload.asset,
      deviation: payload.deviation,
      threshold: payload.threshold,
    });
  }

  @OnEvent("portfolio.milestone.reached")
  async handleMilestoneReached(payload: {
    userId: string;
    portfolioValue: number;
    threshold: number;
  }) {
    await this.dispatcher.dispatch(payload.userId, {
      type: "portfolio.milestone.reached",
      portfolioValue: payload.portfolioValue,
      threshold: payload.threshold,
    });
  }

  @OnEvent("portfolio.performance.significant")
  async handlePerformanceSignificant(payload: {
    userId: string;
    performancePct: number;
    threshold: number;
  }) {
    await this.dispatcher.dispatch(payload.userId, {
      type: "portfolio.performance.significant",
      performancePct: payload.performancePct,
      threshold: payload.threshold,
    });
  }
}



