import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraintInterface,
  ValidatorConstraint,
} from "class-validator";

/**
 * RFC 5322 Compliant Email Regular Expression:
 * - Local-part allows dot-atom format (alphanumeric and !#$%&'*+/=?^_`{|}~-) without leading/trailing/consecutive dots.
 * - Max local-part length: 64 characters.
 * - Domain part requires valid labels (letters, digits, hyphens) separated by single dots.
 * - Max total email length: 254 characters.
 */
const RFC_5322_EMAIL_REGEX =
  /^(?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*)@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

@ValidatorConstraint({ name: "isRfcEmail", async: false })
export class IsRfcEmailConstraint implements ValidatorConstraintInterface {
  validate(value: any): boolean {
    if (typeof value !== "string") {
      return false;
    }
    if (value.length > 254) {
      return false;
    }
    const parts = value.split("@");
    if (parts.length !== 2) {
      return false;
    }
    const [local, domain] = parts;
    if (local.length === 0 || local.length > 64 || domain.length === 0) {
      return false;
    }
    return RFC_5322_EMAIL_REGEX.test(value);
  }

  defaultMessage(): string {
    return "email must be a valid RFC 5322 compliant email address";
  }
}

/**
 * Custom decorator for validating email addresses according to strict RFC 5322 specifications.
 */
export function IsRfcEmail(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsRfcEmailConstraint,
    });
  };
}
