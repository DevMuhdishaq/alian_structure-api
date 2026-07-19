import { IsEmail } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RequestRecoveryDto {
  @ApiProperty({
    description: "The email address to send the recovery link to.",
    example: "user@example.com",
  })
  @IsEmail()
  email: string;
}