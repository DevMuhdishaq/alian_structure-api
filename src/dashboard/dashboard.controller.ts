import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "src/core/auth/jwt.guard";
import { DashboardService } from "./dashboard.service";
import { PortfolioOwnerGuard } from "src/investment/portfolio/guards/portfolio-owner.guard";
import { TimeRangeDto } from "./dto/dashboard.dto";

@Controller("dashboard")
@ApiTags("Portfolio Dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(":id/summary")
  @ApiOperation({ summary: "Get portfolio dashboard summary" })
  @UseGuards(PortfolioOwnerGuard)
  async getSummary(@Param("id") id: string, @Query() query: TimeRangeDto) {
    return this.dashboardService.getSummary(id, query.timeRange as any);
  }

  @Get(":id/performance-history")
  @ApiOperation({ summary: "Get portfolio performance history for chart" })
  @UseGuards(PortfolioOwnerGuard)
  async getPerformanceHistory(
    @Param("id") id: string,
    @Query() query: TimeRangeDto,
  ) {
    return this.dashboardService.getPerformanceHistory(
      id,
      query.timeRange as any,
    );
  }

  @Get(":id/allocation")
  @ApiOperation({ summary: "Get portfolio allocation for pie chart" })
  @UseGuards(PortfolioOwnerGuard)
  async getAllocation(@Param("id") id: string) {
    return this.dashboardService.getAllocation(id);
  }

  @Get(":id/holdings")
  @ApiOperation({ summary: "Get portfolio holdings summary" })
  @UseGuards(PortfolioOwnerGuard)
  async getHoldings(@Param("id") id: string) {
    return this.dashboardService.getHoldings(id);
  }

  @Get(":id/movers")
  @ApiOperation({ summary: "Get top and bottom performing assets" })
  @UseGuards(PortfolioOwnerGuard)
  async getMovers(@Param("id") id: string) {
    return this.dashboardService.getMovers(id);
  }

  @Get(":id/health")
  @ApiOperation({ summary: "Get portfolio health indicators" })
  @UseGuards(PortfolioOwnerGuard)
  async getHealth(@Param("id") id: string) {
    return this.dashboardService.getHealth(id);
  }
}



