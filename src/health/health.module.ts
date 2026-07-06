import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { HEALTH_REDIS_CLIENT } from "./health.constants";

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: HEALTH_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis | null => {
        const redisUrl = configService.get<string>("REDIS_URL");
        if (!redisUrl) return null;
        return new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 0,
          enableOfflineQueue: false,
          connectTimeout: 5000,
        });
      },
    },
  ],
})
export class HealthModule {}



