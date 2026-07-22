import { validate } from "class-validator";
import { IsRfcEmail } from "./is-rfc-email.decorator";

class TestUserEmailDto {
  @IsRfcEmail()
  email!: string;
}

describe("IsRfcEmail Decorator", () => {
  it("should validate valid RFC 5322 email addresses", async () => {
    const validEmails = [
      "user@example.com",
      "user.name+tag@example.co.uk",
      "user_name@sub.domain.org",
      "user-name123@domain.io",
      "disposable.style.email.with+symbol@example.com",
    ];

    for (const email of validEmails) {
      const dto = new TestUserEmailDto();
      dto.email = email;
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it("should reject invalid email addresses", async () => {
    const invalidEmails = [
      "",
      "plainaddress",
      "@no-local.com",
      "no-at-sign.com",
      "user@.com",
      "user@domain..com",
      ".user@example.com",
      "user.@example.com",
      "user..name@example.com",
      "a".repeat(65) + "@example.com",
      "user@" + "a".repeat(250) + ".com",
      12345 as any,
      null as any,
      undefined as any,
    ];

    for (const email of invalidEmails) {
      const dto = new TestUserEmailDto();
      dto.email = email;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("email");
    }
  });
});
