import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class TenantGuard implements CanActivate {
  private normalizeTenant(value: any): string {
    return String(value ?? '')
      .trim()
      .replace(/\s+/g, '-');
  }

  private isPlatformSuperAdmin(user: any): boolean {
    return (
      user?.is_superuser === true &&
      user?.is_staff === true &&
      user?.is_active !== false
    );
  }

  private getHeaderTenantId(req: Request): string | undefined {
    const raw =
      req.headers['x-tenant-id'] ??
      req.headers['X-Tenant-Id' as keyof typeof req.headers];

    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v == null || String(v).trim() === '') return undefined;
    return this.normalizeTenant(v);
  }

  private getUserTenantId(user: any): string | undefined {
    const raw = user?.tenant_id ?? user?.tenantId;
    if (raw == null || String(raw).trim() === '') return undefined;
    return this.normalizeTenant(raw);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { [k: string]: any }>();
    const user = req?.user_data;

    // Public/unauthenticated routes are handled elsewhere.
    if (!user) return true;

    const headerTenantId = this.getHeaderTenantId(req);
    const userTenantId = this.getUserTenantId(user);
    const isSuper = this.isPlatformSuperAdmin(user);

    // Platform super admin can act globally or target a tenant explicitly.
    if (isSuper) {
      const effective = headerTenantId || userTenantId;
      if (effective) {
        req.tenantId = effective;
        req.headers['x-tenant-id'] = effective;
      }
      return true;
    }

    if (!userTenantId) {
      throw new ForbiddenException('Tenant context missing for user');
    }

    if (headerTenantId && headerTenantId !== userTenantId) {
      throw new ForbiddenException(
        'Tenant mismatch: header tenant is not allowed',
      );
    }

    // Enforce trusted tenant context for all non-super users.
    req.tenantId = userTenantId;
    req.headers['x-tenant-id'] = userTenantId;
    return true;
  }
}
