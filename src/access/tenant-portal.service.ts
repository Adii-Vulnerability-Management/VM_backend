import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

import { MODULE_ROLE_PERMISSIONS } from '../auth/rbac/roles-permissions';
import { buildUserModulesFromEntitlement } from './access-user-modules.util';
import {
  TenantRegistry,
  TenantRegistryDocument,
} from './schemas/tenant-registry.schema';
import { RbacService } from './rbac.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantModulesDto } from './dto/update-tenant-modules.dto';
import { AccessRole, AccessRoleDocument } from './schemas/role.schema';

const TENANT_ADMIN_ROLES = new Set([
  'TENANT_ADMIN',
  'TENANT_SUPER_ADMIN',
  'ADMIN',
]);

const FULL_ACCESS_ASSIGN_BLOCKED_FOR_TENANT = new Set(['SUPER_ADMIN', 'ADMIN']);

@Injectable()
export class TenantPortalService {
  constructor(
    @InjectModel(TenantRegistry.name)
    private readonly tenantModel: Model<TenantRegistryDocument>,
    @InjectModel(AccessRole.name)
    private readonly accessRoleModel: Model<AccessRoleDocument>,
    private readonly rbac: RbacService,
  ) {}

  private normalizeTenantId(v: any): string {
    return String(v ?? '')
      .trim()
      .replace(/\s+/g, '-');
  }

  private normalizeEmail(v: any): string {
    return v ? String(v).trim().toLowerCase() : '';
  }

  private async getNextUserId(db: any): Promise<number> {
    const counters = db.collection('counters');
    const counterRes = await counters.findOneAndUpdate(
      { name: 'user_id' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
    const seq = Number(counterRes?.value?.seq);
    if (!Number.isNaN(seq) && seq > 0) return seq;
    return 1;
  }

  private generateRandomPassword(length = 12): string {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let out = '';
    for (let i = 0; i < length; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
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

    if (!from) {
      console.log('[TENANT MAIL SKIPPED] Missing AWS_SES_FROM_EMAIL');
      return false;
    }

    const cmd = new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Text: { Data: text, Charset: 'UTF-8' } },
      },
    });

    await this.getSesClient().send(cmd);
    console.log('[TENANT SES SENT OK]');
    return true;
  }

  private async sendTenantAdminWelcomeEmail(params: {
    email: string;
    displayName: string;
    tenantId: string;
    tempPassword: string;
    firstName?: string;
  }) {
    const appName = process.env.APP_NAME || 'GRC3';
    const loginUrl =
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.CLIENT_URL ||
      '';
    const name = String(params.firstName || '').trim() || 'Admin';
    const subject = `${appName} Tenant Admin Account Created`;
    const text = `Hello ${name},

Your tenant admin account has been created.

Tenant ID: ${params.tenantId}
Tenant Name: ${params.displayName}
Login Email: ${params.email}
Temporary Password: ${params.tempPassword}
${loginUrl ? `Login URL: ${loginUrl}\n` : ''}
Please sign in and change your password after your first login.

Thanks,
${appName}`;

    return this.sendMail(params.email, subject, text);
  }

  private buildTenantAdminRoles(): string[] {
    return ['TENANT_ADMIN'];
  }

  private async ensureTenantAdminUser(
    tenantId: string,
    displayName: string,
    enabledModuleKeys: string[],
    enabledSubModules: string[],
    enabledPermissions: string[],
    dto: CreateTenantDto,
    actor: any,
  ) {
    const email = this.normalizeEmail(dto.adminEmail);
    if (!email) {
      return {
        created: false,
        reason: 'Admin email not provided on tenant form',
      };
    }

    const db = (this.tenantModel as any).db;
    const users = db.collection('users');
    const escaped = this.escapeRegex(email);
    const existing = await users.findOne({
      is_deleted: { $ne: true },
      $or: [
        { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { user_email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      ],
    });

    if (existing) {
      return {
        created: false,
        reason: 'Admin user already exists',
        user_id: existing.user_id ?? null,
        email,
      };
    }

    const now = new Date();
    const user_id = await this.getNextUserId(db);
    const objectId = new mongoose.Types.ObjectId();
    const user_uuid = objectId.toString();
    const tempPassword = this.generateRandomPassword(12);
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const first_name = String(dto.adminFirstName || '').trim();
    const last_name = String(dto.adminLastName || '').trim();
    const user_name =
      `${first_name} ${last_name}`.trim() ||
      displayName ||
      email.split('@')[0] ||
      `tenant-admin-${tenantId}`;
    const roles = this.buildTenantAdminRoles();
    const permissionKeys = Array.from(
      new Set([
        ...(Array.isArray(enabledPermissions) ? enabledPermissions : []),
        ...enabledPermissions,
        'access.roles.assign',
      ]),
    );
    const modules = buildUserModulesFromEntitlement(
      enabledModuleKeys,
      permissionKeys,
      enabledSubModules,
      MODULE_ROLE_PERMISSIONS.modules as unknown as {
        key: string;
        submodules?: string[];
      }[],
      'Tenant admin entitlement',
    );

    const userDoc: any = {
      _id: objectId,
      user_uuid,
      user_id,
      email,
      user_email: email,
      password: passwordHash,
      tempPassword,
      first_name: first_name || '',
      last_name: last_name || '',
      user_name,
      contact_number: String(dto.adminContactNumber || '').trim() || 'NA',
      tenant_id: tenantId,
      resources: [],
      roles,
      modules,
      subModules: enabledSubModules,
      permissionKeys,
      is_superuser: false,
      is_staff: false,
      is_active: true,
      is_deleted: false,
      isPasswordChanged: false,
      emailVerified: false,
      mfaEnabled: false,
      afterLoginMfaVerified: null,
      admin_email: this.normalizeEmail(actor?.email || actor?.user_email),
      admin: null,
      admin_uuid: null,
      date_joined: now,
      last_login: null,
      createdAt: now,
      updatedAt: now,
    };

    await users.insertOne(userDoc);
    const emailSent = await this.sendTenantAdminWelcomeEmail({
      email,
      displayName,
      tenantId,
      tempPassword,
      firstName: first_name,
    });

    if (emailSent) {
      await users.updateOne(
        { _id: objectId },
        { $set: { credentialsSentAt: new Date(), updatedAt: new Date() } },
      );
    }

    return {
      created: true,
      user_id,
      email,
      tempPassword,
      emailSent,
      roles,
      modules,
      subModules: enabledSubModules,
      permissionKeys,
    };
  }

  private isPlatformSuper(user: any): boolean {
    return (
      user?.is_superuser === true &&
      user?.is_staff === true &&
      user?.is_active !== false
    );
  }

  /** Tenant-scoped admins must carry TENANT_ADMIN (or TENANT_SUPER_ADMIN) and a tenant_id. */
  private isTenantAdmin(user: any): boolean {
    if (!user || this.isPlatformSuper(user)) return false;
    if (!this.actorTenantId(user)) return false;
    const roles: string[] = Array.isArray(user?.roles) ? user.roles : [];
    const norm = roles.map((r) =>
      String(r || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_'),
    );
    return norm.some((r) => TENANT_ADMIN_ROLES.has(r));
  }

  private actorTenantId(user: any): string | undefined {
    const t = user?.tenant_id ?? user?.tenantId;
    if (t == null || t === '') return undefined;
    return String(t).trim();
  }

  allowedModuleKeys(): string[] {
    return MODULE_ROLE_PERMISSIONS.modules.map((m) => m.key);
  }

  moduleCatalog() {
    return MODULE_ROLE_PERMISSIONS.modules;
  }

  // private allPermissionKeysForModules(moduleKeys: string[]): string[] {
  //   const enabled = new Set<string>((moduleKeys || []).filter(Boolean));
  //   const out: string[] = [];
  //   for (const mod of MODULE_ROLE_PERMISSIONS.modules as unknown as any[]) {
  //     if (!enabled.has(mod.key)) continue;
  //     const actionSet = new Set<string>();
  //     Object.values(mod.roles || {}).forEach((actions: any) => {
  //       if (Array.isArray(actions)) actions.forEach((a) => actionSet.add(a));
  //     });
  //     Object.entries(mod.permissions || {}).forEach(
  //       ([resource, actions]: [string, any]) => {
  //         if (Array.isArray(actions)) {
  //           actions.forEach((a) => actionSet.add(`${resource}.${a}`));
  //         }
  //       },
  //     );
  //     actionSet.forEach((a) => out.push(`${mod.key}.${a}`));
  //   }
  //   return Array.from(new Set(out));
  // }

  private allPermissionKeysForModules(moduleKeys: string[]): string[] {
    const enabledModules = new Set(
      (moduleKeys || []).map((key) => String(key || '').trim()).filter(Boolean),
    );

    const permissions = new Set<string>();

    for (const mod of MODULE_ROLE_PERMISSIONS.modules as unknown as any[]) {
      const moduleKey = String(mod?.key || '').trim();

      if (!moduleKey || !enabledModules.has(moduleKey)) {
        continue;
      }

      /*
       * Role actions may be:
       *   "read"
       *   "dataInventory.read"
       *
       * Normalize both formats into a canonical permission key.
       */
      Object.values(mod.roles || {}).forEach((actions: any) => {
        if (!Array.isArray(actions)) return;

        for (const action of actions) {
          const cleanAction = String(action || '').trim();
          if (!cleanAction) continue;

          permissions.add(
            cleanAction.includes('.')
              ? cleanAction
              : `${moduleKey}.${cleanAction}`,
          );
        }
      });

      /*
       * Permission maps normally look like:
       * {
       *   dataInventory: ["read", "create", "update", "delete"]
       * }
       *
       * These should become:
       *   dataInventory.read
       *   dataInventory.delete
       *
       * Do not prefix the module key a second time.
       */
      Object.entries(mod.permissions || {}).forEach(
        ([resource, actions]: [string, any]) => {
          if (!Array.isArray(actions)) return;

          const cleanResource = String(resource || '').trim();
          if (!cleanResource) return;

          for (const action of actions) {
            const cleanAction = String(action || '').trim();
            if (!cleanAction) continue;

            permissions.add(
              cleanAction.includes('.')
                ? cleanAction
                : `${cleanResource}.${cleanAction}`,
            );
          }
        },
      );
    }

    return Array.from(permissions);
  }

  // private normalizeEnabledPermissions(
  //   moduleKeys: string[],
  //   permissions?: string[],
  // ): string[] {
  //   const allowed = new Set(this.allPermissionKeysForModules(moduleKeys));
  //   if (!permissions || permissions.length === 0) return Array.from(allowed);

  //   const out = permissions.map((p) => String(p || '').trim()).filter(Boolean);
  //   for (const p of out) {
  //     if (!allowed.has(p)) {
  //       throw new BadRequestException(`Permission ${p} is not allowed`);
  //     }
  //   }
  //   return Array.from(new Set(out));
  // }

  private normalizeEnabledPermissions(
    moduleKeys: string[],
    permissions?: string[],
  ): string[] {
    const allowedPermissions = this.allPermissionKeysForModules(moduleKeys);

    const allowed = new Set(allowedPermissions);

    if (!permissions || permissions.length === 0) {
      return allowedPermissions;
    }

    const requested = Array.from(
      new Set(
        permissions
          .map((permission) => String(permission || '').trim())
          .filter(Boolean),
      ),
    );

    const invalid = requested.filter((permission) => !allowed.has(permission));

    if (invalid.length > 0) {
      throw new BadRequestException({
        message: `Permission(s) ${invalid.join(', ')} are not allowed`,
        invalidPermissions: invalid,
        enabledModuleKeys: moduleKeys,
        allowedPermissions,
      });
    }

    return requested;
  }

  private allowedSubModulesForModules(moduleKeys: string[]): Set<string> {
    const enabled = new Set<string>((moduleKeys || []).filter(Boolean));
    const allowed = new Set<string>();

    for (const mod of MODULE_ROLE_PERMISSIONS.modules as unknown as any[]) {
      if (!enabled.has(mod.key)) continue;
      (Array.isArray(mod.submodules) ? mod.submodules : []).forEach(
        (submodule: any) => {
          const clean = String(submodule || '').trim();
          if (clean) allowed.add(clean);
        },
      );
    }

    return allowed;
  }

  private normalizeEnabledSubModules(
    moduleKeys: string[],
    subModules?: string[],
  ): string[] {
    if (!subModules || subModules.length === 0) return [];

    const allowed = this.allowedSubModulesForModules(moduleKeys);
    const out = subModules.map((s) => String(s || '').trim()).filter(Boolean);

    for (const submodule of out) {
      if (!allowed.has(submodule)) {
        throw new BadRequestException(`Submodule ${submodule} is not allowed`);
      }
    }

    return Array.from(new Set(out));
  }

  private assertValidModules(keys: string[]) {
    const allowed = new Set(this.allowedModuleKeys());
    for (const k of keys) {
      if (!allowed.has(k)) {
        throw new BadRequestException(`Unknown module key: ${k}`);
      }
    }
  }

  async listAll(actor?: any) {
    if (!this.isPlatformSuper(actor)) {
      throw new ForbiddenException(
        'Only platform administrators can list tenants',
      );
    }
    return this.tenantModel.find().sort({ updatedAt: -1 }).lean();
  }

  async getByTenantId(tenantId: string) {
    const normalizedTenantId = this.normalizeTenantId(tenantId);

    console.log('TENANT_MODEL_DEBUG', {
      dbName: (this.tenantModel as any).db?.name,
      collectionName: (this.tenantModel as any).collection?.collectionName,
      normalizedTenantId,
    });

    const doc = await this.tenantModel
      .findOne({ tenantId: this.normalizeTenantId(tenantId) })
      .lean();
    if (!doc) throw new NotFoundException('Tenant not found');
    {
      console.log('TENANT_NOT_FOUND_DEBUG', {
        receivedTenantId: tenantId,
        normalizedTenantId,
      });
    }
    return doc;
  }

  async getCurrentForActor(actor: any) {
    const tid = this.actorTenantId(actor);

    console.log('GET_CURRENT_TENANT_DEBUG', {
      actorTenantId: tid,
      normalizedTenantId: tid ? this.normalizeTenantId(tid) : null,
      actorTenantIdSnake: actor?.tenant_id,
      actorTenantIdCamel: actor?.tenantId,
      actorEmail: actor?.email || actor?.user_email,
      roles: actor?.roles,
    });

    if (!tid) throw new BadRequestException('User has no tenant_id');
    return this.getByTenantId(tid);
  }

  async createTenant(dto: CreateTenantDto, actor: any) {
    if (!this.isPlatformSuper(actor)) {
      throw new ForbiddenException(
        'Only platform administrators can create tenants',
      );
    }

    const tenantId = this.normalizeTenantId(dto.tenantId);
    if (!tenantId) throw new BadRequestException('tenantId required');

    const enabled = (dto.enabledModuleKeys || []).filter(Boolean);
    this.assertValidModules(enabled);
    const enabledSubModules = this.normalizeEnabledSubModules(
      enabled,
      dto.enabledSubModules,
    );
    const enabledPermissions = this.normalizeEnabledPermissions(
      enabled,
      dto.enabledPermissions,
    );

    const exists = await this.tenantModel.findOne({ tenantId }).lean();
    if (exists) throw new BadRequestException('Tenant already exists');

    const doc = await this.tenantModel.create({
      tenantId,
      displayName: dto.displayName.trim(),
      status: 'active',
      enabledModuleKeys: enabled,
      enabledSubModules,
      enabledPermissions,
      notes: dto.notes?.trim() || '',
      createdByEmail: this.normalizeEmail(actor?.email || actor?.user_email),
      adminEmail: this.normalizeEmail(dto.adminEmail),
    });

    try {
      const db = (this.tenantModel as any).db;
      await db.collection('tenants').updateOne(
        { tenantId },
        {
          $set: {
            displayName: doc.displayName,
            updatedAt: new Date(),
            active: true,
          },
          $setOnInsert: {
            tenantId,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch {}

    const adminProvisioning = await this.ensureTenantAdminUser(
      tenantId,
      doc.displayName,
      enabled,
      enabledSubModules,
      enabledPermissions,
      dto,
      actor,
    );

    return { ...doc.toObject(), adminProvisioning };
  }

  async updateModules(
    tenantIdRaw: string,
    body: UpdateTenantModulesDto,
    actor: any,
  ) {
    const tenantId = this.normalizeTenantId(tenantIdRaw);
    const tenant = await this.tenantModel.findOne({ tenantId }).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (!this.isPlatformSuper(actor)) {
      throw new ForbiddenException(
        'Only platform administrators can change tenant modules',
      );
    }

    const keys = (body.enabledModuleKeys || []).filter(Boolean);
    this.assertValidModules(keys);
    const enabledSubModules = this.normalizeEnabledSubModules(
      keys,
      body.enabledSubModules,
    );
    const enabledPermissions = this.normalizeEnabledPermissions(
      keys,
      body.enabledPermissions,
    );

    await this.tenantModel.updateOne(
      { tenantId },
      {
        $set: {
          enabledModuleKeys: keys,
          enabledSubModules,
          enabledPermissions,
        },
      },
    );

    await this.syncTenantAdminUserAccess(
      tenantId,
      keys,
      enabledSubModules,
      enabledPermissions,
    );

    return this.getByTenantId(tenantId);
  }

  private async syncTenantAdminUserAccess(
    tenantId: string,
    enabledModuleKeys: string[],
    enabledSubModules: string[],
    enabledPermissions: string[],
  ) {
    const db = (this.tenantModel as any).db;
    const permissionKeys = Array.from(
      new Set([
        ...(Array.isArray(enabledPermissions) ? enabledPermissions : []),
        ...enabledPermissions,
        'access.roles.assign',
      ]),
    );
    const modules = buildUserModulesFromEntitlement(
      enabledModuleKeys,
      permissionKeys,
      enabledSubModules,
      MODULE_ROLE_PERMISSIONS.modules as unknown as {
        key: string;
        submodules?: string[];
      }[],
      'Tenant admin entitlement',
    );

    await db.collection('users').updateMany(
      {
        is_deleted: { $ne: true },
        $or: [{ tenant_id: tenantId }, { tenantId: tenantId }],
        roles: { $in: ['TENANT_ADMIN', 'TENANT_SUPER_ADMIN'] },
      },
      {
        $set: {
          modules,
          subModules: enabledSubModules,
          permissionKeys,
          updatedAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      },
    );
  }

  async listUsersInTenant(tenantIdRaw: string, actor: any) {
    const tenantId = this.normalizeTenantId(tenantIdRaw);

    if (this.isPlatformSuper(actor)) {
      // ok
    } else if (this.isTenantAdmin(actor)) {
      const mine = this.actorTenantId(actor);
      if (!mine || this.normalizeTenantId(mine) !== tenantId) {
        throw new ForbiddenException('Cannot list users for another tenant');
      }
    } else {
      throw new ForbiddenException('Forbidden');
    }

    const db = (this.tenantModel as any).db;
    const raw = tenantIdRaw.trim();
    const users = await db
      .collection('users')
      .find({
        is_deleted: { $ne: true },
        $or: [
          { tenant_id: tenantId },
          { tenant_id: raw },
          { tenantId: tenantId },
          { tenantId: raw },
        ],
      })
      .project({ password: 0, tempPassword: 0 })
      .sort({ user_id: 1 })
      .toArray();

    return users;
  }

  private async resolveTenantForAssign(actor: any, tenantIdParam?: string) {
    if (this.isPlatformSuper(actor)) {
      if (!tenantIdParam) throw new BadRequestException('tenantId required');
      return this.getByTenantId(tenantIdParam);
    }
    if (this.isTenantAdmin(actor)) {
      const mine = this.actorTenantId(actor);
      if (!mine) throw new BadRequestException('User has no tenant_id');
      if (
        tenantIdParam &&
        this.normalizeTenantId(tenantIdParam) !== this.normalizeTenantId(mine)
      ) {
        throw new ForbiddenException('Cannot assign roles for another tenant');
      }
      return this.getByTenantId(mine);
    }
    throw new ForbiddenException('Forbidden');
  }

  private async assertRolesAllowedForTenant(tenant: any, roles: string[]) {
    const enabled = new Set<string>(
      Array.isArray(tenant?.enabledModuleKeys) ? tenant.enabledModuleKeys : [],
    );
    if (enabled.size === 0) {
      throw new BadRequestException(
        'Tenant has no enabled modules — platform admin must configure modules first',
      );
    }

    const normalized = roles.map((r) =>
      String(r || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_'),
    );

    for (const r of normalized) {
      if (FULL_ACCESS_ASSIGN_BLOCKED_FOR_TENANT.has(r)) {
        throw new BadRequestException(
          `Role ${r} cannot be assigned from tenant portal`,
        );
      }
    }

    const rawRoles = roles.map((r) => String(r || '').trim()).filter(Boolean);
    const expanded = Array.from(
      new Set([
        ...rawRoles,
        ...normalized,
        ...normalized.map((r) => r.replace(/_/g, ' ')),
      ]),
    );
    const roleDocs = await this.accessRoleModel
      .find({
        tenantId: tenant.tenantId,
        $or: expanded.map((name) => ({
          name: new RegExp(`^${this.escapeRegex(name)}$`, 'i'),
        })),
      })
      .select({ name: 1, module: 1, permissions: 1, subModules: 1 })
      .lean();

    if (!roleDocs.length) {
      throw new BadRequestException('No matching role definitions found');
    }

    const MODULES_RESTRICTED = new Set([
      'TPRM_CLIENT_REVIEWER',
      'TPRM_VENDOR',
      'TPRM_VENDOR_LEAD_RESPONDER',
    ]);

    for (const doc of roleDocs) {
      const rk = String(doc.name || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '_');
      if (MODULES_RESTRICTED.has(rk)) continue;

      const mod = String(doc.module || '').trim();
      if (!mod) continue;
      if (!enabled.has(mod)) {
        throw new BadRequestException(
          `Role "${doc.name}" uses module "${mod}" which is not enabled for this tenant`,
        );
      }
      const allowedPermissions = new Set(
        Array.isArray(tenant?.enabledPermissions)
          ? tenant.enabledPermissions
          : this.allPermissionKeysForModules(Array.from(enabled)),
      );
      const invalid = (
        Array.isArray((doc as any).permissions) ? (doc as any).permissions : []
      ).filter((p: string) => !allowedPermissions.has(p));
      if (invalid.length) {
        throw new BadRequestException(
          `Role "${doc.name}" uses permission(s) not enabled for this tenant`,
        );
      }

      const allowedSubModules = new Set(
        Array.isArray(tenant?.enabledSubModules)
          ? tenant.enabledSubModules
          : [],
      );
      if (allowedSubModules.size > 0) {
        const invalidSubModules = (
          Array.isArray((doc as any).subModules) ? (doc as any).subModules : []
        ).filter((submodule: string) => !allowedSubModules.has(submodule));
        if (invalidSubModules.length) {
          throw new BadRequestException(
            `Role "${doc.name}" uses submodule(s) not enabled for this tenant`,
          );
        }
      }
    }
  }

  async assignRolesForTenant(
    tenantIdParam: string | undefined,
    body: any,
    actor: any,
  ) {
    const tenant = await this.resolveTenantForAssign(actor, tenantIdParam);
    const tenantKey = tenant.tenantId;

    const user_id = body?.user_id;
    const email = body?.email ? String(body.email).trim() : undefined;
    if (!user_id && !email)
      throw new BadRequestException('user_id or email required');

    const db = (this.tenantModel as any).db;
    const q: any =
      typeof user_id === 'number'
        ? { user_id }
        : {
            $or: [
              { email: new RegExp(`^${this.escapeRegex(email!)}$`, 'i') },
              { user_email: new RegExp(`^${this.escapeRegex(email!)}$`, 'i') },
            ],
          };

    const target = await db.collection('users').findOne(q);
    if (!target) throw new NotFoundException('User not found');

    const tUser =
      this.normalizeTenantId(
        target.tenant_id || (target as any).tenantId || '',
      ) || '';
    if (!tUser || tUser !== this.normalizeTenantId(String(tenantKey))) {
      throw new ForbiddenException(
        'Target user is not a member of this tenant',
      );
    }

    const roles: string[] = Array.isArray(body?.roles) ? body.roles : [];
    if (!roles.length) throw new BadRequestException('roles are required');

    if (!this.isPlatformSuper(actor)) {
      await this.assertRolesAllowedForTenant(tenant, roles);
    }

    return this.rbac.assignRolesToUser(
      {
        ...body,
        tenantId: tenant.tenantId,
        performedBy: this.normalizeEmail(actor?.email || actor?.user_email),
        updatedBy: this.normalizeEmail(actor?.email || actor?.user_email),
        assignedBy: this.normalizeEmail(actor?.email || actor?.user_email),
      },
      actor,
    );
  }

  private escapeRegex(s: string) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
