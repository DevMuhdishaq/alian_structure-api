import { BadRequestException, ValidationPipe } from "@nestjs/common";
import {
  IsString,
  IsInt,
  IsOptional,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { createGlobalValidationPipe } from "./validation.pipe";
import { IsRfcEmail } from "../decorators/is-rfc-email.decorator";

class AddressDto {
  @IsString()
  street!: string;

  @IsString()
  city!: string;
}

class UserProfileDto {
  @IsString()
  name!: string;

  @IsRfcEmail()
  email!: string;

  @IsInt()
  @Min(18)
  age!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}

describe("createGlobalValidationPipe", () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = createGlobalValidationPipe();
  });

  it("should validate and transform valid payload into DTO instance", async () => {
    const rawPayload = {
      name: "John Doe",
      email: "john.doe@example.com",
      age: 25,
      address: {
        street: "123 Main St",
        city: "Metropolis",
      },
    };

    const transformed = (await pipe.transform(rawPayload, {
      type: "body",
      metatype: UserProfileDto,
    })) as UserProfileDto;

    expect(transformed).toBeInstanceOf(UserProfileDto);
    expect(transformed.name).toBe("John Doe");
    expect(transformed.email).toBe("john.doe@example.com");
    expect(transformed.age).toBe(25);
    expect(transformed.address).toBeInstanceOf(AddressDto);
    expect(transformed.address?.street).toBe("123 Main St");
  });

  it("should reject non-whitelisted properties with 400 Bad Request", async () => {
    const rawPayload = {
      name: "John Doe",
      email: "john.doe@example.com",
      age: 30,
      unallowedProperty: "hacked",
    };

    await expect(
      pipe.transform(rawPayload, {
        type: "body",
        metatype: UserProfileDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("should return detailed structured HTTP 400 Bad Request error payload for malformed data", async () => {
    const rawPayload = {
      name: "John Doe",
      email: "invalid-email-format",
      age: 15, // Below Min(18)
    };

    let caughtError: any;
    try {
      await pipe.transform(rawPayload, {
        type: "body",
        metatype: UserProfileDto,
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(BadRequestException);
    const response = (caughtError as BadRequestException).getResponse() as any;

    expect(response.statusCode).toBe(400);
    expect(response.error).toBe("Bad Request");
    expect(Array.isArray(response.message)).toBe(true);
    expect(Array.isArray(response.errors)).toBe(true);

    const emailError = response.errors.find((e: any) => e.field === "email");
    expect(emailError).toBeDefined();
    expect(emailError.messages.length).toBeGreaterThan(0);

    const ageError = response.errors.find((e: any) => e.field === "age");
    expect(ageError).toBeDefined();
  });

  it("should support recursive nested object validation (@ValidateNested)", async () => {
    const rawPayload = {
      name: "John Doe",
      email: "john@example.com",
      age: 30,
      address: {
        street: 12345, // Invalid type (should be string)
        city: "Metropolis",
      },
    };

    let caughtError: any;
    try {
      await pipe.transform(rawPayload, {
        type: "body",
        metatype: UserProfileDto,
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(BadRequestException);
    const response = (caughtError as BadRequestException).getResponse() as any;

    expect(response.statusCode).toBe(400);
    const addressError = response.errors.find(
      (e: any) => e.field === "address",
    );
    expect(addressError).toBeDefined();
    expect(addressError.children).toBeDefined();
    expect(addressError.children[0].field).toBe("street");
  });
});
