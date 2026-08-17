/**
 * Returns the tenant id that TenantGuard has already validated and attached
 * to the request (req.tenantId / req.tenant_id). Controllers should use this
 * instead of re-reading client-supplied headers directly, since TenantGuard
 * is the single place that reconciles the authenticated user's tenant with
 * any x-tenant-id header and rejects mismatches.
 */
const DEFAULT_TENANT_ID = 'default';

export function getTrustedTenantId(req: any): string {
  const raw =
    req?.tenantId ??
    req?.tenant_id ??
    req?.user_data?.tenant_id ??
    req?.user_data?.tenantId;

  const value = Array.isArray(raw) ? raw[0] : raw;
  const tenantId = value != null ? String(value).trim() : '';

  // This backend slice is deployed single-tenant (no tenant-onboarding UI
  // wired up), so requests without an explicit tenant fall back to one
  // shared default tenant instead of hard-failing.
  return tenantId || DEFAULT_TENANT_ID;
}
