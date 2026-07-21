import { Role, normalizeRole } from "./roles.enum";

describe("normalizeRole", () => {
  it("returns canonical roles unchanged", () => {
    expect(normalizeRole(Role.ADMIN)).toBe(Role.ADMIN);
    expect(normalizeRole(Role.KYC_OPERATOR)).toBe(Role.KYC_OPERATOR);
  });

  it("coerces legacy lowercase claims to the canonical UPPERCASE role", () => {
    expect(normalizeRole("admin")).toBe(Role.ADMIN);
    expect(normalizeRole("operator")).toBe(Role.OPERATOR);
    expect(normalizeRole("kyc_operator")).toBe(Role.KYC_OPERATOR);
    expect(normalizeRole("governance_operator")).toBe(Role.GOVERNANCE_OPERATOR);
    expect(normalizeRole("user")).toBe(Role.USER);
  });

  it("ignores surrounding whitespace and mixed casing", () => {
    expect(normalizeRole("  Admin  ")).toBe(Role.ADMIN);
    expect(normalizeRole("KyC_oPeRaToR")).toBe(Role.KYC_OPERATOR);
  });

  it("maps unknown, empty, null and undefined values to USER (read-only default)", () => {
    expect(normalizeRole("superuser")).toBe(Role.USER);
    expect(normalizeRole("")).toBe(Role.USER);
    expect(normalizeRole(null)).toBe(Role.USER);
    expect(normalizeRole(undefined)).toBe(Role.USER);
  });
});
