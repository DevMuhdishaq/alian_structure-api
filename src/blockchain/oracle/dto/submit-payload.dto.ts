import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty } from "class-validator";

/**
 * DTO for submitting a signed payload on-chain
 */
export class SubmitPayloadDto {
  @ApiProperty({
    description: "Unique ID of the signed payload to submit on-chain",
    required: true,
    example: "a1b2c3d4-1234-5678-90ef-ghijklmnopqr",
  })
  @IsString()
  @IsNotEmpty()
  payloadId: string;
}



