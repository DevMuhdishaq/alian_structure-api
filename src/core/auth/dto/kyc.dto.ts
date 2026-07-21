import { IsString, IsNotEmpty } from "class-validator";
import { RefreshTokenDto, TwoFactorVerifyDto } from "./auth.dto";

export class TwoFactorSetupDto {
  @IsString()
  @IsNotEmpty()
  type: "totp" | "sms" | "email";
}

export { TwoFactorVerifyDto, RefreshTokenDto };
