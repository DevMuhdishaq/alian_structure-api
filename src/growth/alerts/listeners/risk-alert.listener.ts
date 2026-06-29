import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AlertDispatcherService } from "../services/alert-dispatcher.service";

@Injectable()
export class RiskAlertListener {
  constructor(private readonly dispatcher: AlertDispatcherService) {}

  @OnEvent("risk.threshold.breached")
  async handle(payload: { userId: string; alert: any }) {
    await this.dispatcher.dispatch(payload.userId, {
      type: "risk.threshold.breached",
      ...payload.alert,
    });
  }
}



