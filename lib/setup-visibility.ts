/** Reference data remains available without exposing the access directory or HR records. */
export function setupVisibility(permissions: readonly string[]) {
  const administration = permissions.includes('setup:write');
  return {
    users: administration,
    audit: administration,
    employees: administration || permissions.includes('hcm:read') || permissions.includes('payroll:read'),
  };
}
