// Role names from the Supabase enum `app_role`: admin, manager, employee, viewer.
export const ROLES = {
  ADMIN: "admin",
  MANAGER: "manager",
  EMPLOYEE: "employee",
  VIEWER: "viewer",
};

// Roles that can open the Admin page no matter what.
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.MANAGER];

// Admin page = managers/admins, plus employees who are handing over
// (they are the `departing_employee` on at least one handover).
// New employees taking over are never allowed in.
export function canAccessAdmin(role, isDeparting = false) {
  return ADMIN_ROLES.includes(role) || isDeparting;
}
