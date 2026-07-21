import { IsString, IsNotEmpty, IsObject, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * DTO for verifying a signature off-chain
 */
export class VerifySignatureDto {
  @ApiProperty({
    description: "Payload data that was originally signed",
    type: "object",
    example: { token: "ETH", price: 3200.5, timestamp: 1620000000000 },
  })
  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

  @ApiProperty({
    description: "ECDSA signature (0x-prefixed, 132 chars)",
    example: "0x1234567890abcdef....",
    pattern: "^0x[a-fA-F0-9]{130}$",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{130}$/, {
    message: "Signature must be a valid hex string with 0x prefix (132 chars)",
  })
  signature: string;

  @ApiProperty({
    description: "Expected signer Ethereum address (0x-prefixed, 40 hex chars)",
    example: "0xAbCd1234567890abcdef1234567890abcdef1234",
    pattern: "^0x[a-fA-F0-9]{40}$",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: "Expected signer must be a valid Ethereum address",
  })
  expectedSigner: string;
}



