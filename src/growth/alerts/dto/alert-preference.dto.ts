import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsIn,
  IsEnum,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AlertFrequency } from "../entities/alert-preference.entity";

export class SubscribeAlertDto {
  @ApiProperty({ description: "User ID to subscribe for alerts" })
  @IsString()
  userId: string;

  @ApiProperty({
    description: "Delivery channels",
    example: ["in-app", "email"],
    enum: ["in-app", "email", "websocket", "push"],
    isArray: true,
  })
  @IsArray()
  @IsIn(["in-app", "email", "websocket", "push"], { each: true })
  channels: string[];

  @ApiPropertyOptional({
    description: "Start of quiet hours (0-23)",
    example: 22,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(23)
  quietHoursStart?: number;

  @ApiPropertyOptional({
    description: "End of quiet hours (0-23)",
    example: 8,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(23)
  quietHoursEnd?: number;

  @ApiPropertyOptional({
    description: "Maximum alerts per hour (default: 10)",
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  rateLimit?: number;

  @ApiPropertyOptional({
    description: "Alert delivery frequency",
    enum: AlertFrequency,
    example: AlertFrequency.REALTIME,
  })
  @IsOptional()
  @IsEnum(AlertFrequency)
  frequency?: AlertFrequency;

  @ApiPropertyOptional({
    description: "Alert types to disable",
    example: ["liquidation"],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledAlertTypes?: string[];
}

export class UnsubscribeAlertDto {
  @ApiProperty({ description: "User ID to unsubscribe from alerts" })
  @IsString()
  userId: string;
}



