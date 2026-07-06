import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from "@nestjs/swagger";
import { AlertsService } from "./alerts.service";
import {
  CreatePriceAlertDto,
  CreatePortfolioAlertDto,
  CreateAllocationDriftAlertDto,
  CreateMilestoneAlertDto,
  CreatePerformanceAlertDto,
} from "./dto/alert.dto";
import { SubscribeAlertDto } from "./dto/alert-preference.dto";
import { AlertType } from "./entities/alert.entity";
import { JwtAuthGuard } from "src/core/auth/jwt.guard";

@ApiTags("Alerts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post("price")
  @ApiOperation({ summary: "Create a price alert" })
  @ApiResponse({ status: 201, description: "Price alert created successfully" })
  createPriceAlert(@Body() dto: CreatePriceAlertDto) {
    return this.alertsService.createPriceAlert(dto);
  }

  @Post("portfolio")
  @ApiOperation({ summary: "Create a portfolio alert" })
  @ApiResponse({ status: 201, description: "Portfolio alert created" })
  createPortfolioAlert(@Body() dto: CreatePortfolioAlertDto) {
    return this.alertsService.createPortfolioAlert(dto);
  }

  @Post("allocation-drift")
  @ApiOperation({ summary: "Create an allocation drift alert" })
  @ApiResponse({ status: 201, description: "Allocation drift alert created" })
  createAllocationDriftAlert(@Body() dto: CreateAllocationDriftAlertDto) {
    return this.alertsService.createAllocationDriftAlert(dto);
  }

  @Post("milestone")
  @ApiOperation({ summary: "Create a portfolio milestone alert" })
  @ApiResponse({ status: 201, description: "Milestone alert created" })
  createMilestoneAlert(@Body() dto: CreateMilestoneAlertDto) {
    return this.alertsService.createMilestoneAlert(dto);
  }

  @Post("performance")
  @ApiOperation({ summary: "Create a performance alert" })
  @ApiResponse({ status: 201, description: "Performance alert created" })
  createPerformanceAlert(@Body() dto: CreatePerformanceAlertDto) {
    return this.alertsService.createPerformanceAlert(dto);
  }

  @Get()
  @ApiOperation({ summary: "Get all active alerts for a user" })
  @ApiResponse({ status: 200, description: "List of active alerts" })
  getUserAlerts(@Query("userId") userId: string) {
    return this.alertsService.getUserAlerts(userId);
  }

  @Delete(":alertId")
  @ApiOperation({ summary: "Delete (deactivate) an alert by ID" })
  @ApiResponse({ status: 200, description: "Alert deactivated" })
  deleteAlert(@Param("alertId") alertId: string) {
    return this.alertsService.deleteAlert(alertId);
  }

  @Patch(":alertId/toggle")
  @ApiOperation({ summary: "Enable or disable a specific alert" })
  @ApiResponse({ status: 200, description: "Alert toggled" })
  toggleAlert(
    @Param("alertId") alertId: string,
    @Body("active") active: boolean,
  ) {
    return this.alertsService.toggleAlert(alertId, active);
  }

  @Get("history")
  @ApiOperation({ summary: "Get alert trigger history for a user" })
  @ApiQuery({ name: "type", required: false, enum: AlertType })
  @ApiResponse({ status: 200, description: "Alert trigger history" })
  getAlertHistory(
    @Query("userId") userId: string,
    @Query("type") type?: AlertType,
  ) {
    return this.alertsService.getAlertHistory(userId, type);
  }

  @Post("subscribe")
  @ApiOperation({
    summary: "Subscribe to alert notifications",
    description:
      "Create or update alert delivery preferences. Supports in-app, email, websocket, push channels with quiet hours, rate limiting, frequency, and per-type disable.",
  })
  @ApiResponse({
    status: 201,
    description: "Alert preference saved successfully",
  })
  subscribe(@Body() dto: SubscribeAlertDto) {
    return this.alertsService.savePreference(dto);
  }

  @Delete("unsubscribe/:userId")
  @ApiOperation({
    summary: "Unsubscribe from alert notifications",
    description: "Remove alert delivery preferences for a user.",
  })
  @ApiResponse({ status: 200, description: "Alert preference removed" })
  unsubscribe(@Param("userId") userId: string) {
    return this.alertsService.deletePreference(userId);
  }

  @Get("preferences/:userId")
  @ApiOperation({ summary: "Get alert preferences for a user" })
  @ApiResponse({ status: 200, description: "User alert preferences" })
  getPreferences(@Param("userId") userId: string) {
    return this.alertsService.getPreference(userId);
  }
}



