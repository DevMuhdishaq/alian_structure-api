import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { DatabaseConfigService } from "./database.config";

describe("DatabaseConfigService", () => {
  let service: DatabaseConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvVars: true })],
      providers: [DatabaseConfigService],
    }).compile();

    service = module.get<DatabaseConfigService>(DatabaseConfigService);
    jest.clearAllMocks();
  });

  describe("getConnectionOptions", () => {
    it("returns development config by default", () => {
      const config = service.getConnectionOptions();
      expect(config).toBeDefined();
      expect(config.pool).toBeDefined();
      expect(config.pool.max).toBeGreaterThan(0);
    });

    it("returns test config for test environment", () => {
      process.env.NODE_ENV = "test";
      const config = service.getConnectionOptions();
      expect(config.database).toBe(":memory:");
      process.env.NODE_ENV = "development";
    });
  });

  describe("getDataSourceOptions", () => {
    it("returns TypeORM DataSourceOptions", () => {
      const options = service.getDataSourceOptions();
      expect(options).toBeDefined();
      expect((options as any).pool).toBeDefined();
    });
  });
});
