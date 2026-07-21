import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Role, normalizeRole } from "src/common/guard/roles.enum";

@Injectable()
export class ComplianceOfficerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("No authenticated user found");
    }

    // KYC operators are the compliance officers; admins also have access.
    // Coerce legacy lowercase claims to the canonical Role before comparing.
    const role = normalizeRole(user.role);
    if (role !== Role.ADMIN && role !== Role.KYC_OPERATOR) {
      throw new ForbiddenException(
        "Access to audit logs is restricted to admin and compliance officers",
      );
    }

    return true;
  }
}