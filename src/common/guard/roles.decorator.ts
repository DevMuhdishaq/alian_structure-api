import { SetMetadata } from "@nestjs/common";
import { Role } from "./roles.enum";

export const ROLES_KEY = "roles";

/**
 * Decorator that assigns required roles to a route handler.
 * Used together with RolesGuard to enforce role-based access control.
 *
 * @example
 * @Roles(Role.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Get('admin/dashboard')
 * getAdminDashboard() { ... }
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Declare the minimum role required to call a controller method or class.
 * Alias for @Roles() for consistency with RBAC terminology.
 *
 * @example
 * @RequireRole(Role.ADMIN)
 * @Delete(':id')
 * remove() { ... }
 */
export const RequireRole = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);



