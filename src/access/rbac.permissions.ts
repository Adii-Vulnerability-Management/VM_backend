import { MODULE_ROLE_PERMISSIONS } from '../auth/rbac/roles-permissions';

function normalizePermission(moduleKey: string, perm: string): string {
  const p = String(perm || '').trim();
  if (!p) return '';
  if (p.startsWith(moduleKey + '.')) return p;
  return `${moduleKey}.${p}`;
}

export const ALL_PERMISSION_KEYS: string[] = (() => {
  const set = new Set<string>();

  for (const mod of MODULE_ROLE_PERMISSIONS.modules) {
    // Role-based permissions
    for (const roleName of Object.keys(mod.roles || {})) {
      for (const raw of (mod.roles as any)[roleName] as string[]) {
        const full = normalizePermission(mod.key, raw);
        if (full) set.add(full);
      }
    }

    // Scoped/custom module permissions
    for (const scope of Object.keys((mod as any).permissions || {})) {
      for (const action of (mod as any).permissions[scope] as string[]) {
        set.add(`${mod.key}.${scope}.${action}`);
      }
    }
  }

  set.add('access.vendor_login.view');
  set.add('access.client_login.view');

  return [...set].sort();
})();

export type ModuleKey = (typeof MODULE_ROLE_PERMISSIONS.modules)[number]['key'];
