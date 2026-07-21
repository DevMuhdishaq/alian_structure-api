import { RoleSeederService } from "./role-seeder.service";
import { Role } from "src/common/guard/roles.enum";

describe("RoleSeederService", () => {
  const makeService = (
    config: Record<string, string | undefined>,
    repo: {
      findOne: jest.Mock;
      save: jest.Mock;
    },
  ): RoleSeederService =>
    new RoleSeederService(
      { get: (k: string) => config[k] } as never,
      repo as never,
    );

  const makeRepo = () => ({
    findOne: jest.fn(),
    save: jest.fn(async (u) => u),
  });

  it("is a no-op when no bootstrap target is configured", async () => {
    const repo = makeRepo();
    const service = makeService({}, repo);
    await service.seedBootstrapAdmin();
    expect(repo.findOne).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("does not create a user when the configured target does not exist", async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue(null);
    const service = makeService({ ADMIN_BOOTSTRAP_EMAIL: "a@b.com" }, repo);
    await service.seedBootstrapAdmin();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("promotes an existing non-admin user to ADMIN", async () => {
    const repo = makeRepo();
    const user = { id: "u1", role: Role.USER };
    repo.findOne.mockResolvedValue(user);
    const service = makeService({ ADMIN_BOOTSTRAP_EMAIL: "a@b.com" }, repo);
    await service.seedBootstrapAdmin();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.ADMIN }),
    );
  });

  it("is idempotent when the user is already ADMIN", async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue({ id: "u1", role: Role.ADMIN });
    const service = makeService({ ADMIN_BOOTSTRAP_WALLET: "0xabc" }, repo);
    await service.seedBootstrapAdmin();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
