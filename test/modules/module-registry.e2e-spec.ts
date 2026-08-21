import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import request from "supertest";
import { DataSource } from "typeorm";
import { createGlobalValidationPipe } from "src/common/pipes/validation.pipe";
import { exampleGrantModuleEvents } from "src/modules/example-grant-module/example-grant-module.lifecycle";
import manifest from "src/modules/example-grant-module/module.manifest.json";
import { ModuleEntity } from "src/modules/registry/entities/module.entity";
import { TenantModuleState } from "src/modules/registry/entities/tenant-module-state.entity";
import { ModuleRegistryModule } from "src/modules/registry/module-registry.module";

describe("Module registry API (e2e)", () => {
  let app: INestApplication;
  let testingModule: TestingModule;

  beforeAll(async () => {
    testingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "sqlite",
          database: ":memory:",
          dropSchema: true,
          synchronize: true,
          entities: [ModuleEntity, TenantModuleState],
        }),
        ModuleRegistryModule,
      ],
    }).compile();

    app = testingModule.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(createGlobalValidationPipe());
    await app.init();
    exampleGrantModuleEvents.length = 0;
  });

  afterAll(async () => {
    await app.close();
    const dataSource = testingModule.get(DataSource);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    await testingModule.close();
  });

  it("registers, enables, upgrades, and disables the example module", async () => {
    const registrationBody = {
      manifest,
      description: "Example grant-funded module",
      author: "GrantFox example contributor",
    };

    const registered = await request(app.getHttpServer())
      .post("/api/v1/modules")
      .send(registrationBody)
      .expect(201);
    const moduleId = registered.body.module.id as string;
    expect(registered.body.module.version).toBe("0.1.0");
    expect(exampleGrantModuleEvents).toContain("installed");

    await request(app.getHttpServer())
      .post(`/api/v1/modules/${moduleId}/enable`)
      .send({ tenantId: "example-tenant", config: { plan: "grant" } })
      .expect(200)
      .expect(({ body }) => {
        expect(body.state.enabled).toBe(true);
        expect(body.state.tenantId).toBe("example-tenant");
      });

    await request(app.getHttpServer())
      .post("/api/v1/modules")
      .send({
        ...registrationBody,
        manifest: { ...manifest, version: "0.2.0" },
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.module.version).toBe("0.2.0");
      });
    expect(exampleGrantModuleEvents).toContain("upgraded:0.1.0->0.2.0");

    await request(app.getHttpServer())
      .post(`/api/v1/modules/${moduleId}/disable`)
      .send({ tenantId: "example-tenant" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.state.enabled).toBe(false);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/modules/${moduleId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.module.version).toBe("0.2.0");
        expect(body.module.tenantStates).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              tenantId: "example-tenant",
              enabled: false,
            }),
          ]),
        );
      });
  });
});
