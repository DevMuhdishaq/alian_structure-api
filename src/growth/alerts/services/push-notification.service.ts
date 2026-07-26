import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface PushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly provider: string;

  constructor(private readonly configService: ConfigService) {
    this.provider = this.configService.get<string>("PUSH_PROVIDER", "none");
  }

  async send(payload: PushPayload): Promise<boolean> {
    if (this.provider === "none") {
      this.logger.log(
        `[Push] Would send to user ${payload.userId}: ${payload.title} - ${payload.body}`,
      );
      return true;
    }

    if (this.provider === "firebase") {
      await this.sendFirebase(payload);
      return true;
    }

    this.logger.warn(`[Push] Unknown provider: ${this.provider}`);
    return false;
  }

  private async sendFirebase(_payload: PushPayload): Promise<void> {
    this.logger.log("[Push] Firebase provider not yet integrated");
  }
}
