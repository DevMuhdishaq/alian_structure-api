import { Injectable, Logger } from "@nestjs/common";
import { OnEvent, EventEmitter2 } from "@nestjs/event-emitter";
import { AlertsService } from "../alerts.service";
import { AlertType } from "../entities/alert.entity";
import { AlertTriggerLog } from "../entities/alert-trigger-log.entity";
import { AlertDispatcherService } from "./alert-dispatcher.service";

/**
 * Listens for portfolio domain events and evaluates alert conditions,
 * then dispatches triggered alerts through the dispatcher.
 */
@Injectable()
export class AlertEvaluationService {
  private readonly logger = new Logger(AlertEvaluationService.name);

  constructor(
    private readonly alertsService: AlertsService,
    private readonly dispatcher: AlertDispatcherService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent("portfolio.price.updated")
  async handlePriceUpdate(payload: {
    asset: string;
    price: number;
  }): Promise<void> {
    this.logger.debug(
      `Evaluating price alerts for ${payload.asset} @ ${payload.price}`,
    );
    const triggered = await this.alertsService.evaluatePriceAlerts(
      payload.asset,
      payload.price,
    );
    await this.dispatchTriggered(triggered, "price.updated");
  }

  @OnEvent("portfolio.allocation.updated")
  async handleAllocationUpdate(payload: {
    userId: string;
    deviations: Record<string, number>;
  }): Promise<void> {
    this.logger.debug(
      `Evaluating allocation drift alerts for user ${payload.userId}`,
    );
    const triggered = await this.alertsService.evaluateAllocationDriftAlerts(
      payload.userId,
      payload.deviations,
    );
    await this.dispatchTriggered(triggered, "allocation.drift");
  }

  @OnEvent("portfolio.value.updated")
  async handlePortfolioValueUpdate(payload: {
    userId: string;
    portfolioValue: number;
  }): Promise<void> {
    this.logger.debug(`Evaluating milestone alerts for user ${payload.userId}`);
    const milestoneTriggered = await this.alertsService.evaluateMilestoneAlerts(
      payload.userId,
      payload.portfolioValue,
    );
    await this.dispatchTriggered(milestoneTriggered, "milestone.reached");
  }

  @OnEvent("portfolio.performance.updated")
  async handlePerformanceUpdate(payload: {
    userId: string;
    performancePct: number;
  }): Promise<void> {
    this.logger.debug(
      `Evaluating performance alerts for user ${payload.userId}`,
    );
    const triggered = await this.alertsService.evaluatePerformanceAlerts(
      payload.userId,
      payload.performancePct,
    );
    await this.dispatchTriggered(triggered, "performance.significant");
  }

  private async dispatchTriggered(
    logs: AlertTriggerLog[],
    eventSuffix: string,
  ): Promise<void> {
    for (const log of logs) {
      const eventType = `portfolio.${eventSuffix}`;
      await this.dispatcher.dispatch(log.userId, {
        type: eventType,
        alertId: log.alertId,
        ...log.payload,
      });
      this.eventEmitter.emit(`alert.triggered.${log.type}`, log);
    }
  }
}



