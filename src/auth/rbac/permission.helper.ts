import { MODULE_ROLE_PERMISSIONS } from './roles-permissions';

type UserDoc = Record<string, any>;

function normalizePermission(moduleKey: string, perm: string): string {
  const p = String(perm || '').trim();
  if (!p) return '';
  // If caller already provided full key like "privacy.dashboard.view", keep as-is
  if (p.startsWith(moduleKey + '.')) return p;
  // Otherwise treat it as "resource.action" and prefix with module key
  return `${moduleKey}.${p}`;
}

export function flattenAllPermissions(): string[] {
  const s = new Set<string>();

  for (const m of MODULE_ROLE_PERMISSIONS.modules) {
    // Role permissions
    for (const roleName of Object.keys(m.roles || {})) {
      for (const raw of (m.roles as any)[roleName] as string[]) {
        const full = normalizePermission(m.key, raw);
        if (full) s.add(full);
      }
    }

    // Scoped permissions
    for (const scope of Object.keys((m as any).permissions || {})) {
      for (const action of (m as any).permissions[scope] as string[]) {
        s.add(`${m.key}.${scope}.${action}`);
      }
    }
  }

  s.add('access.vendor_login.view');
  s.add('access.client_login.view');

  return [...s].sort();
}

export function computeUserPermissions(user: UserDoc): string[] {
  // ✅ super admin => all permissions
  if (user?.is_superuser && user?.is_staff && user?.is_active) {
    return flattenAllPermissions();
  }

  // Optional per-user mapping like:
  // module_roles: { privacy:"viewer", security:"admin" }
  const moduleRoles = user?.module_roles || {};
  const extra = Array.isArray(user?.extra_permissions)
    ? (user.extra_permissions as string[])
    : [];

  const perms = new Set<string>(
    extra.map((p) => String(p || '').trim()).filter(Boolean),
  );

  for (const mod of MODULE_ROLE_PERMISSIONS.modules) {
    const role = moduleRoles?.[mod.key];
    if (!role) continue;

    const rolePerms = (mod.roles as any)[role] as string[] | undefined;
    if (!rolePerms) continue;

    rolePerms.forEach((p) => {
      const full = normalizePermission(mod.key, p);
      if (full) perms.add(full);
    });
  }

  return [...perms].sort();
}
