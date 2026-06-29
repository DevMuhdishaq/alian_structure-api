import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";

export class LinkEmailDto {
  @ApiProperty({
    description: "Email address to link to the user's account",
    required: true,
    example: "newuser@example.com",
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}



