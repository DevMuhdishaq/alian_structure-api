import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Alert, AlertType, AlertCondition } from "./entities/alert.entity";
import { AlertFrequency } from "./entities/alert-preference.entity";
import { AlertTriggerLog } from "./entities/alert-trigger-log.entity";
import { AlertPreference } from "./entities/alert-preference.entity";
import {
  CreatePriceAlertDto,
  CreatePortfolioAlertDto,
  CreateAllocationDriftAlertDto,
  CreateMilestoneAlertDto,
  CreatePerformanceAlertDto,
} from "./dto/alert.dto";
import { SubscribeAlertDto } from "./dto/alert-preference.dto";

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert)
    private alertRepo: Repository<Alert>,
    @InjectRepository(AlertTriggerLog)
    private logRepo: Repository<AlertTriggerLog>,
    @InjectRepository(AlertPreference)
    private preferenceRepo: Repository<AlertPreference>,
  ) {}

  async createPriceAlert(dto: CreatePriceAlertDto): Promise<Alert> {
    const alert = this.alertRepo.create({
      userId: dto.userId,
      type: AlertType.PRICE,
      asset: dto.asset,
      condition: dto.condition,
      threshold: dto.threshold,
      cooldownSeconds: dto.cooldownSeconds ?? 300,
      active: true,
    });
    return this.alertRepo.save(alert);
  }

  async createPortfolioAlert(dto: CreatePortfolioAlertDto): Promise<Alert> {
    const alert = this.alertRepo.create({
      userId: dto.userId,
      type: AlertType.PORTFOLIO,
      condition: dto.condition,
      threshold: dto.threshold,
      cooldownSeconds: dto.cooldownSeconds ?? 300,
      active: true,
    });
    return this.alertRepo.save(alert);
  }

  async createAllocationDriftAlert(
    dto: CreateAllocationDriftAlertDto,
  ): Promise<Alert> {
    const alert = this.alertRepo.create({
      userId: dto.userId,
      type: AlertType.ALLOCATION_DRIFT,
      asset: dto.asset,
      condition: AlertCondition.DEVIATION,
      threshold: dto.threshold,
      cooldownSeconds: dto.cooldownSeconds ?? 3600,
      active: true,
    });
    return this.alertRepo.save(alert);
  }

  async createMilestoneAlert(dto: CreateMilestoneAlertDto): Promise<Alert> {
    const alert = this.alertRepo.create({
      userId: dto.userId,
      type: AlertType.MILESTONE,
      condition: dto.condition,
      threshold: dto.threshold,
      cooldownSeconds: dto.cooldownSeconds ?? 86400,
      active: true,
    });
    return this.alertRepo.save(alert);
  }

  async createPerformanceAlert(dto: CreatePerformanceAlertDto): Promise<Alert> {
    const alert = this.alertRepo.create({
      userId: dto.userId,
      type: AlertType.PERFORMANCE,
      condition: dto.condition,
      threshold: dto.threshold,
      cooldownSeconds: dto.cooldownSeconds ?? 3600,
      active: true,
    });
    return this.alertRepo.save(alert);
  }

  async getUserAlerts(userId: string): Promise<Alert[]> {
    return this.alertRepo.find({ where: { userId, active: true } });
  }

  async deleteAlert(alertId: string): Promise<void> {
    const alert = await this.alertRepo.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException();
    alert.active = false;
    await this.alertRepo.save(alert);
  }

  async toggleAlert(alertId: string, active: boolean): Promise<Alert> {
    const alert = await this.alertRepo.findOne({ where: { id: alertId } });
    if (!alert) throw new NotFoundException();
    alert.active = active;
    return this.alertRepo.save(alert);
  }

  async getAlertHistory(
    userId: string,
    type?: AlertType,
  ): Promise<AlertTriggerLog[]> {
    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;
    return this.logRepo.find({
      where,
      order: { triggeredAt: "DESC" },
    });
  }

  async evaluatePriceAlerts(
    asset: string,
    currentPrice: number,
  ): Promise<AlertTriggerLog[]> {
    const alerts = await this.alertRepo.find({
      where: { type: AlertType.PRICE, asset, active: true },
    });
    const triggered: AlertTriggerLog[] = [];
    for (const alert of alerts) {
      if (
        !this.isConditionMet(alert.condition!, currentPrice, alert.threshold!)
      )
        continue;
      if (!this.isCooldownElapsed(alert)) continue;
      alert.lastTriggeredAt = new Date();
      await this.alertRepo.save(alert);
      const log = this.logRepo.create({
        alertId: alert.id,
        userId: alert.userId,
        type: AlertType.PRICE,
        payload: {
          asset,
          currentPrice,
          threshold: alert.threshold,
          condition: alert.condition,
        },
      });
      triggered.push(await this.logRepo.save(log));
    }
    return triggered;
  }

  async evaluateAllocationDriftAlerts(
    userId: string,
    deviations: Record<string, number>,
  ): Promise<AlertTriggerLog[]> {
    const alerts = await this.alertRepo.find({
      where: { userId, type: AlertType.ALLOCATION_DRIFT, active: true },
    });
    const triggered: AlertTriggerLog[] = [];
    for (const alert of alerts) {
      const deviation = deviations[alert.asset!];
      if (deviation === undefined) continue;
      if (Math.abs(deviation) < alert.threshold!) continue;
      if (!this.isCooldownElapsed(alert)) continue;
      alert.lastTriggeredAt = new Date();
      await this.alertRepo.save(alert);
      const log = this.logRepo.create({
        alertId: alert.id,
        userId: alert.userId,
        type: AlertType.ALLOCATION_DRIFT,
        payload: { asset: alert.asset, deviation, threshold: alert.threshold },
      });
      triggered.push(await this.logRepo.save(log));
    }
    return triggered;
  }

  async evaluateMilestoneAlerts(
    userId: string,
    portfolioValue: number,
  ): Promise<AlertTriggerLog[]> {
    const alerts = await this.alertRepo.find({
      where: { userId, type: AlertType.MILESTONE, active: true },
    });
    const triggered: AlertTriggerLog[] = [];
    for (const alert of alerts) {
      if (
        !this.isConditionMet(alert.condition!, portfolioValue, alert.threshold!)
      )
        continue;
      if (!this.isCooldownElapsed(alert)) continue;
      alert.lastTriggeredAt = new Date();
      await this.alertRepo.save(alert);
      const log = this.logRepo.create({
        alertId: alert.id,
        userId: alert.userId,
        type: AlertType.MILESTONE,
        payload: {
          portfolioValue,
          threshold: alert.threshold,
          condition: alert.condition,
        },
      });
      triggered.push(await this.logRepo.save(log));
    }
    return triggered;
  }

  async evaluatePerformanceAlerts(
    userId: string,
    performancePct: number,
  ): Promise<AlertTriggerLog[]> {
    const alerts = await this.alertRepo.find({
      where: { userId, type: AlertType.PERFORMANCE, active: true },
    });
    const triggered: AlertTriggerLog[] = [];
    for (const alert of alerts) {
      const absPct = Math.abs(performancePct);
      if (absPct < alert.threshold!) continue;
      if (!this.isCooldownElapsed(alert)) continue;
      alert.lastTriggeredAt = new Date();
      await this.alertRepo.save(alert);
      const log = this.logRepo.create({
        alertId: alert.id,
        userId: alert.userId,
        type: AlertType.PERFORMANCE,
        payload: { performancePct, threshold: alert.threshold },
      });
      triggered.push(await this.logRepo.save(log));
    }
    return triggered;
  }

  private isConditionMet(
    condition: AlertCondition,
    current: number,
    threshold: number,
  ): boolean {
    return condition === AlertCondition.ABOVE
      ? current > threshold
      : current < threshold;
  }

  private isCooldownElapsed(alert: Alert): boolean {
    if (!alert.lastTriggeredAt) return true;
    const elapsed = (Date.now() - alert.lastTriggeredAt.getTime()) / 1000;
    return elapsed >= alert.cooldownSeconds;
  }

  async getPreference(userId: string): Promise<AlertPreference | null> {
    return this.preferenceRepo.findOne({ where: { userId } });
  }

  async savePreference(dto: SubscribeAlertDto): Promise<AlertPreference> {
    const existing = await this.preferenceRepo.findOne({
      where: { userId: dto.userId },
    });
    if (existing) {
      existing.channels = dto.channels;
      if (dto.quietHoursStart !== undefined)
        existing.quietHoursStart = dto.quietHoursStart;
      if (dto.quietHoursEnd !== undefined)
        existing.quietHoursEnd = dto.quietHoursEnd;
      if (dto.rateLimit !== undefined) existing.rateLimit = dto.rateLimit;
      if (dto.frequency !== undefined) existing.frequency = dto.frequency;
      if (dto.disabledAlertTypes !== undefined)
        existing.disabledAlertTypes = dto.disabledAlertTypes;
      return this.preferenceRepo.save(existing);
    }
    const pref = this.preferenceRepo.create({
      userId: dto.userId,
      channels: dto.channels,
      quietHoursStart: dto.quietHoursStart ?? null,
      quietHoursEnd: dto.quietHoursEnd ?? null,
      rateLimit: dto.rateLimit ?? 10,
      frequency: dto.frequency ?? AlertFrequency.REALTIME,
      disabledAlertTypes: dto.disabledAlertTypes ?? [],
    });
    return this.preferenceRepo.save(pref);
  }

  async deletePreference(userId: string): Promise<void> {
    const pref = await this.preferenceRepo.findOne({ where: { userId } });
    if (!pref) throw new NotFoundException();
    await this.preferenceRepo.remove(pref);
  }
}



