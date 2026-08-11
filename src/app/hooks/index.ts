// Legacy RBAC hooks kept for the admin controller paths introduced in #59.
// Prefer RoleRequired / PermissionRequired for new code.
export { RequireRole, RequirePermission } from './rbac.hook';
export { JwtRequired } from './jwt-required.hook';
export { RoleRequired } from './role-required.hook';
export { Permission, PermissionRequired } from './permission-required.hook';
export { RateLimit } from './rate-limit.hook';
