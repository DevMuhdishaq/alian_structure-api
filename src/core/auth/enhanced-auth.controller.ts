import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Public } from "src/common/decorators/public.decorator";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "./jwt.guard";
import { EnhancedAuthService } from "./enhanced-auth.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import {
  TwoFactorSetupDto,
  TwoFactorVerifyDto,
  RefreshTokenDto,
} from "./dto/kyc.dto";

@ApiTags("Enhanced Authentication & KYC")
@Controller("auth")
export class EnhancedAuthController {
  constructor(private readonly enhancedAuthService: EnhancedAuthService) {}

  @Public()
  @Post("register")
  @ApiOperation({
    summary: "Register a new user account",
    description:
      "Create a new user account with email and password authentication",
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: "User registered successfully",
  })
  @ApiResponse({ status: 400, description: "Bad request" })
  @ApiResponse({ status: 409, description: "User already exists" })
  async register(@Body() registerDto: RegisterDto, @Request() req) {
    return this.enhancedAuthService.register(
      registerDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Login with email and password",
    description: "Authenticate user with email and password, returns tokens",
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: "Login successful",
  })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(@Body() loginDto: LoginDto, @Request() req) {
    return this.enhancedAuthService.login(
      loginDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Refresh access token",
    description: "Exchange refresh token for new access token",
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: "Token refreshed successfully",
  })
  @ApiResponse({ status: 401, description: "Invalid refresh token" })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto, @Request() req) {
    return this.enhancedAuthService.refreshToken(
      refreshTokenDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Post("2fa/setup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Setup two-factor authentication",
    description: "Initialize TOTP-based two-factor authentication setup",
  })
  @ApiResponse({
    status: 200,
    description: "2FA setup initialized",
    schema: {
      type: "object",
      properties: {
        secret: { type: "string" },
        qrCodeUrl: { type: "string" },
        backupCodes: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  })
  async setupTwoFactor(@Request() req, @Body() setupDto: TwoFactorSetupDto) {
    return this.enhancedAuthService.setupTwoFactor(req.user.sub, setupDto);
  }

  @Post("2fa/verify-setup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Verify 2FA setup",
    description: "Complete 2FA setup by verifying the TOTP code",
  })
  @ApiResponse({
    status: 200,
    description: "2FA setup verified successfully",
  })
  async verifyTwoFactorSetup(@Request() req, @Body() body: { code: string }) {
    return this.enhancedAuthService.verifyTwoFactorSetup(
      req.user.sub,
      body.code,
    );
  }

  @Post("2fa/verify")
  @ApiOperation({
    summary: "Verify 2FA for login",
    description: "Complete login by verifying 2FA code",
  })
  @ApiResponse({
    status: 200,
    description: "2FA verified, login complete",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Invalid 2FA code, or account locked after too many attempts",
  })
  async verifyTwoFactorLogin(
    @Body() verifyDto: TwoFactorVerifyDto & { userId: string },
    @Request() req,
  ) {
    return this.enhancedAuthService.verifyTwoFactorLogin(
      verifyDto.userId,
      verifyDto,
      { ipAddress: req.ip, userAgent: req.headers["user-agent"] },
    );
  }

  @Post("2fa/disable")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Disable two-factor authentication",
    description:
      "Disable 2FA for the current user account. Requires password " +
      "re-authentication and sends a security alert email.",
  })
  @ApiResponse({
    status: 200,
    description: "2FA disabled successfully",
  })
  @ApiResponse({ status: 401, description: "Invalid password" })
  async disableTwoFactor(@Request() req, @Body() body: { password: string }) {
    return this.enhancedAuthService.disableTwoFactor(
      req.user.sub,
      body.password,
    );
  }

  @Post("2fa/backup-codes/regenerate")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Regenerate 2FA backup codes",
    description:
      "Recovery for a lost device: generate a fresh set of 10 single-use " +
      "backup codes, invalidating all previous ones. Requires password " +
      "re-authentication.",
  })
  @ApiResponse({
    status: 200,
    description: "New backup codes generated",
    schema: {
      type: "object",
      properties: {
        backupCodes: { type: "array", items: { type: "string" } },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Invalid password" })
  async regenerateBackupCodes(
    @Request() req,
    @Body() body: { password: string },
  ) {
    return this.enhancedAuthService.regenerateBackupCodes(
      req.user.sub,
      body.password,
    );
  }

  @Get("2fa/status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get 2FA status",
    description:
      "Return whether 2FA is enabled/pending for the current user, the number " +
      "of remaining backup codes, and any active lockout.",
  })
  @ApiResponse({
    status: 200,
    description: "2FA status",
    schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        pending: { type: "boolean" },
        remainingBackupCodes: { type: "number" },
        lockedUntil: { type: "string", nullable: true, format: "date-time" },
      },
    },
  })
  async getTwoFactorStatus(@Request() req) {
    return this.enhancedAuthService.getTwoFactorStatus(req.user.sub);
  }
}



