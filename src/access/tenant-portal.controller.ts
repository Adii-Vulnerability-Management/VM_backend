import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { TenantPortalService } from './tenant-portal.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantModulesDto } from './dto/update-tenant-modules.dto';

/**
 * Tenant onboarding + tenant-scoped user access.
 * Base path: /access/tenants (same prefix as AccessController /access).
 */
@Controller('access/tenants')
@UseGuards(PermissionsGuard)
export class TenantPortalController {
  constructor(private readonly tenants: TenantPortalService) {}

  /** Module keys allowed when configuring a tenant (from static catalog). */
  @Get('module-catalog')
  @RequirePermissions('access.permissions.manage')
  moduleCatalog() {
    return {
      moduleKeys: this.tenants.allowedModuleKeys(),
      modules: this.tenants.moduleCatalog(),
    };
  }

  @Post()
  @RequirePermissions('access.permissions.manage')
  async onboard(@Body() dto: CreateTenantDto, @Req() req: any) {
    return this.tenants.createTenant(dto, req.user_data);
  }

  @Get()
  @RequirePermissions('access.permissions.manage')
  list(@Req() req: any) {
    return this.tenants.listAll(req.user_data);
  }

  @Get('current')
  @RequirePermissions('access.roles.assign')
  current(@Req() req: any) {
    return this.tenants.getCurrentForActor(req.user_data);
  }

  @Get('current/users')
  @RequirePermissions('access.roles.assign')
  async currentUsers(@Req() req: any) {
    const t = await this.tenants.getCurrentForActor(req.user_data);
    return this.tenants.listUsersInTenant(t.tenantId, req.user_data);
  }

  @Post('current/assign-roles')
  @RequirePermissions('access.roles.assign')
  assignForCurrentTenant(@Body() body: any, @Req() req: any) {
    return this.tenants.assignRolesForTenant(undefined, body, req.user_data);
  }

  @Get(':tenantId/users')
  @RequirePermissions('access.roles.assign')
  users(@Param('tenantId') tenantId: string, @Req() req: any) {
    return this.tenants.listUsersInTenant(tenantId, req.user_data);
  }

  @Patch(':tenantId/modules')
  @RequirePermissions('access.permissions.manage')
  updateModules(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantModulesDto,
    @Req() req: any,
  ) {
    return this.tenants.updateModules(tenantId, dto, req.user_data);
  }

  @Post(':tenantId/assign-roles')
  @RequirePermissions('access.roles.assign')
  assignForTenant(
    @Param('tenantId') tenantId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.tenants.assignRolesForTenant(tenantId, body, req.user_data);
  }

  @Get(':tenantId')
  @RequirePermissions('access.roles.assign')
  async getOne(@Param('tenantId') tenantId: string, @Req() req: any) {
    const doc = await this.tenants.getByTenantId(tenantId);
    const u = req.user_data;
    const isSuper =
      u?.is_superuser === true &&
      u?.is_staff === true &&
      u?.is_active !== false;
    if (isSuper) return doc;
    const mine = String(u?.tenant_id || u?.tenantId || '').trim();
    if (
      mine &&
      mine.toLowerCase() === String(doc.tenantId || '').toLowerCase()
    ) {
      return doc;
    }
    throw new ForbiddenException('Cannot view another tenant');
  }
}
