/**
 * Build structured user.modules[] entries from tenant entitlement fields.
 * Matches the shape produced by RbacService.assignRolesToUser.
 */

type CatalogModule = {
  key: string;
  submodules?: string[];
};

export type UserModuleAccessEntry = {
  moduleKey: string;
  permissions: string[];
  subModules: string[];
  startDate: Date | null;
  endDate: Date | null;
  note: string;
  createdAt: Date;
  updatedAt: Date;
};

function uniq(arr: string[]) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

export function groupSubModulesByModule(
  moduleKeys: string[],
  flatSubModules: string[],
  catalog: CatalogModule[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const flat = Array.isArray(flatSubModules) ? flatSubModules : [];
  const keys = Array.isArray(moduleKeys) ? moduleKeys : [];

  for (const moduleKey of keys) {
    const mod = catalog.find((m) => m.key === moduleKey);
    const available = new Set(
      (Array.isArray(mod?.submodules) ? mod.submodules : []).map((s) =>
        String(s || '').trim(),
      ),
    );
    const matched = flat.filter((s) => available.has(String(s || '').trim()));
    if (matched.length > 0) {
      out[moduleKey] = uniq(matched.map((s) => String(s).trim()));
    }
  }

  return out;
}

export function groupPermissionsByModule(
  moduleKeys: string[],
  permissionKeys: string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const keys = new Set(Array.isArray(moduleKeys) ? moduleKeys : []);

  for (const raw of Array.isArray(permissionKeys) ? permissionKeys : []) {
    const clean = String(raw || '')
      .replace(/"/g, '')
      .replace(/'/g, '')
      .trim();
    const parts = clean.split('.').filter(Boolean);
    if (parts.length < 2) continue;

    let moduleKey = parts[0];
    if (moduleKey.includes(',')) {
      moduleKey = moduleKey.split(',')[0].trim();
    }
    if (!keys.has(moduleKey)) continue;

    if (!out[moduleKey]) out[moduleKey] = [];
    out[moduleKey].push(clean);
  }

  for (const mk of Object.keys(out)) {
    out[mk] = uniq(out[mk]);
  }

  return out;
}

export function buildUserModulesFromEntitlement(
  moduleKeys: string[],
  permissionKeys: string[],
  flatSubModules: string[],
  catalog: CatalogModule[],
  note = '',
): UserModuleAccessEntry[] {
  const keys = uniq((moduleKeys || []).map((k) => String(k).trim()));
  const subModulesByModule = groupSubModulesByModule(
    keys,
    flatSubModules,
    catalog,
  );
  const permissionsByModule = groupPermissionsByModule(keys, permissionKeys);
  const now = new Date();

  return keys.map((moduleKey) => ({
    moduleKey,
    permissions: permissionsByModule[moduleKey] || [],
    subModules: subModulesByModule[moduleKey] || [],
    startDate: null,
    endDate: null,
    note,
    createdAt: now,
    updatedAt: now,
  }));
}

export function flattenSubModulesFromByModule(
  subModulesByModule: Record<string, string[]>,
): string[] {
  return uniq(Object.values(subModulesByModule || {}).flat());
}
