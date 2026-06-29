import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsObject, IsOptional } from "class-validator";
import { PayloadType } from "../entities/signed-payload.entity";

/**
 * DTO for creating a new payload to be signed
 */
export class CreatePayloadDto {
  @ApiProperty({
    description: "Type of payload to be processed",
    enum: PayloadType,
    required: true,
    example: PayloadType.PRICE_FEED,
  })
  @IsEnum(PayloadType)
  @IsNotEmpty()
  payloadType: PayloadType;

  @ApiProperty({
    description: "The actual payload data to be signed and submitted",
    type: "object",
    required: true,
    example: { token: "ETH", price: 3200.5, timestamp: 1620000000000 },
  })
  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

  @ApiProperty({
    description: "Optional metadata for the payload",
    type: "object",
    required: false,
    example: { source: "oracle-node-1", version: "1.0.0" },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}



