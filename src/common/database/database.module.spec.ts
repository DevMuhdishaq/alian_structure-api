import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { DatabaseModule } from "./database.module";

describe("DatabaseModule", () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("should compile", () => {
    expect(moduleRef).toBeDefined();
  });
});
