export type UserRole = "admin" | "sales" | "viewer";

export const ALL_ROLES: UserRole[] = ["admin", "sales", "viewer"];
export const EDITOR_ROLES: UserRole[] = ["admin", "sales"];

export function isUserRole(role: string): role is UserRole {
  return ALL_ROLES.includes(role as UserRole);
}

export function hasRole(role: string, allowedRoles: readonly UserRole[]): boolean {
  return isUserRole(role) && allowedRoles.includes(role);
}

export function canManageCrmData(role: string): boolean {
  return hasRole(role, EDITOR_ROLES);
}

export function isAdministrator(role: string): boolean {
  return role === "admin";
}
