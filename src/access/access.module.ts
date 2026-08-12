import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessController } from './access.controller';
import { RbacService } from './rbac.service';
import { Permission, PermissionSchema } from './schemas/permission.schema';

import { AuthModule } from '../auth/auth.module';
import { AccessRole, AccessRoleSchema } from './schemas/role.schema';
import {
  UserAccessAssignment,
  UserAccessAssignmentSchema,
} from './schemas/user-access-assignment.schema';
import { AccessExpiryJob } from './access-expiry.job';
import { AccessLog, AccessLogSchema } from './schemas/access-log.schema';
import {
  TenantRegistry,
  TenantRegistrySchema,
} from './schemas/tenant-registry.schema';
import { TenantPortalService } from './tenant-portal.service';
import { TenantPortalController } from './tenant-portal.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Permission.name, schema: PermissionSchema },
      { name: AccessRole.name, schema: AccessRoleSchema },
      { name: UserAccessAssignment.name, schema: UserAccessAssignmentSchema },
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: TenantRegistry.name, schema: TenantRegistrySchema },
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [AccessController, TenantPortalController],
  providers: [RbacService, AccessExpiryJob, TenantPortalService],
  exports: [RbacService, TenantPortalService],
})
export class AccessModule {}
