import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Role, normalizeRole } from "src/common/guard/roles.enum";

/**
 * Guard that ensures users can only access their own provenance records.
 * Admins can access all records.
 * Agents can access their own records.
 */
@Injectable()
export class ProvenanceAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("No authenticated user found");
    }

    // Admins can access all provenance records. Coerce legacy lowercase
    // claims to the canonical Role before comparing.
    if (normalizeRole(user.role) === Role.ADMIN) {
      return true;
    }

    // Check if accessing by userId param
    const userIdParam = request.params.userId;
    if (userIdParam) {
      // Users can only access their own records
      if (userIdParam !== user.id) {
        throw new ForbiddenException(
          "You can only access your own provenance records",
        );
      }
    }

    // Check query params for userId filter
    const queryUserId = request.query.userId;
    if (queryUserId && queryUserId !== user.id) {
      throw new ForbiddenException("You can only filter by your own user ID");
    }

    // For agent-specific endpoints, users can access if they have access to the agent
    // This assumes agent ownership is checked separately or agents are public
    return true;
  }
}



