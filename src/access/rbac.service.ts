// ✅ FILE: backend/src/access/rbac.service.ts

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';

import bcrypt from 'bcrypt';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

import { ALL_PERMISSION_KEYS, ModuleKey } from './rbac.permissions';
import { Permission } from './schemas/permission.schema';
import { MODULE_ROLE_PERMISSIONS } from '../auth/rbac/roles-permissions';
import { AccessRole } from './schemas/role.schema';
import {
  UserAccessAssignment,
  UserAccessAssignmentDocument,
} from './schemas/user-access-assignment.schema';
import { AssignAccessDto } from './dto/assign-access.dto';
import { AccessLog, AccessLogDocument } from './schemas/access-log.schema';
import {
  TenantRegistry,
  TenantRegistryDocument,
} from './schemas/tenant-registry.schema';

type UserDoc = Record<string, any>;

function normalizePermission(moduleKey: string, perm: string): string {
  const p = String(perm || '').trim();
  if (!p) return '';
  if (p.startsWith(moduleKey + '.')) return p;
  return `${moduleKey}.${p}`;
}

function escapeRegex(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ROLE_DEFAULT_PERMISSION_KEYS: Record<string, string[]> = {
  TPRM_VENDOR: ['access.vendor_login.view'],
  TPRM_CLIENT_REVIEWER: ['access.client_login.view'],
  TPRM_VENDOR_LEAD_RESPONDER: ['access.vendor_login.view'],
};

const FULL_ACCESS_ROLES = new Set(['SUPER_ADMIN']);

@Injectable()
export class RbacService {
  constructor(
    @InjectConnection() private readonly mongo: mongoose.Connection,
    @InjectModel(Permission.name) private readonly permModel: Model<Permission>,
    @InjectModel(AccessRole.name) private readonly roleModel: Model<AccessRole>,
    @InjectModel(UserAccessAssignment.name)
    private readonly assignmentModel: Model<UserAccessAssignmentDocument>,
    @InjectModel(AccessLog.name)
    private readonly accessLogModel: Model<AccessLogDocument>,
    @InjectModel(TenantRegistry.name)
    private readonly tenantModel: Model<TenantRegistryDocument>,
  ) {}

  private uniq(arr: string[]) {
    return Array.from(new Set((arr || []).filter(Boolean)));
  }

  private capitalize(s: string) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  private prettyRoleName(roleKey: string) {
    const r = String(roleKey || '').trim();
    if (!r) return '';
    return this.capitalize(r);
  }

  private normalizeRoleKey(name: any): string {
    return String(name || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  private denormalizeRoleName(roleKeyLike: any): string {
    const raw = String(roleKeyLike || '').trim();
    if (!raw) return '';
    const spaced = raw.replace(/_/g, ' ').toLowerCase();
    return spaced
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private roleNameVariants(inputRole: any): string[] {
    const raw = String(inputRole || '').trim();
    if (!raw) return [];

    const key = this.normalizeRoleKey(raw);
    const pretty = this.denormalizeRoleName(raw);
    const prettyFromKey = this.denormalizeRoleName(key);
    const prettyTPRM = pretty.replace(/^Tprm\b/, 'TPRM');
    const prettyFromKeyTPRM = prettyFromKey.replace(/^Tprm\b/, 'TPRM');
    const spacedUpper = raw.replace(/_/g, ' ');

    return this.uniq([
      raw,
      key,
      pretty,
      prettyFromKey,
      prettyTPRM,
      prettyFromKeyTPRM,
      spacedUpper,
    ]).filter(Boolean);
  }

  private normalizeEmail(v: any): string {
    return v ? String(v).trim().toLowerCase() : '';
  }

  private isPlatformSuper(u: any): boolean {
    return (
      u?.is_superuser === true && u?.is_staff === true && u?.is_active !== false
    );
  }

  /** Returns null when actor should not be tenant-scoped (platform super);
   *  otherwise returns the normalized tenant id to filter by. */
  private tenantScope(actor: any): string | null {
    if (!actor || this.isPlatformSuper(actor)) return null;
    const t = actor?.tenant_id ?? actor?.tenantId;
    if (t == null || String(t).trim() === '') return null;
    return String(t).trim().replace(/\s+/g, '-');
  }

  private async tenantEntitlement(actor?: any): Promise<{
    tenantId: string;
    moduleKeys: string[];
    subModules: string[];
    permissions: string[];
  } | null> {
    const tenantId = this.tenantScope(actor);
    if (!tenantId) return null;

    const tenant = await this.tenantModel
      .findOne({ tenantId })
      .select({
        enabledModuleKeys: 1,
        enabledSubModules: 1,
        enabledPermissions: 1,
      })
      .lean();

    const moduleKeys = Array.isArray(tenant?.enabledModuleKeys)
      ? tenant.enabledModuleKeys.map((m) => String(m).trim()).filter(Boolean)
      : [];
    const subModules = Array.isArray((tenant as any)?.enabledSubModules)
      ? (tenant as any).enabledSubModules
          .map((s: any) => String(s).trim())
          .filter(Boolean)
      : [];
    const permissions = Array.isArray((tenant as any)?.enabledPermissions)
      ? (tenant as any).enabledPermissions
          .map((p: any) => String(p).trim())
          .filter(Boolean)
      : this.allPermissionKeysForModules(moduleKeys);

    return { tenantId, moduleKeys, subModules, permissions };
  }

  private allPermissionKeysForModules(moduleKeys: string[]): string[] {
    const enabled = new Set((moduleKeys || []).filter(Boolean));
    const out: string[] = [];
    for (const mod of MODULE_ROLE_PERMISSIONS.modules as unknown as any[]) {
      if (!enabled.has(mod.key)) continue;
      const actions = new Set<string>();
      Object.values(mod.roles || {}).forEach((v: any) => {
        if (Array.isArray(v)) v.forEach((a) => actions.add(a));
      });
      Object.entries(mod.permissions || {}).forEach(
        ([resource, v]: [string, any]) => {
          if (Array.isArray(v)) {
            v.forEach((a) => actions.add(`${resource}.${a}`));
          }
        },
      );
      actions.forEach((a) => out.push(`${mod.key}.${a}`));
    }
    return Array.from(new Set(out));
  }

  private filterCatalogModules(modules: any[], permissionKeys: Set<string>) {
    return modules.map((m: any) => {
      const filterActions = (actions: any[]) =>
        (Array.isArray(actions) ? actions : []).filter((a) =>
          permissionKeys.has(`${m.key}.${a}`),
        );
      const roles = Object.fromEntries(
        Object.entries(m.roles || {})
          .map(([role, actions]: [string, any]) => [
            role,
            filterActions(actions),
          ])
          .filter(([, actions]: [string, any]) => actions.length > 0),
      );
      const permissions = m.permissions
        ? Object.fromEntries(
            Object.entries(m.permissions || {})
              .map(([resource, actions]: [string, any]) => [
                resource,
                filterActions(actions),
              ])
              .filter(([, actions]: [string, any]) => actions.length > 0),
          )
        : undefined;
      return { ...m, roles, ...(permissions ? { permissions } : {}) };
    });
  }

  async getCatalogForActor(actor?: any) {
    const entitlement = await this.tenantEntitlement(actor);
    const allowedModules = entitlement ? new Set(entitlement.moduleKeys) : null;
    let modules = (MODULE_ROLE_PERMISSIONS.modules || []).filter((m: any) =>
      allowedModules ? allowedModules.has(String(m?.key || '').trim()) : true,
    );
    if (entitlement) {
      modules = this.filterCatalogModules(
        modules,
        new Set(entitlement.permissions),
      );
      if (entitlement.subModules.length > 0) {
        const allowedSubModules = new Set(entitlement.subModules);
        modules = modules.map((module: any) => ({
          ...module,
          submodules: (Array.isArray(module?.submodules)
            ? module.submodules
            : []
          ).filter((submodule: string) => allowedSubModules.has(submodule)),
        }));
      }
    }

    return { modules };
  }

  private async roleScopeQuery(actor?: any, name?: string) {
    const entitlement = await this.tenantEntitlement(actor);
    const q: any = {};
    if (name) q.name = name;
    q.tenantId = entitlement ? entitlement.tenantId : null;
    return { q, entitlement };
  }

  private assertTenantRoleAllowed(
    entitlement: { moduleKeys: string[]; permissions: string[] } | null,
    moduleKey: string,
    permissions: string[],
  ) {
    if (!entitlement) return;
    if (!entitlement.moduleKeys.includes(moduleKey)) {
      throw new BadRequestException(
        `Module ${moduleKey} is not enabled for this tenant`,
      );
    }
    const allowed = new Set(entitlement.permissions);
    const invalid = permissions.filter((p) => !allowed.has(p));
    if (invalid.length) {
      throw new BadRequestException(
        `Permission(s) not enabled for this tenant: ${invalid.join(', ')}`,
      );
    }
  }

  private userTenantId(user: any): string {
    return String(user?.tenant_id ?? user?.tenantId ?? '')
      .trim()
      .replace(/\s+/g, '-');
  }

  private assertTargetUserAllowed(actor: any, user: any) {
    const tenant = this.tenantScope(actor);
    if (!tenant) return;
    if (this.userTenantId(user) !== tenant) {
      throw new BadRequestException('Target user is not in your tenant');
    }
  }

  private resolveEmailFromUser(user: UserDoc): string {
    return this.normalizeEmail(user?.email || user?.user_email || '');
  }

  private roleSchemaHasRoleKey(): boolean {
    const anyModel: any = this.roleModel as any;
    const paths = anyModel?.schema?.paths || {};
    return !!paths?.roleKey;
  }

  private async findRoleDocsForRoles(
    roles: string[],
    tenantId?: string | null,
  ) {
    const expanded = this.uniq(
      (roles || []).flatMap((r) => this.roleNameVariants(r)),
    );

    if (expanded.length === 0) return [];

    const roleKeys = expanded.map((r) => this.normalizeRoleKey(r));

    const ors: any[] = [
      { name: { $in: expanded } },
      { name: { $in: roleKeys } },
      ...expanded.map((name) => ({
        name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      })),
      ...roleKeys.map((name) => ({
        name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      })),
    ];

    if (this.roleSchemaHasRoleKey()) {
      ors.unshift({ roleKey: { $in: roleKeys } });
    }

    const roleDocs: any[] = await this.roleModel
      .find({
        $or: ors,
        ...(tenantId !== undefined ? { tenantId } : {}),
      })
      .select({
        name: 1,
        tenantId: 1,
        module: 1,
        permissions: 1,
        subModules: 1,
        startDate: 1,
        endDate: 1,
        ...(this.roleSchemaHasRoleKey() ? { roleKey: 1 } : {}),
      })
      .lean();

    return roleDocs || [];
  }

  private async resolveModulesForUser(user: UserDoc): Promise<string[]> {
    const roles: string[] = Array.isArray(user?.roles) ? user.roles : [];
    const storedModules: string[] = Array.isArray(user?.modules)
      ? user.modules
          .map((m: any) =>
            String(typeof m === 'string' ? m : m?.moduleKey || m?.key || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
      : [];

    if (!roles.length) return this.uniq(storedModules);

    const roleDocs = await this.findRoleDocsForRoles(
      roles,
      this.userTenantId(user) || null,
    );
    const modulesFromRoles = roleDocs
      .map((r: any) => String(r?.module || '').trim())
      .filter(Boolean);

    // Preserve explicitly stored module assignments (tenant-enabled modules/user modules)
    // while still deriving role-based modules.
    return this.uniq(
      [...modulesFromRoles, ...storedModules].map((m) =>
        String(m || '')
          .trim()
          .toLowerCase(),
      ),
    );
  }

  private computePermissionKeysFromRoleDocs(roleDocs: any[]) {
    const fromRoles = (roleDocs || []).flatMap((r: any) =>
      Array.isArray(r?.permissions) ? r.permissions : [],
    );
    return this.uniq(fromRoles || []);
  }

  private flattenPermissionsPayload(moduleKey: string, payload: any): string[] {
    if (!payload) return [];

    if (Array.isArray(payload)) {
      return payload
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .map((p) => normalizePermission(moduleKey, p))
        .filter(Boolean);
    }

    if (typeof payload === 'object') {
      const grouped = payload as Record<string, any>;
      const out: string[] = [];
      for (const resource of Object.keys(grouped)) {
        const actions = Array.isArray(grouped[resource])
          ? grouped[resource]
          : [];
        for (const action of actions) {
          const a = String(action || '').trim();
          if (!a) continue;
          out.push(`${moduleKey}.${resource}.${a}`);
        }
      }
      return out.map((p) => normalizePermission(moduleKey, p)).filter(Boolean);
    }

    return [];
  }

  private computeDefaultPermissionKeysForRoles(normalizedRoles: string[]) {
    const roles = Array.isArray(normalizedRoles) ? normalizedRoles : [];
    const perms = roles.flatMap((r) => ROLE_DEFAULT_PERMISSION_KEYS[r] || []);
    return this.uniq(perms);
  }

  private async createAccessLog(body: any) {
    try {
      const userEmail = this.normalizeEmail(
        body?.userEmail || body?.email || '',
      );
      const action = String(body?.action || '')
        .trim()
        .toUpperCase();

      const oldRoles = Array.isArray(body?.oldRoles) ? body.oldRoles : [];
      const newRoles = Array.isArray(body?.newRoles) ? body.newRoles : [];
      const oldModules = Array.isArray(body?.oldModules) ? body.oldModules : [];
      const newModules = Array.isArray(body?.newModules) ? body.newModules : [];
      const oldPermissionKeys = Array.isArray(body?.oldPermissionKeys)
        ? body.oldPermissionKeys
        : [];
      const newPermissionKeys = Array.isArray(body?.newPermissionKeys)
        ? body.newPermissionKeys
        : [];

      const note = typeof body?.note === 'string' ? body.note : '';
      const performedBy = this.normalizeEmail(
        body?.performedBy || body?.updatedBy || body?.assignedBy || '',
      );
      const loginAt = body?.loginAt ? new Date(body.loginAt) : undefined;
      const updatedAt = body?.updatedAt ? new Date(body.updatedAt) : new Date();

      const filter: any = {
        userEmail,
        action,
      };

      await this.accessLogModel.findOneAndUpdate(
        filter,
        {
          $set: {
            userEmail,
            userId: body?.userId,
            action,
            oldRoles,
            newRoles,
            oldModules,
            newModules,
            oldPermissionKeys,
            newPermissionKeys,
            note,
            performedBy,
            loginAt,
            updatedAt,
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
        },
      );
    } catch (e: any) {
      console.error('ACCESS LOG WRITE FAILED:', e?.message || e);
    }
  }

  async getAccessLogs(
    filter?: { email?: string; action?: string },
    actor?: any,
  ) {
    const tenant = this.tenantScope(actor);
    const email = this.normalizeEmail(filter?.email);
    const action = filter?.action
      ? String(filter.action).trim().toUpperCase()
      : undefined;

    if (!tenant) {
      const q: any = {};
      if (email) q.userEmail = email;
      if (action) q.action = action;
      const data = await this.accessLogModel
        .find(q)
        .sort({ createdAt: -1 })
        .lean();
      return { data };
    }

    const match: any = {};
    if (email) match.userEmail = email;
    if (action) match.action = action;

    const data = await this.accessLogModel.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'users',
          let: { email: '$userEmail' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$email', '$$email'] },
                    { $eq: ['$user_email', '$$email'] },
                  ],
                },
              },
            },
            { $project: { tenant_id: 1, tenantId: 1 } },
          ],
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $expr: {
            $eq: [{ $ifNull: ['$user.tenant_id', '$user.tenantId'] }, tenant],
          },
        },
      },
      { $project: { user: 0 } },
    ]);

    return { data };
  }

  async getUserAccessSummary(
    body: { email?: string; user_id?: number },
    actor?: any,
  ) {
    const email = this.normalizeEmail(body?.email);
    const userId = body?.user_id;

    const q =
      typeof userId === 'number'
        ? { user_id: userId }
        : { $or: [{ email }, { user_email: email }] };

    const user = await this.mongo.collection('users').findOne(q);
    if (!user) throw new Error('User not found');
    this.assertTargetUserAllowed(actor, user);

    const resolvedEmail = this.resolveEmailFromUser(user);
    const latestAssignment = await this.assignmentModel
      .findOne({ userEmail: resolvedEmail })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    return {
      user: {
        _id: user?._id,
        user_id: user?.user_id,
        name: user?.name || user?.user_name || user?.first_name || '',
        email: resolvedEmail,
        contact: user?.contactNumber,
        isActive: user?.is_active,
      },
      access: {
        roles: Array.isArray(user?.roles) ? user.roles : [],
        modules: Array.isArray(user?.modules) ? user.modules : [],
        permissionKeys: Array.isArray(user?.permissionKeys)
          ? user.permissionKeys
          : [],
        rolesAssignedAt: user?.rolesAssignedAt || null,
        lastUpdatedAt: user?.lastUpdatedAt || user?.updatedAt || null,
        lastUpdatedBy: user?.lastUpdatedBy || user?.updatedBy || null,
        lastLoginAt: user?.lastLoginAt || null,
      },
      latestAssignment,
    };
  }

  async recordUserLogin(
    body: {
      email?: string;
      user_id?: number;
      loginAt?: string | Date;
    },
    actor?: any,
  ) {
    const email = this.normalizeEmail(body?.email);
    const userId = body?.user_id;
    const loginAt = body?.loginAt ? new Date(body.loginAt) : new Date();

    const q =
      typeof userId === 'number'
        ? { user_id: userId }
        : { $or: [{ email }, { user_email: email }] };

    const user = await this.mongo.collection('users').findOne(q);
    if (!user) throw new Error('User not found');
    this.assertTargetUserAllowed(actor, user);

    const resolvedEmail = this.resolveEmailFromUser(user);

    await this.mongo.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          lastLoginAt: loginAt,
          lastUpdatedAt: new Date(),
        },
      },
    );

    await this.assignmentModel.updateMany(
      { userEmail: resolvedEmail },
      { $set: { lastLoginAt: loginAt, updatedAt: new Date() } },
    );

    await this.createAccessLog({
      userEmail: resolvedEmail,
      userId: user?.user_id,
      action: 'LOGIN',
      loginAt,
      updatedAt: new Date(),
    });

    return {
      message: 'Login time recorded successfully',
      userEmail: resolvedEmail,
      loginAt,
    };
  }

  private generateRandomPassword(length = 12) {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < length; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  }

  private formatAccessSummary(permissionKeys: string[]) {
    const keys = Array.isArray(permissionKeys) ? permissionKeys : [];

    if (keys.includes('*')) {
      return `- Full access: *`;
    }

    const grouped: Record<string, Record<string, Set<string>>> = {};

    for (const key of keys) {
      const raw = String(key || '').trim();
      if (!raw) continue;

      const parts = raw.split('.').filter(Boolean);

      let moduleKey = 'unknown';
      let resource = 'general';
      let action = 'unknown';

      if (parts.length === 2) {
        moduleKey = parts[0];
        action = parts[1];
      } else if (parts.length >= 3) {
        moduleKey = parts[0];
        resource = parts[1];
        action = parts[2];
      } else if (parts.length === 1) {
        moduleKey = parts[0];
        action = '*';
      }

      if (!grouped[moduleKey]) grouped[moduleKey] = {};
      if (!grouped[moduleKey][resource]) {
        grouped[moduleKey][resource] = new Set();
      }
      grouped[moduleKey][resource].add(action);
    }

    const lines: string[] = [];
    const modules = Object.keys(grouped).sort();

    for (const mod of modules) {
      lines.push(`- ${mod}:`);
      const resources = Object.keys(grouped[mod]).sort();
      for (const res of resources) {
        const actions = Array.from(grouped[mod][res]).sort();
        if (res === 'general') {
          lines.push(`  - actions: ${actions.join(', ')}`);
        } else {
          lines.push(`  - ${res}: ${actions.join(', ')}`);
        }
      }
    }

    return lines.join('\n');
  }

  private getSesClient() {
    const region = process.env.AWS_SES_REGION || process.env.AWS_REGION;
    const accessKeyId =
      process.env.AWS_SES_ACCESS_KEY_ID ||
      process.env.SES_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.AWS_SES_SECRET_ACCESS_KEY ||
      process.env.SES_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken =
      process.env.AWS_SES_SESSION_TOKEN ||
      process.env.AWS_SESSION_TOKEN ||
      process.env.AWS_SECURITY_TOKEN;

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'Missing AWS SES env: AWS_REGION/AWS_SES_REGION, AWS_ACCESS_KEY_ID/AWS_SES_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY/AWS_SES_SECRET_ACCESS_KEY',
      );
    }

    return new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    });
  }

  private async sendMail(to: string, subject: string, text: string) {
    const from =
      process.env.AWS_SES_FROM_EMAIL ||
      process.env.AWS_SES_SOURCE_EMAIL ||
      process.env.SES_SOURCE_EMAIL ||
      process.env.SES_FROM_ADDRESS;
    // console.log('[SES DEBUG]', {
    //   to,
    //   from,
    //   region: process.env.AWS_SES_REGION || process.env.AWS_REGION,
    //   hasAccessKey: !!(
    //     process.env.AWS_SES_ACCESS_KEY_ID ||
    //     process.env.SES_ACCESS_KEY_ID ||
    //     process.env.AWS_ACCESS_KEY_ID
    //   ),
    //   hasSecret: !!(
    //     process.env.AWS_SES_SECRET_ACCESS_KEY ||
    //     process.env.SES_SECRET_ACCESS_KEY ||
    //     process.env.AWS_SECRET_ACCESS_KEY
    //   ),
    //   hasSessionToken: !!(
    //     process.env.AWS_SES_SESSION_TOKEN ||
    //     process.env.AWS_SESSION_TOKEN ||
    //     process.env.AWS_SECURITY_TOKEN
    //   ),
    // });

    if (!from) {
      console.log('[MAIL SKIPPED] Missing AWS_SES_FROM_EMAIL');
      // console.log({ to, subject, text });
      return;
    }

    const client = this.getSesClient();
    const cmd = new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: text, Charset: 'UTF-8' } },
      },
    });

    try {
      await client.send(cmd);
      console.log('[SES SENT OK]');
    } catch (e) {
      console.error('SES send failed:', e);
      throw e;
    }
  }

  async isRbacSeeded(): Promise<boolean> {
    const c = await this.permModel.countDocuments();
    return c > 0;
  }

  private computeSubModulesFromPermissionKeys(permissionKeys: string[]) {
    const subModules: string[] = [];

    for (const key of permissionKeys || []) {
      const parts = String(key || '')
        .split('.')
        .filter(Boolean);

      // Example:
      // operations.finding_management.access
      // module = operations
      // submodule = finding_management
      // action = access
      if (parts.length >= 3) {
        subModules.push(parts[1]);
      }
    }

    return this.uniq(subModules);
  }

  private buildModuleAccessObjects(
    permissionKeys: string[],
    startDate: Date | null = null,
    endDate: Date | null = null,
    note = '',
    now = new Date(),
    fallbackSubModules: string[] = [],
  ) {
    const grouped: Record<
      string,
      {
        moduleKey: string;
        permissions: string[];
        subModules: string[];
        startDate: Date | null;
        endDate: Date | null;
        note: string;
        createdAt: Date;
        updatedAt: Date;
      }
    > = {};

    for (const key of permissionKeys || []) {
      const cleanKey = String(key || '')
        .replace(/"/g, '')
        .replace(/'/g, '')
        .trim();

      const parts = cleanKey.split('.').filter(Boolean);

      if (parts.length < 2) continue;

      let moduleKey = parts[0];

      // Handles bad key like: privacy, scanner.read
      if (moduleKey.includes(',')) {
        moduleKey = moduleKey.split(',')[0].trim();
      }

      if (!grouped[moduleKey]) {
        grouped[moduleKey] = {
          moduleKey,
          permissions: [],
          subModules: [],
          startDate,
          endDate,
          note,
          createdAt: now,
          updatedAt: now,
        };
      }

      grouped[moduleKey].permissions.push(cleanKey);

      if (parts.length >= 3) {
        grouped[moduleKey].subModules.push(parts[1]);
      }
    }

    return Object.values(grouped).map((module) => ({
      moduleKey: module.moduleKey,
      permissions: this.uniq(module.permissions),
      subModules: this.uniq([...module.subModules, ...fallbackSubModules]),
      startDate: module.startDate,
      endDate: module.endDate,
      note: module.note,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
    }));
  }

  async seedPermissionsIfMissing() {
    const existingCount = await this.permModel.countDocuments();
    if (existingCount > 0) return { seeded: false, count: existingCount };

    const docs = ALL_PERMISSION_KEYS.map((key) => {
      const [module, resource, action] = key.split('.', 3);
      return { key, module, resource, action, description: key };
    });

    await this.permModel.insertMany(docs, { ordered: false });
    return { seeded: true, count: docs.length };
  }

  async seedSystemRoles() {
    const allRoles: Array<{
      name: string;
      module: ModuleKey;
      permissions: string[];
    }> = [];

    for (const mod of MODULE_ROLE_PERMISSIONS.modules) {
      const moduleKey = mod.key as ModuleKey;

      for (const roleKey of Object.keys(mod.roles)) {
        const rawPerms = ((mod.roles as any)[roleKey] || []) as string[];

        const permissions = this.uniq(
          rawPerms
            .map((p) => normalizePermission(moduleKey, p))
            .filter(Boolean),
        );

        const name = `${this.capitalize(moduleKey)} ${this.prettyRoleName(
          roleKey,
        )}`;

        allRoles.push({ name, module: moduleKey, permissions });
      }
    }

    allRoles.push(
      { name: 'Admin', module: 'access' as ModuleKey, permissions: ['*'] },
      { name: 'Employee', module: 'access' as ModuleKey, permissions: ['*'] },
      {
        name: 'Super Admin',
        module: 'access' as ModuleKey,
        permissions: ['*'],
      },
      {
        name: 'TPRM Client Reviewer',
        module: 'access' as ModuleKey,
        permissions: ['access.client_login.view'],
      },
      {
        name: 'TPRM Vendor',
        module: 'access' as ModuleKey,
        permissions: ['access.vendor_login.view'],
      },
      {
        name: 'TPRM Vendor Lead Responder',
        module: 'access' as ModuleKey,
        permissions: ['access.vendor_login.view'],
      },
    );

    for (const r of allRoles) {
      const update: any = {
        module: r.module,
        permissions: this.uniq(r.permissions),
        isSystem: true,
        updatedAt: new Date(),
      };

      if (this.roleSchemaHasRoleKey()) {
        update.roleKey = this.normalizeRoleKey(r.name);
      }

      await this.roleModel.updateOne(
        { name: r.name },
        { $set: update, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
    }

    return { createdOrUpdated: allRoles.length };
  }

  async addRoleToUser(body: any) {
    const email = body?.email ? this.normalizeEmail(body.email) : null;
    const user_id = body?.user_id;
    const roleRaw = String(body?.role || '').trim();

    if (!roleRaw) throw new Error('role required');
    if (!user_id && !email) throw new Error('user_id or email required');

    const q =
      typeof user_id === 'number'
        ? { user_id }
        : { $or: [{ email }, { user_email: email }] };

    const normalizedRole = this.normalizeRoleKey(roleRaw);

    const r = await this.mongo.collection('users').updateOne(
      q,
      {
        $addToSet: { roles: normalizedRole },
        $set: { updatedAt: new Date() },
      },
      { upsert: false },
    );

    if (r.matchedCount === 0) throw new Error('User not found');

    const permissionKeys = await this.refreshUserPermissionCache(
      user_id ?? email,
    );
    return {
      message: 'Role added successfully',
      role: normalizedRole,
      permissionKeys,
    };
  }

  async getPermissions(module?: string, actor?: any) {
    const q: any = {};
    if (module) q.module = module;
    const entitlement = await this.tenantEntitlement(actor);
    if (entitlement) {
      if (module && !entitlement.moduleKeys.includes(module))
        return { data: [] };
      if (!module) q.module = { $in: entitlement.moduleKeys };
      q.key = { $in: entitlement.permissions };
    }
    const data = await this.permModel.find(q).sort({ key: 1 }).lean();
    return { data };
  }

  async getAllPermissions() {
    return this.permModel.find({}).sort({ key: 1 }).lean();
  }

  async getRoles(module?: string, actor?: any) {
    const q: any = {};
    const entitlement = await this.tenantEntitlement(actor);
    const enabled = entitlement?.moduleKeys || null;
    if (module && enabled && !enabled.includes(module)) return { data: [] };
    if (module) q.module = module;
    else if (enabled) q.module = { $in: enabled };
    if (entitlement) {
      q.tenantId = entitlement.tenantId;
    }
    const data = await this.roleModel.find(q).sort({ name: 1 }).lean();
    return { data };
  }

  async getRoleByName(name: string, actor?: any) {
    const { q } = await this.roleScopeQuery(actor, name);
    const role = await this.roleModel.findOne(q).lean();
    if (!role) throw new Error('Role not found');
    return role;
  }

  async createRole(body: any, actor?: any) {
    const name = String(body?.name || '').trim();
    const module = String(
      body?.module || body?.moduleKey || body?.key || '',
    ).trim();
    const permissionsPayload = body?.permissions;
    const subModules = Array.isArray(body?.subModules) ? body.subModules : []; // Handle sub-modules
    const startDateRaw = body?.startDate;
    const endDateRaw = body?.endDate;

    if (!name || !module) {
      throw new BadRequestException({
        message: 'Invalid data: name and module are required',
        received: {
          name: body?.name ?? null,
          module: body?.module ?? null,
          moduleKey: body?.moduleKey ?? null,
          key: body?.key ?? null,
        },
      });
    }

    const permissions = this.uniq(
      this.flattenPermissionsPayload(module, permissionsPayload),
    );
    const entitlement = await this.tenantEntitlement(actor);
    this.assertTenantRoleAllowed(entitlement, module, permissions);

    const tenantId = entitlement?.tenantId || null;
    const exists = await this.roleModel.findOne({ name, tenantId }).lean();
    if (exists) throw new Error('Role already exists');

    // Handle start and end dates
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (startDateRaw && endDateRaw) {
      startDate = new Date(startDateRaw);
      endDate = new Date(endDateRaw);

      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        throw new Error('Invalid startDate/endDate');
      }

      if (endDate <= startDate) {
        throw new Error('endDate must be after startDate');
      }
    }

    // Create the new role document
    const doc: any = {
      name,
      tenantId,
      module,
      permissions,
      subModules, // Add sub-modules here
      startDate, // Include start date
      endDate, // Include end date
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Normalize the role key if needed
    if (this.roleSchemaHasRoleKey()) {
      doc.roleKey = this.normalizeRoleKey(name);
    }

    // Add description if present
    if (typeof body?.description === 'string' && body.description.trim()) {
      doc.description = body.description.trim();
    }

    // Create the role document
    await this.roleModel.create(doc);
    return { message: 'Role created successfully' };
  }

  async updateRole(body: any) {
    const {
      roleId,
      name,
      module,
      permissions,
      subModules,
      startDate,
      endDate,
      description,
    } = body;

    if (!roleId) {
      throw new BadRequestException('Role ID is required');
    }

    const role = await this.roleModel.findById(roleId);
    if (!role) {
      throw new BadRequestException('Role not found');
    }

    // Normalize and validate data
    const normalizedName = String(name || '').trim();
    const normalizedModule = String(module || '').trim();

    if (!normalizedName || !normalizedModule) {
      throw new BadRequestException({
        message: 'Invalid data: name and module are required',
        received: { name, module },
      });
    }

    // Flatten and normalize permissions
    const flattenedPermissions = this.uniq(
      this.flattenPermissionsPayload(normalizedModule, permissions),
    );

    // Handle sub-modules, add sub-modules if provided
    const normalizedSubModules = Array.isArray(subModules) ? subModules : [];

    // Handle start date and end date
    let startDateObj: Date | null = null;
    let endDateObj: Date | null = null;

    if (startDate && endDate) {
      startDateObj = new Date(startDate);
      endDateObj = new Date(endDate);

      if (
        Number.isNaN(startDateObj.getTime()) ||
        Number.isNaN(endDateObj.getTime())
      ) {
        throw new Error('Invalid startDate/endDate');
      }

      if (endDateObj <= startDateObj) {
        throw new Error('endDate must be after startDate');
      }
    }

    // Prepare role update payload
    const updatePayload: any = {
      name: normalizedName,
      module: normalizedModule,
      permissions: flattenedPermissions,
      subModules: normalizedSubModules, // Ensure sub-modules are included
      startDate: startDateObj, // Set start date if provided
      endDate: endDateObj, // Set end date if provided
      updatedAt: new Date(),
    };

    // Optionally add description
    if (typeof description === 'string' && description.trim()) {
      updatePayload.description = description.trim();
    }

    // Update role with the new data
    const updatedRole = await this.roleModel.findByIdAndUpdate(
      roleId,
      { $set: updatePayload },
      { new: true }, // Return the updated document
    );

    return { message: 'Role updated successfully', role: updatedRole };
  }

  async updateRolePermissions(body: any, actor?: any) {
    const name = String(body?.name || '').trim();
    if (!name) throw new Error('Role name is required');

    const descriptionRaw = body?.description;

    const { q, entitlement } = await this.roleScopeQuery(actor, name);
    const role: any = await this.roleModel.findOne(q).lean();
    if (!role) throw new Error('Role not found');

    const moduleKey = String(role.module || '').trim();
    if (!moduleKey) throw new Error('Role module missing');

    const normalizedPerms = this.uniq(
      this.flattenPermissionsPayload(moduleKey, body?.permissions),
    );
    this.assertTenantRoleAllowed(entitlement, moduleKey, normalizedPerms);

    const normalizedSubModules = this.uniq(
      (Array.isArray(body?.subModules) ? body.subModules : [])
        .map((submodule) => String(submodule || '').trim())
        .filter(Boolean),
    );

    const update: any = {
      permissions: normalizedPerms,
      subModules: normalizedSubModules,
      updatedAt: new Date(),
    };

    if (this.roleSchemaHasRoleKey()) {
      update.roleKey = this.normalizeRoleKey(name);
    }

    if (descriptionRaw !== undefined) {
      update.description =
        typeof descriptionRaw === 'string'
          ? descriptionRaw
          : String(descriptionRaw);
    }

    const r = await this.roleModel.updateOne(q, { $set: update });
    if (r.matchedCount === 0) throw new Error('Role not found');

    return {
      message: 'Role updated successfully',
      role: name,
      permissionsCount: normalizedPerms.length,
    };
  }

  async addPermissions(body: any, actor?: any) {
    return this.addPermissionsToRole(body, actor);
  }

  async addPermissionsToRole(body: any, actor?: any) {
    const name = String(body?.name || '').trim();
    if (!name) throw new Error('Role name is required');

    const { q, entitlement } = await this.roleScopeQuery(actor, name);
    const role: any = await this.roleModel.findOne(q).lean();
    if (!role) throw new Error('Role not found');

    const moduleKey = String(role.module || '').trim();

    const permsToAdd = this.uniq(
      this.flattenPermissionsPayload(moduleKey, body?.permissions),
    );
    this.assertTenantRoleAllowed(entitlement, moduleKey, permsToAdd);

    const update: any = {
      $addToSet: { permissions: { $each: permsToAdd } },
      $set: { updatedAt: new Date() },
    };

    if (this.roleSchemaHasRoleKey()) {
      update.$set.roleKey = this.normalizeRoleKey(name);
    }

    const r = await this.roleModel.updateOne(q, update);
    if (r.matchedCount === 0) throw new Error('Role not found');
    return { message: 'Permissions added successfully' };
  }

  async removePermissions(body: any, actor?: any) {
    return this.removePermissionsFromRole(body, actor);
  }

  async removePermissionsFromRole(body: any, actor?: any) {
    const name = String(body?.name || '').trim();
    if (!name) throw new Error('Role name is required');

    const { q } = await this.roleScopeQuery(actor, name);
    const role: any = await this.roleModel.findOne(q).lean();
    if (!role) throw new Error('Role not found');

    const moduleKey = String(role.module || '').trim();

    const permsToRemove = this.uniq(
      this.flattenPermissionsPayload(moduleKey, body?.permissions),
    );

    const update: any = {
      $pull: { permissions: { $in: permsToRemove } },
      $set: { updatedAt: new Date() },
    };

    if (this.roleSchemaHasRoleKey()) {
      update.$set.roleKey = this.normalizeRoleKey(name);
    }

    const r = await this.roleModel.updateOne(q, update);
    if (r.matchedCount === 0) throw new Error('Role not found');
    return { message: 'Permissions removed successfully' };
  }

  async cloneRole(body: any, actor?: any) {
    const fromName = String(body?.fromName || '').trim();
    const toName = String(body?.toName || '').trim();

    if (!fromName || !toName) throw new Error('fromName/toName required');

    const { q: srcQ, entitlement } = await this.roleScopeQuery(actor, fromName);
    const src: any = await this.roleModel.findOne(srcQ).lean();
    if (!src) throw new Error('Source role not found');

    const tenantId = entitlement?.tenantId || null;
    const exists = await this.roleModel
      .findOne({ name: toName, tenantId })
      .lean();
    if (exists) throw new Error('Target role already exists');

    const cloneDoc: any = {
      name: toName,
      tenantId,
      module: src.module,
      permissions: this.uniq(src.permissions || []),
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.roleSchemaHasRoleKey()) {
      cloneDoc.roleKey = this.normalizeRoleKey(toName);
    }

    if (typeof src.description === 'string' && src.description.trim()) {
      cloneDoc.description = src.description.trim();
    }

    await this.roleModel.create(cloneDoc);
    return { message: 'Role cloned successfully' };
  }

  async deleteRole(nameOrBody: any, actor?: any) {
    const name =
      typeof nameOrBody === 'string'
        ? nameOrBody
        : String(nameOrBody?.name || '').trim();

    if (!name) throw new Error('Role name is required');

    const { q } = await this.roleScopeQuery(actor, name);
    const role: any = await this.roleModel.findOne(q).lean();
    if (!role) return { message: 'Role not found' };

    if (role.isSystem) throw new Error('System roles cannot be deleted');

    await this.roleModel.deleteOne(q);
    return { message: 'Role deleted successfully' };
  }

  async getRolesWithGroupedPermissions(actor?: any) {
    const roles: any[] = (await this.getRoles(undefined, actor)).data;

    return roles.map((role) => {
      const grouped: Record<string, string[]> = {};

      for (const perm of role.permissions || []) {
        const parts = String(perm).split('.');
        const resource = parts[1] || 'unknown';
        const action = parts[2] || 'unknown';

        if (!grouped[resource]) grouped[resource] = [];
        grouped[resource].push(action);
      }

      for (const k of Object.keys(grouped)) {
        grouped[k] = this.uniq(grouped[k]);
      }

      return { name: role.name, module: role.module, permissions: grouped };
    });
  }

  // ---------------- USER ROLE ASSIGNMENT ----------------
  async assignRolesToUser(body: any, actor?: any) {
    const {
      user_id,
      email: emailRaw,
      roles: bodyRoles,
      subModules: bodySubModules,
      startDate: bodyStartDate,
      endDate: bodyEndDate,
      noteRaw,
      resetPassword,
    } = body;

    const roles: string[] = Array.isArray(bodyRoles) ? bodyRoles : [];

    const incomingSubModules: string[] = Array.isArray(bodySubModules)
      ? bodySubModules.map((s) => String(s || '').trim()).filter(Boolean)
      : [];

    const email = emailRaw ? this.normalizeEmail(emailRaw) : null;

    // console.log(
    //   'Roles:',
    //   roles,
    //   'SubModules:',
    //   incomingSubModules,
    //   'Body:',
    //   body,
    // );

    if (!user_id && !email) throw new Error('user_id or email required');

    const incomingRoles = this.uniq(
      roles.map((r) => this.normalizeRoleKey(r)),
    ).filter(Boolean);

    if (incomingRoles.length === 0) throw new Error('roles are required');

    const query =
      typeof user_id === 'number'
        ? { user_id }
        : { $or: [{ email }, { user_email: email }] };

    const userBefore = await this.mongo.collection('users').findOne(query);
    if (!userBefore) throw new Error('User not found');
    this.assertTargetUserAllowed(actor, userBefore);

    const assignmentTenantId =
      this.tenantScope(actor) ||
      (body?.tenantId
        ? String(body.tenantId).trim().replace(/\s+/g, '-')
        : null);
    if (
      assignmentTenantId &&
      this.userTenantId(userBefore) !== assignmentTenantId
    ) {
      throw new BadRequestException('Target user is not in selected tenant');
    }

    const startDate: Date | null = bodyStartDate
      ? new Date(bodyStartDate)
      : null;
    const endDate: Date | null = bodyEndDate ? new Date(bodyEndDate) : null;

    if (startDate && endDate) {
      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        throw new Error('Invalid startDate/endDate');
      }

      if (endDate <= startDate) {
        throw new Error('endDate must be after startDate');
      }
    }

    const now = new Date();

    const timedStatus =
      startDate && endDate ? (startDate > now ? 'PENDING' : 'ACTIVE') : null;

    const existingRoles = Array.isArray(userBefore?.roles)
      ? userBefore.roles
      : [];

    const existingNormalized = existingRoles
      .map((r) => this.normalizeRoleKey(r))
      .filter(Boolean);

    const mergedRoles = this.uniq([...existingNormalized, ...incomingRoles]);

    const roleDocs = await this.findRoleDocsForRoles(
      mergedRoles,
      assignmentTenantId,
    );
    if (!roleDocs.length) {
      throw new Error(`Invalid role(s): ${incomingRoles.join(', ')}`);
    }

    const permissionKeys: string[] = mergedRoles.some((r) =>
      FULL_ACCESS_ROLES.has(r),
    )
      ? ['*']
      : this.computePermissionKeysFromRoleDocs(roleDocs);

    const derivedSubModules = permissionKeys.includes('*')
      ? []
      : this.computeSubModulesFromPermissionKeys(permissionKeys);

    const roleSubModules = this.uniq(
      roleDocs.flatMap((role: any) =>
        Array.isArray(role?.subModules)
          ? role.subModules
              .map((s: any) => String(s || '').trim())
              .filter(Boolean)
          : [],
      ),
    );

    // console.log('ROLE DOCS DEBUG:', roleDocs);
    // console.log('ROLE SUBMODULES DEBUG:', roleSubModules);

    const subModules = this.uniq([
      ...incomingSubModules,
      ...derivedSubModules,
      ...roleSubModules,
    ]);

    const lastUpdatedBy = this.normalizeEmail(
      body?.performedBy || body?.updatedBy || body?.assignedBy || '',
    );

    const modulesWithMeta = this.buildModuleAccessObjects(
      permissionKeys,
      startDate,
      endDate,
      noteRaw || '',
      now,
      subModules,
    );

    if (timedStatus === 'PENDING') {
      await this.mongo.collection('users').updateOne(
        { _id: userBefore._id },
        {
          $set: {
            roles: mergedRoles,
            modules: modulesWithMeta,
            permissionKeys,
            subModules,
            updatedAt: now,
            lastUpdatedAt: now,
            lastUpdatedBy,
          },
          $unset: {
            accessModules: '',
          },
        },
        { upsert: false },
      );

      return {
        message: 'Access scheduled successfully',
        status: 'PENDING',
        startDate,
        endDate,
        roles: mergedRoles,
        modules: modulesWithMeta,
        permissionKeys,
        subModules,
        emailSent: false,
      };
    }

    // Update roles, modules, and sub-modules when no pending status
    await this.mongo.collection('users').updateOne(
      { _id: userBefore._id },
      {
        $set: {
          roles: mergedRoles,
          modules: modulesWithMeta,
          permissionKeys,
          subModules,
          updatedAt: now,
          lastUpdatedAt: now,
          lastUpdatedBy,
          rolesAssignedAt: now,
        },
        $unset: {
          accessModules: '',
        },
      },
      { upsert: false },
    );

    const permissionKeysComputed =
      (await this.refreshUserPermissionCache(email ?? user_id)) ||
      permissionKeys;

    const finalSubModules = permissionKeysComputed.includes('*')
      ? subModules
      : this.uniq([
          ...subModules,
          ...this.computeSubModulesFromPermissionKeys(permissionKeysComputed),
        ]);

    const finalModulesWithMeta = this.buildModuleAccessObjects(
      permissionKeysComputed,
      startDate,
      endDate,
      noteRaw || '',
      now,
      finalSubModules,
    );

    await this.mongo.collection('users').updateOne(
      { _id: userBefore._id },
      {
        $set: {
          modules: finalModulesWithMeta,
          subModules: finalSubModules,
          updatedAt: now,
          lastUpdatedAt: now,
          lastUpdatedBy,
        },
        $unset: {
          accessModules: '',
        },
      },
      { upsert: false },
    );

    let tempPassword: string | null = null;

    if (resetPassword) {
      tempPassword = this.generateRandomPassword(12);
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      await this.mongo.collection('users').updateOne(
        { _id: userBefore._id },
        {
          $set: {
            password: passwordHash,
            isPasswordChanged: false,
            updatedAt: now,
            lastUpdatedAt: now,
            lastUpdatedBy,
          },
          $unset: { tempPassword: '' },
        },
      );
    }

    const targetEmail = email || this.resolveEmailFromUser(userBefore) || '';
    const shouldSendEmail =
      !!targetEmail && (body?.sendEmail === true || resetPassword);

    if (shouldSendEmail) {
      const appName = process.env.APP_NAME || 'GRC3';

      const displayName =
        String(userBefore?.user_name || userBefore?.first_name || '').trim() ||
        'User';

      const accessSummary = this.formatAccessSummary(permissionKeysComputed);

      const subject = `${appName} Access Updated`;

      const text = `Hello ${displayName},
  
  Your account access has been updated.
  
  Login Email: ${targetEmail}
  ${tempPassword ? `Temporary Password: ${tempPassword}\n` : ''}
  
  Assigned Roles: ${mergedRoles.join(', ')}
  Assigned Modules: ${
    finalModulesWithMeta.map((m) => m.moduleKey).join(', ') || '(none)'
  }
  Assigned Sub-Modules: ${finalSubModules.join(', ') || '(none)'}
  
  Modules & Permissions:
  ${accessSummary || '- (no permissions)'}
  
  Thanks,
  ${appName}`;

      await this.sendMail(targetEmail, subject, text);
      await this.mongo.collection('users').updateOne(
        { _id: userBefore._id },
        {
          $set: {
            credentialsSentAt: now,
            updatedAt: now,
            lastUpdatedAt: now,
            lastUpdatedBy,
          },
        },
      );
    }

    await this.assignmentModel.findOneAndUpdate(
      { userEmail: targetEmail || this.resolveEmailFromUser(userBefore) },
      {
        $set: {
          roles: mergedRoles,
          modules: finalModulesWithMeta,
          subModules: finalSubModules,
          permissions: permissionKeysComputed,
          startDate: startDate || now,
          endDate: endDate || new Date('2099-12-31T23:59:59.999Z'),
          status: 'ACTIVE',
          note: noteRaw || '',
          assignedAt: now,
          assignedBy: this.normalizeEmail(
            body?.performedBy || body?.assignedBy || body?.updatedBy || '',
          ),
          updatedAt: now,
          updatedBy: lastUpdatedBy,
          lastLoginAt: userBefore?.lastLoginAt || null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await this.createAccessLog({
      userEmail: targetEmail || this.resolveEmailFromUser(userBefore),
      userId: userBefore?.user_id,
      action: 'ASSIGN_ROLE',
      oldRoles: existingNormalized,
      newRoles: mergedRoles,
      oldModules: Array.isArray(userBefore?.modules) ? userBefore.modules : [],
      newModules: finalModulesWithMeta,
      oldPermissionKeys: Array.isArray(userBefore?.permissionKeys)
        ? userBefore.permissionKeys
        : [],
      newPermissionKeys: permissionKeysComputed,
      note: noteRaw || '',
      performedBy: body?.performedBy || body?.updatedBy || body?.assignedBy,
      updatedAt: new Date(),
    });

    return {
      message: 'Roles updated successfully',
      roles: mergedRoles,
      modules: finalModulesWithMeta,
      permissionKeys: permissionKeysComputed,
      subModules: finalSubModules,
      emailSent: shouldSendEmail,
      sentPassword: !!resetPassword,
      lastUpdatedAt: now,
      lastLoginAt: userBefore?.lastLoginAt || null,
      ...(startDate && endDate ? { status: 'ACTIVE', startDate, endDate } : {}),
    };
  }

  async refreshUserPermissionCache(emailOrUserId: any, actor?: any) {
    const q =
      typeof emailOrUserId === 'number'
        ? { user_id: emailOrUserId }
        : {
            $or: [
              { email: this.normalizeEmail(emailOrUserId) },
              { user_email: this.normalizeEmail(emailOrUserId) },
            ],
          };

    const user = await this.mongo.collection('users').findOne(q);
    if (!user) return null;
    this.assertTargetUserAllowed(actor, user);

    if (!Array.isArray(user.roles)) user.roles = [];

    const normalizedRoles = (user.roles || [])
      .map((r: any) => this.normalizeRoleKey(r))
      .filter(Boolean);

    const roleDocs = await this.findRoleDocsForRoles(
      normalizedRoles,
      this.userTenantId(user) || null,
    );

    let permissionKeys: string[];

    if (normalizedRoles.some((r) => FULL_ACCESS_ROLES.has(r))) {
      permissionKeys = ['*'];
    } else {
      const fromRoles = this.uniq(
        roleDocs.flatMap((r: any) => r.permissions || []),
      );

      const defaults =
        this.computeDefaultPermissionKeysForRoles(normalizedRoles);
      const stored = Array.isArray(user?.permissionKeys)
        ? user.permissionKeys
        : [];
      permissionKeys = this.uniq([...fromRoles, ...defaults, ...stored]);
    }

    const now = new Date();

    const subModules = permissionKeys.includes('*')
      ? []
      : this.computeSubModulesFromPermissionKeys(permissionKeys);

    const modules = permissionKeys.includes('*')
      ? []
      : this.buildModuleAccessObjects(permissionKeys, null, null, '', now);

    await this.mongo.collection('users').updateOne(q, {
      $set: {
        roles: normalizedRoles,
        permissionKeys,
        modules,
        subModules,
        updatedAt: now,
        lastUpdatedAt: now,
      },
      $unset: {
        accessModules: '',
      },
    });

    return permissionKeys;
  }

  async resolvePermissionsForUser(user: UserDoc): Promise<string[]> {
    const rolesRaw: string[] = Array.isArray(user?.roles) ? user.roles : [];
    const roles = rolesRaw.map((r) => this.normalizeRoleKey(r)).filter(Boolean);

    if (roles.some((r) => FULL_ACCESS_ROLES.has(r))) return ['*'];

    const stored = Array.isArray(user?.permissionKeys)
      ? user.permissionKeys
      : [];

    const defaults = this.computeDefaultPermissionKeysForRoles(roles);

    if (!stored.length) {
      const roleDocs = await this.findRoleDocsForRoles(
        rolesRaw,
        this.userTenantId(user) || null,
      );
      const fromRoles = this.uniq(
        roleDocs.flatMap((r: any) => r.permissions || []),
      );
      return this.uniq([...fromRoles, ...defaults]);
    }

    return this.uniq([...stored, ...defaults]);
  }

  async assignAccessWithDates(dto: AssignAccessDto, actor?: any) {
    const userEmail = this.normalizeEmail(dto.userEmail);
    const roles = this.uniq(
      (dto.roles || []).map((r) => String(r).trim()),
    ).filter(Boolean);

    if (!userEmail) throw new Error('userEmail required');
    if (roles.length === 0) throw new Error('roles required');

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error('Invalid startDate/endDate');
    }
    if (endDate <= startDate) {
      throw new Error('endDate must be after startDate');
    }

    const user = await this.mongo.collection('users').findOne({
      $or: [{ email: userEmail }, { user_email: userEmail }],
    });
    if (!user) throw new Error('User not found');
    this.assertTargetUserAllowed(actor, user);

    const roleDocs = await this.findRoleDocsForRoles(
      roles,
      this.tenantScope(actor),
    );
    if (!roleDocs.length) {
      throw new Error(`Invalid role(s): ${roles.join(', ')}`);
    }

    const modules = this.uniq(
      roleDocs.map((r: any) => String(r.module || '').trim()).filter(Boolean),
    );

    const normalizedRoles = roles.map((r) => this.normalizeRoleKey(r));
    const defaults = this.computeDefaultPermissionKeysForRoles(normalizedRoles);

    const permissions = this.uniq([
      ...roleDocs.flatMap((r: any) => r.permissions || []),
      ...defaults,
    ]);

    const actorEmail = this.normalizeEmail((dto as any)?.performedBy || '');

    const assignment = await this.assignmentModel.create({
      userEmail,
      roles: normalizedRoles,
      modules,
      permissions,
      startDate,
      endDate,
      status: 'ACTIVE',
      note: dto.note || '',
      assignedAt: new Date(),
      assignedBy: actorEmail,
      updatedAt: new Date(),
      updatedBy: actorEmail,
      lastLoginAt: user?.lastLoginAt || null,
    });

    await this.mongo.collection('users').updateOne(
      { _id: user._id },
      {
        $addToSet: { roles: { $each: normalizedRoles } },
        $set: {
          updatedAt: new Date(),
          lastUpdatedAt: new Date(),
          lastUpdatedBy: actorEmail,
        },
      },
    );

    const permissionKeys = await this.refreshUserPermissionCache(userEmail);

    await this.createAccessLog({
      userEmail,
      userId: user?.user_id,
      action: 'ASSIGN_ACCESS',
      oldRoles: Array.isArray(user?.roles) ? user.roles : [],
      newRoles: this.uniq([
        ...(Array.isArray(user?.roles) ? user.roles : []),
        ...normalizedRoles,
      ]),
      oldModules: Array.isArray(user?.modules) ? user.modules : [],
      newModules: this.uniq([
        ...(Array.isArray(user?.modules) ? user.modules : []),
        ...modules,
      ]),
      oldPermissionKeys: Array.isArray(user?.permissionKeys)
        ? user.permissionKeys
        : [],
      newPermissionKeys: permissionKeys || permissions,
      note: dto.note || '',
      performedBy: actorEmail,
      updatedAt: new Date(),
    });

    return {
      message: 'Access assigned successfully',
      assignmentId: assignment._id,
      roles: normalizedRoles,
      modules,
      endDate,
      permissionKeys,
    };
  }

  async listUserAccessAssignments(actor?: any) {
    const tenant = this.tenantScope(actor);

    const pipeline: any[] = [
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'users',
          let: { email: '$userEmail' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$email', '$$email'] },
                    { $eq: ['$user_email', '$$email'] },
                  ],
                },
              },
            },
          ],
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ];

    if (tenant) {
      pipeline.push({
        $match: {
          $expr: {
            $eq: [{ $ifNull: ['$user.tenant_id', '$user.tenantId'] }, tenant],
          },
        },
      });
    }

    pipeline.push({
      $project: {
        userEmail: 1,
        roles: 1,
        modules: 1,
        permissions: 1,
        startDate: 1,
        endDate: 1,
        status: 1,
        note: 1,
        assignedAt: 1,
        assignedBy: 1,
        updatedAt: 1,
        updatedBy: 1,
        lastLoginAt: 1,
        createdAt: 1,
        userData: {
          _id: '$user._id',
          name: '$user.name',
          email: { $ifNull: ['$user.email', '$user.user_email'] },
          contact: '$user.contactNumber',
          isActive: '$user.is_active',
          tenant_id: { $ifNull: ['$user.tenant_id', '$user.tenantId'] },
        },
      },
    });

    const data = await this.assignmentModel.aggregate(pipeline);
    return { data };
  }

  async removeRolesFromUserByEmail(
    email: string,
    rolesToRemove: string[],
    actor?: any,
  ) {
    const userEmail = this.normalizeEmail(email);
    const roles = this.uniq(
      (rolesToRemove || []).map((r) => String(r).trim()),
    ).filter(Boolean);
    if (!userEmail || roles.length === 0) return;

    const user = await this.mongo.collection('users').findOne({
      $or: [{ email: userEmail }, { user_email: userEmail }],
    });
    if (!user) return;
    this.assertTargetUserAllowed(actor, user);

    const normalizedToRemove = roles.map((r) => this.normalizeRoleKey(r));

    const oldRoles = Array.isArray(user?.roles)
      ? user.roles.map((r: any) => this.normalizeRoleKey(r)).filter(Boolean)
      : [];

    await this.mongo.collection('users').updateOne(
      { _id: user._id },
      {
        $pull: { roles: { $in: normalizedToRemove } },
        $set: { updatedAt: new Date(), lastUpdatedAt: new Date() },
      },
    );

    const permissionKeys = await this.refreshUserPermissionCache(userEmail);
    const userAfter = await this.mongo.collection('users').findOne({
      _id: user._id,
    });

    await this.assignmentModel.updateMany(
      { userEmail, status: 'ACTIVE' },
      {
        $set: {
          roles: Array.isArray(userAfter?.roles) ? userAfter.roles : [],
          modules: Array.isArray(userAfter?.modules) ? userAfter.modules : [],
          permissions: Array.isArray(userAfter?.permissionKeys)
            ? userAfter.permissionKeys
            : [],
          updatedAt: new Date(),
        },
      },
    );

    await this.createAccessLog({
      userEmail,
      userId: user?.user_id,
      action: 'REMOVE_ROLE',
      oldRoles,
      newRoles: Array.isArray(userAfter?.roles) ? userAfter.roles : [],
      oldModules: Array.isArray(user?.modules) ? user.modules : [],
      newModules: Array.isArray(userAfter?.modules) ? userAfter.modules : [],
      oldPermissionKeys: Array.isArray(user?.permissionKeys)
        ? user.permissionKeys
        : [],
      newPermissionKeys: permissionKeys || [],
      updatedAt: new Date(),
    });
  }

  async isBootstrapped(): Promise<boolean> {
    const count = await this.permModel.countDocuments();
    return count > 0;
  }

  async revokeAccessByEmail(
    body: {
      email?: string;
      note?: string;
      performedBy?: string;
    },
    actor?: any,
  ) {
    const userEmail = this.normalizeEmail(body?.email);
    if (!userEmail) throw new Error('email required');

    const user = await this.mongo.collection('users').findOne({
      $or: [{ email: userEmail }, { user_email: userEmail }],
    });

    if (!user) throw new Error('User not found');
    this.assertTargetUserAllowed(actor, user);

    const oldRoles = Array.isArray(user?.roles) ? user.roles : [];
    const oldModules = Array.isArray(user?.modules) ? user.modules : [];
    const oldPermissionKeys = Array.isArray(user?.permissionKeys)
      ? user.permissionKeys
      : [];

    const now = new Date();

    await this.mongo.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          roles: [],
          modules: [],
          permissionKeys: [],
          updatedAt: now,
          lastUpdatedAt: now,
          lastUpdatedBy: this.normalizeEmail(body?.performedBy || ''),
        },
      },
    );

    await this.assignmentModel.updateMany(
      { userEmail, status: { $in: ['ACTIVE', 'PENDING'] } as any },
      {
        $set: {
          status: 'REVOKED',
          updatedAt: now,
          updatedBy: this.normalizeEmail(body?.performedBy || ''),
          note: typeof body?.note === 'string' ? body.note : '',
        },
      },
    );

    await this.createAccessLog({
      userEmail,
      userId: user?.user_id,
      action: 'REVOKE_ACCESS',
      oldRoles,
      newRoles: [],
      oldModules,
      newModules: [],
      oldPermissionKeys,
      newPermissionKeys: [],
      note: typeof body?.note === 'string' ? body.note : '',
      performedBy: body?.performedBy || '',
      updatedAt: now,
    });

    return {
      message: 'Access revoked successfully',
      email: userEmail,
      status: 'REVOKED',
      updatedAt: now,
    };
  }

  async deleteAccessLogs(
    body: {
      id?: string;
      email?: string;
      action?: string;
      deleteAll?: boolean;
      performedBy?: string;
    },
    actor?: any,
  ) {
    const id = body?.id;
    const email = this.normalizeEmail(body?.email || '');
    const action = body?.action ? String(body.action).trim().toUpperCase() : '';
    const deleteAll = body?.deleteAll === true;

    const filter: any = {};
    const tenant = this.tenantScope(actor);

    if (id) {
      filter._id = id;
      if (tenant) {
        const log: any = await this.accessLogModel.findOne(filter).lean();
        if (!log?.userEmail) throw new Error('Tenant-scoped log not found');
        const user = await this.mongo.collection('users').findOne({
          $or: [{ email: log.userEmail }, { user_email: log.userEmail }],
        });
        this.assertTargetUserAllowed(actor, user);
      }
    } else {
      if (email) {
        if (tenant) {
          const user = await this.mongo.collection('users').findOne({
            $or: [{ email }, { user_email: email }],
          });
          this.assertTargetUserAllowed(actor, user);
        }
        filter.userEmail = email;
      }

      if (action) {
        filter.action = action;
      }

      if (!email && !action && !deleteAll) {
        throw new Error('Nothing to delete');
      }
      if (tenant && !email) {
        throw new Error('Tenant users must delete logs by user email');
      }
    }

    const result = await this.accessLogModel.deleteMany(filter);

    try {
      await this.createAccessLog({
        action: 'DELETE_LOG',
        userEmail: email,
        note: 'Log deleted',
        performedBy: body?.performedBy || '',
        updatedAt: new Date(),
      });
    } catch {}

    return {
      message: 'Logs deleted',
      deletedCount: result?.deletedCount || 0,
    };
  }
}
