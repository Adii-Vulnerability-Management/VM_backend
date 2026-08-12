import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RbacService } from '../../access/rbac.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  // ✅ Normalize to stable role keys: "Vendor Lead" -> "VENDOR_LEAD"
  private normalizeRoleKey(name: any): string {
    return String(name || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  // ✅ Full access roles (same as Super Admin)
  private isFullAccessRole(user: any): boolean {
    const rolesRaw: any[] = Array.isArray(user?.roles) ? user.roles : [];
    const roles = rolesRaw.map((r) => this.normalizeRoleKey(r)).filter(Boolean);

    return roles.includes('SUPER_ADMIN');
  }

  private isDjangoSuperAdmin(user: any): boolean {
    return (
      user?.is_superuser === true &&
      user?.is_staff === true &&
      user?.is_active !== false
    );
  }

  private hasAdminByRole(user: any): boolean {
    const roles: string[] = Array.isArray(user?.roles) ? user.roles : [];
    const rolesNorm = roles
      .map((r) => this.normalizeRoleKey(r))
      .filter(Boolean);

    // ✅ Add your admin role names here (from Role Management)
    // NOTE: we normalize to ROLE_KEYS so add both styles safely.
    const ADMIN_ROLES = new Set(['SUPER_ADMIN']);

    return rolesNorm.some((r) => ADMIN_ROLES.has(String(r).trim()));
  }

  private isPlatformAdminRole(user: any): boolean {
  const roles = Array.isArray(user?.roles)
    ? user.roles
        .map((role: any) => this.normalizeRoleKey(role))
        .filter(Boolean)
    : [];

  const platformAdminRoles = new Set([
    'SUPER_ADMIN',
    'ADMIN',
  ]);

  return roles.some((role) => platformAdminRoles.has(role));
}

  // ✅ one-time bootstrap allowlist by email (from .env)
  private isBootstrapEmail(user: any): boolean {
    const allowedEmail = process.env.RBAC_BOOTSTRAP_EMAIL;
    if (!allowedEmail) return false;

    const email = String(user?.email || user?.user_email || '')
      .toLowerCase()
      .trim();
    return email === String(allowedEmail).toLowerCase().trim();
  }

  private getUrl(req: Request): string {
    return String((req as any).originalUrl || (req as any).url || '');
  }

  // ✅ make matching robust even if you use API_PREFIX like /apiv2jay/...
  private isSeedRoute(req: Request): boolean {
    const url = this.getUrl(req);
    return req.method === 'POST' && url.includes('/access/seed');
  }

  private isAssignRolesRoute(req: Request): boolean {
    const url = this.getUrl(req);
    return req.method === 'POST' && url.includes('/access/users/assign-roles');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // console.log('PERMISSIONS_GUARD_DEBUG', {
    //   method: req.method,
    //   url: (req as any).originalUrl || (req as any).url,
    //   authorization: req.headers?.authorization ? 'present' : 'missing',
    //   cookie: req.headers?.cookie ? 'present' : 'missing',
    //   user_data: (req as any).user_data || null,
    // });

    const required = this.reflector.getAllAndOverride<string[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user = (req as any)['user_data'];
    if (!user) throw new ForbiddenException('Unauthorized');

    // ------------------------------------------------------------------
    // ✅ BOOTSTRAP OVERRIDE (solves chicken/egg)
    // 1) Allow RBAC_BOOTSTRAP_EMAIL to self-assign roles even if seeded.
    // 2) Allow seed only when NOT seeded (or if superadmin).
    // ------------------------------------------------------------------

    // (1) allow bootstrap email to assign roles ONLY to itself
    if (this.isAssignRolesRoute(req) && this.isBootstrapEmail(user)) {
      const body: any = (req as any).body || {};
      const targetEmail = String(body?.email || body?.user_email || '')
        .toLowerCase()
        .trim();
      const actorEmail = String(user?.email || user?.user_email || '')
        .toLowerCase()
        .trim();

      if (targetEmail && actorEmail && targetEmail === actorEmail) {
        return true;
      }
    }

    // (2) allow seed:
    // - always allow for django superadmin
    // - allow bootstrap email only if permissions not yet seeded
    if (this.isSeedRoute(req)) {
      // ✅ super admin OR RBAC admin-role bypass
      if (
        this.isDjangoSuperAdmin(user) ||
        this.hasAdminByRole(user) ||
        this.isFullAccessRole(user)
      ) {
        return true;
      }

      const bootstrapped = await this.rbac.isBootstrapped();
      if (!bootstrapped && this.isBootstrapEmail(user)) return true;
    }

    // Only true platform super admins bypass permission checks globally.
    if (
  this.isDjangoSuperAdmin(user) ||
  this.isPlatformAdminRole(user)
) {
  return true;
}

    // resolve permissions
    let permissionKeys: string[] = Array.isArray((user as any).permissionKeys)
      ? (user as any).permissionKeys
      : [];

    // ✅ If user already has wildcard permission => allow everything
    if (permissionKeys.includes('*')) return true;

    if (!permissionKeys.length) {
      permissionKeys = await this.rbac.resolvePermissionsForUser(user);
    }

    (req as any).permissionKeys = permissionKeys;

    // ✅ If RBAC resolver returns wildcard => allow everything
    if (permissionKeys.includes('*')) return true;

    const ok = required.every((p) => permissionKeys.includes(p));
    if (!ok) throw new ForbiddenException('Forbidden');

    return true;
  }
}
