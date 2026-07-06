import { ApiProperty } from "@nestjs/swagger";

export class ComponentStatusDto {
  @ApiProperty({ enum: ["up", "down"], example: "up" })
  status: "up" | "down";

  @ApiProperty({
    required: false,
    example: 5,
    description: "Response time in milliseconds",
  })
  responseTime?: number;

  @ApiProperty({ required: false, example: "Connection refused" })
  message?: string;
}

export class HealthResponseDto {
  @ApiProperty({
    enum: ["ok", "degraded", "error"],
    example: "ok",
    description:
      "ok = all components up; degraded = some up; error = all critical components down",
  })
  status: "ok" | "degraded" | "error";

  @ApiProperty({ example: "2024-01-01T00:00:00.000Z" })
  timestamp: string;

  @ApiProperty({ example: 123.456, description: "Process uptime in seconds" })
  uptime: number;

  @ApiProperty({
    type: "object",
    additionalProperties: { $ref: "#/components/schemas/ComponentStatusDto" },
    example: {
      database: { status: "up", responseTime: 5 },
      redis: { status: "up", responseTime: 2 },
    },
  })
  components: Record<string, ComponentStatusDto>;
}



