import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  ExecuteUpgradeDto,
  PlanUpgradeDto,
  QueryUpgradesDto,
  RegisterImplementationDto,
  RegisterMigrationHookDto,
  RollbackUpgradeDto,
  SimulateBatchDto,
  SimulateUpgradeDto,
  UpdateConfigDto,
} from "src/modules/upgradeability/dto/upgradeability.dto";
import { UpgradeabilityService } from "src/modules/upgradeability/upgradeability.service";
import { Roles } from "src/common/guard/roles.decorator";
import { Role } from "src/common/guard/roles.enum";
import { SkipKyc } from "src/common/decorators/skip-kyc.decorator";

@ApiTags("Upgradeability")
@ApiBearerAuth()
@ApiResponse({ status: 401, description: "Authentication required" })
@ApiResponse({ status: 403, description: "Administrator role required" })
@Roles(Role.ADMIN)
@SkipKyc()
@Controller("upgradeability")
export class UpgradeabilityController {
  constructor(private readonly upgradeabilityService: UpgradeabilityService) {}

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  @Get("config")
  @ApiOperation({ summary: "Get upgradeability configuration" })
  async getConfig() {
    return { config: this.upgradeabilityService.getConfig() };
  }

  @Post("config")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update upgradeability configuration" })
  async updateConfig(@Body() dto: UpdateConfigDto) {
    return { config: this.upgradeabilityService.updateConfig(dto) };
  }

  // ---------------------------------------------------------------------------
  // Implementation versions
  // ---------------------------------------------------------------------------

  @Post("implementations")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Register a new implementation version",
    description:
      "Registers a deployable artefact for a module at a specific version. Setting active=true deactivates the previously active version.",
  })
  @ApiResponse({ status: 201, description: "Implementation registered" })
  @ApiResponse({ status: 409, description: "Version already registered" })
  async registerImplementation(@Body() dto: RegisterImplementationDto) {
    return {
      implementation:
        await this.upgradeabilityService.registerImplementation(dto),
    };
  }

  @Get("implementations/:moduleKey")
  @ApiOperation({ summary: "List implementation versions for a module" })
  @ApiParam({ name: "moduleKey", description: "Module identifier" })
  async listImplementations(
    @Param("moduleKey") moduleKey: string,
  ) {
    return {
      implementations:
        await this.upgradeabilityService.listImplementations(moduleKey),
    };
  }

  @Get("implementations/:moduleKey/active")
  @ApiOperation({ summary: "Get the active implementation for a module" })
  @ApiParam({ name: "moduleKey", description: "Module identifier" })
  async getActiveImplementation(
    @Param("moduleKey") moduleKey: string,
  ) {
    return {
      implementation:
        await this.upgradeabilityService.findActiveImplementation(moduleKey),
    };
  }

  // ---------------------------------------------------------------------------
  // Migration hooks
  // ---------------------------------------------------------------------------

  @Post("hooks")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Register a migration hook for a module",
    description:
      "Hooks run in registration order during execute(). Pre-hooks run before the implementation switch; post-hooks run after.",
  })
  @ApiResponse({ status: 201, description: "Hook registered" })
  async registerHook(@Body() dto: RegisterMigrationHookDto) {
    this.upgradeabilityService.registerMigrationHookFromDto(dto);
    return { registered: true, hookName: dto.name, phase: dto.phase };
  }

  @Get("hooks/:moduleKey")
  @ApiOperation({ summary: "List registered migration hooks for a module" })
  @ApiParam({ name: "moduleKey", description: "Module identifier" })
  async listHooks(@Param("moduleKey") moduleKey: string) {
    const hooks = this.upgradeabilityService
      .getRegisteredHooks(moduleKey)
      .map((h) => ({ name: h.name, phase: h.phase }));
    return { hooks };
  }

  // ---------------------------------------------------------------------------
  // Upgrade lifecycle
  // ---------------------------------------------------------------------------

  @Post("plan")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Plan an upgrade",
    description:
      "Creates a PENDING upgrade record and runs pre-flight checks. Execute the upgrade separately after planning.",
  })
  @ApiResponse({ status: 201, description: "Upgrade plan created" })
  async plan(@Body() dto: PlanUpgradeDto) {
    return { upgrade: await this.upgradeabilityService.plan(dto) };
  }

  @Post("execute")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Execute a planned upgrade",
    description:
      "Runs migration hooks, switches the active implementation, and records the outcome. Fails if the upgrade is already in progress.",
  })
  @ApiResponse({ status: 200, description: "Upgrade completed" })
  @ApiResponse({ status: 409, description: "Upgrade already in progress" })
  async execute(@Body() dto: ExecuteUpgradeDto) {
    return { result: await this.upgradeabilityService.execute(dto) };
  }

  @Post("rollback")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Rollback to a previous implementation version",
    description:
      "Switches the active implementation back and records a ROLLED_BACK upgrade.",
  })
  @ApiResponse({ status: 200, description: "Rollback completed" })
  async rollback(@Body() dto: RollbackUpgradeDto) {
    return { result: await this.upgradeabilityService.rollback(dto) };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  @Get("upgrades")
  @ApiOperation({ summary: "Query upgrade records" })
  @ApiQuery({ name: "moduleKey", required: false })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async queryUpgrades(@Query() query: QueryUpgradesDto) {
    return { upgrades: await this.upgradeabilityService.queryUpgrades(query) };
  }

  @Get("upgrades/:id")
  @ApiOperation({ summary: "Get a single upgrade record" })
  @ApiParam({ name: "id", description: "Upgrade record UUID" })
  async getUpgrade(@Param("id", ParseUUIDPipe) id: string) {
    return { upgrade: await this.upgradeabilityService.getUpgrade(id) };
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  @Get("snapshot/:moduleKey")
  @ApiOperation({
    summary: "Snapshot the current implementation state for a module",
    description:
      "Returns the active implementation metadata and is useful before an upgrade to support rollback decisions.",
  })
  @ApiParam({ name: "moduleKey", description: "Module identifier" })
  async snapshot(@Param("moduleKey") moduleKey: string) {
    return { snapshot: await this.upgradeabilityService.snapshot(moduleKey) };
  }

  // ---------------------------------------------------------------------------
  // Testing utilities
  // ---------------------------------------------------------------------------

  @Post("simulate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Simulate an upgrade without side effects",
    description:
      "Dry-runs the upgrade pipeline and returns the expected outcome. Set persist=true to store the simulation result.",
  })
  @ApiResponse({ status: 200, description: "Simulation result" })
  async simulate(@Body() dto: SimulateUpgradeDto) {
    return { result: await this.upgradeabilityService.simulateUpgrade(dto) };
  }

  @Post("simulate/batch")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Simulate a batch of upgrades sequentially",
    description:
      "Runs each upgrade through the simulation pipeline and returns all results.",
  })
  @ApiResponse({ status: 200, description: "Batch simulation results" })
  async simulateBatch(@Body() dto: SimulateBatchDto) {
    return { results: await this.upgradeabilityService.simulateBatch(dto) };
  }
}
