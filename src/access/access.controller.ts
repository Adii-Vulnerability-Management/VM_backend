import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RbacService } from './rbac.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

import { AssignAccessDto } from './dto/assign-access.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { RequirePermissions } from 'src/auth/decorators/permissions.decorator';

@Controller('access')
// @UseGuards(PermissionsGuard)
export class AccessController {
  constructor(private readonly rbac: RbacService) {}

  // ---------------- helpers ----------------
  private asString(v: any): string {
    if (Array.isArray(v)) return String(v[0] ?? '').trim();
    return String(v ?? '').trim();
  }

  private asStringArray(v: any): string[] {
    if (!v) return [];
    if (Array.isArray(v)) {
      return v.map((x) => String(x ?? '').trim()).filter(Boolean);
    }

    if (typeof v === 'string' && v.includes(',')) {
      return v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }

    return [String(v ?? '').trim()].filter(Boolean);
  }

  private normalizeCreateRoleBody(body: any) {
    const name = this.asString(body?.name);
    const moduleArr = this.asStringArray(
      body?.module ?? body?.moduleKey ?? body?.key,
    );
    const module = moduleArr[0] || '';

    return {
      ...body,
      name,
      module,
      moduleArray: moduleArr,
      permissions: body?.permissions,
      subModules: this.asStringArray(body?.subModules),
      description: body?.description,
    };
  }

  private normalizeAssignRolesBody(body: any) {
    const email = body?.email ? this.asString(body.email) : undefined;
    const user_id =
      body?.user_id !== undefined && body?.user_id !== null
        ? Number(body.user_id)
        : undefined;

    const roles = this.asStringArray(body?.roles);
    const sendEmail = body?.sendEmail === true;
    const resetPassword = body?.resetPassword === true;

    // ✅ keep subModules if frontend sends it
    const subModules = this.asStringArray(
      body?.subModules ?? body?.submodules ?? body?.sub_modules,
    );

    return { email, user_id, roles, sendEmail, resetPassword, subModules }; // Return sub-modules
  }

  // ---------------- SEED ----------------
  @Post('seed')
  @RequirePermissions('access.permissions.manage')
  async seedAll() {
    const perms = await this.rbac.seedPermissionsIfMissing();
    const roles = await this.rbac.seedSystemRoles();
    return { permissions: perms, roles };
  }

  // ---------------- USERS ----------------
  @Post('users/recompute-permissions')
  @RequirePermissions('access.permissions.manage')
  async recompute(
    @Body() body: { email?: string; user_id?: number },
    @Req() req: any,
  ) {
    const key = body.user_id ?? body.email;
    const permissionKeys = await this.rbac.refreshUserPermissionCache(
      key,
      req?.user_data,
    );
    return { permissionKeys };
  }

  @Post('users/assign-roles')
  // @RequirePermissions('access.roles.assign')
  assignRoles(@Body() dto: AssignRolesDto, @Req() req: any) {
    // console.log('entered controller');
    const normalized = this.normalizeAssignRolesBody(dto);
    const actorEmail =
      req?.user_data?.email || req?.user?.email || req?.user?.user_email;

    return this.rbac.assignRolesToUser(
      {
        ...normalized,
        startDate: dto?.startDate,
        endDate: dto?.endDate,
        note: dto?.note,
        performedBy: actorEmail,
        updatedBy: actorEmail,
        assignedBy: actorEmail,
      },
      req?.user_data,
    );
  }

  @Post('users/assign-access')
  @RequirePermissions('access.permissions.manage')
  assignAccess(@Body() dto: AssignAccessDto, @Req() req: any) {
    const actorEmail =
      req?.user_data?.email || req?.user?.email || req?.user?.user_email;
    return this.rbac.assignAccessWithDates(
      {
        ...dto,
        performedBy: actorEmail,
      } as any,
      req?.user_data,
    );
  }

  @Get('users/access-list')
  @RequirePermissions('access.permissions.manage')
  accessList(@Req() req: any) {
    return this.rbac.listUserAccessAssignments(req?.user_data);
  }

  @Get('users/access-summary')
  @RequirePermissions('access.roles.assign')
  accessSummary(
    @Req() req: any,
    @Query('email') email?: string,
    @Query('user_id') user_id?: string,
  ) {
    return this.rbac.getUserAccessSummary(
      {
        email,
        user_id:
          user_id !== undefined && user_id !== null && user_id !== ''
            ? Number(user_id)
            : undefined,
      },
      req?.user_data,
    );
  }

  @Get('logs')
  @RequirePermissions('access.roles.assign')
  getLogs(
    @Req() req: any,
    @Query('email') email?: string,
    @Query('action') action?: string,
  ) {
    return this.rbac.getAccessLogs({ email, action }, req?.user_data);
  }

  @Post('users/log-login')
  @RequirePermissions('access.permissions.view')
  logUserLogin(
    @Body() body: { email?: string; user_id?: number; loginAt?: string },
    @Req() req: any,
  ) {
    return this.rbac.recordUserLogin(body, req?.user_data);
  }

  // ---------------- ROLES ----------------
  @Post('roles')
  @RequirePermissions('access.roles.assign')
  createRole(@Body() body: any, @Req() req: any) {
    const normalized = this.normalizeCreateRoleBody(body);
    return this.rbac.createRole(normalized, req?.user_data);
  }

  @Get('roles')
  @RequirePermissions('access.roles.assign')
  getRoles(@Req() req: any, @Query('module') module?: string) {
    return this.rbac.getRoles(module, req?.user_data);
  }

  @Get('roles/:name')
  @RequirePermissions('access.roles.assign')
  getRoleByName(@Param('name') name: string, @Req() req: any) {
    return this.rbac.getRoleByName(name, req?.user_data);
  }

  @Put('roles')
  @RequirePermissions('access.roles.assign')
  updateRole(@Body() body: any, @Req() req: any) {
    return this.rbac.updateRolePermissions(body, req?.user_data);
  }

  @Post('roles/add-permissions')
  @RequirePermissions('access.roles.assign')
  addPermissions(@Body() body: any, @Req() req: any) {
    return this.rbac.addPermissionsToRole(body, req?.user_data);
  }

  @Post('roles/remove-permissions')
  @RequirePermissions('access.roles.assign')
  removePermissions(@Body() body: any, @Req() req: any) {
    return this.rbac.removePermissionsFromRole(body, req?.user_data);
  }

  @Post('remove-roles')
  @RequirePermissions('access.roles.assign')
  async removeUserRoles(
    @Body() body: { email?: string; roles?: string[] },
    @Req() req: any,
  ) {
    await this.rbac.removeRolesFromUserByEmail(
      body?.email || '',
      Array.isArray(body?.roles) ? body.roles : [],
      req?.user_data,
    );
    return { message: 'Roles removed successfully' };
  }

  @Post('roles/clone')
  @RequirePermissions('access.roles.assign')
  cloneRole(@Body() body: any, @Req() req: any) {
    return this.rbac.cloneRole(body, req?.user_data);
  }

  @Delete('roles')
  @RequirePermissions('access.roles.assign')
  deleteRole(@Body('name') name: string, @Req() req: any) {
    return this.rbac.deleteRole({ name }, req?.user_data);
  }

  @Get('roles-permissions')
  @RequirePermissions('access.roles.assign')
  getRolesPermissions(@Req() req: any) {
    return this.rbac.getRolesWithGroupedPermissions(req?.user_data);
  }

  // ---------------- PERMISSIONS ----------------
  @Get('permissions')
  @RequirePermissions('access.permissions.view')
  getPermissions(@Req() req: any, @Query('module') module?: string) {
    return this.rbac.getPermissions(module, req?.user_data);
  }

  // ---------------- CATALOG (UI Friendly) ----------------
  @Get('catalog')
  @RequirePermissions('access.roles.assign')
  async getCatalog(@Req() req: any, @Query('includeDb') includeDb?: string) {
    const include = String(includeDb || '')
      .toLowerCase()
      .trim();
    const staticCatalog = await this.rbac.getCatalogForActor(req?.user_data);

    if (include === 'true' || include === '1' || include === 'yes') {
      const rolesRes = await this.rbac.getRoles(undefined, req?.user_data);
      return {
        modules: staticCatalog?.modules || [],
        roles: rolesRes?.data || [],
      };
    }

    return { modules: staticCatalog?.modules || [] };
  }

  @Post('revoke-access')
  @RequirePermissions('access.roles.assign')
  revokeAccess(
    @Body() body: { email?: string; userEmail?: string; note?: string },
    @Req() req: any,
  ) {
    const actorEmail =
      req?.user_data?.email || req?.user?.email || req?.user?.user_email;

    return this.rbac.revokeAccessByEmail(
      {
        email: body?.email || body?.userEmail,
        note: body?.note,
        performedBy: actorEmail,
      },
      req?.user_data,
    );
  }

  @Delete('logs')
  @RequirePermissions('access.roles.assign')
  deleteLogs(
    @Query('email') email?: string,
    @Query('action') action?: string,
    @Query('deleteAll') deleteAll?: string,
    @Req() req?: any,
  ) {
    const actorEmail =
      req?.user_data?.email || req?.user?.email || req?.user?.user_email;

    return this.rbac.deleteAccessLogs(
      {
        email,
        action,
        deleteAll: deleteAll === 'true',
        performedBy: actorEmail,
      },
      req?.user_data,
    );
  }

  @Delete('logs/:id')
  @RequirePermissions('access.roles.assign')
  deleteLogById(@Param('id') id: string, @Req() req: any) {
    const actorEmail =
      req?.user_data?.email || req?.user?.email || req?.user?.user_email;

    return this.rbac.deleteAccessLogs(
      {
        id,
        performedBy: actorEmail,
      },
      req?.user_data,
    );
  }
}
