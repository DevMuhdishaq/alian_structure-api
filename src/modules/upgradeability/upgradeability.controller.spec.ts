import { ROLES_KEY } from "src/common/guard/roles.decorator";
import { Role } from "src/common/guard/roles.enum";
import { SKIP_KYC_KEY } from "src/common/decorators/skip-kyc.decorator";
import { UpgradeabilityController } from "src/modules/upgradeability/upgradeability.controller";

describe("UpgradeabilityController access policy", () => {
  it("requires an administrator while bypassing the incompatible KYC claim guard", () => {
    expect(Reflect.getMetadata(ROLES_KEY, UpgradeabilityController)).toEqual([
      Role.ADMIN,
    ]);
    expect(
      Reflect.getMetadata(SKIP_KYC_KEY, UpgradeabilityController),
    ).toBe(true);
  });
});
