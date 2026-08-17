import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AccessLogDocument = HydratedDocument<AccessLog>;

/**
 * Schema used to store all access-related activity logs.
 * This includes role assignment, access assignment, login,
 * permission refresh, sub-module access, activation, and expiry events.
 */
@Schema({ timestamps: true, collection: 'access_logs' })
export class AccessLog {
  @Prop({ index: true, lowercase: true, trim: true })
  //Email address of the user whose access/role activity is being logged
  userEmail?: string;

  // Internal user ID of the user whose activity is being logged
  @Prop()
  userId?: number;

  // types of access-related action perform
  @Prop({
    required: true,
    enum: [
      'ASSIGN_ROLE',
      'ASSIGN_ACCESS',
      'REMOVE_ROLE',
      'REVOKE_ACCESS',
      'LOGIN',
      'ACCESS_ACTIVATED',
      'ACCESS_EXPIRED',
      'REFRESH_PERMISSION_CACHE',
      'ASSIGN_SUBMODULE_ACCESS', // New action to assign sub-module access
      'REVOKE_SUBMODULE_ACCESS', // New action to revoke sub-module access
    ],
    index: true,
  })
  action: string;

  // roles assigned to the user before action was perform
  @Prop({ type: [String], default: [] })
  oldRoles?: string[];

  // roles assigned to the user after action was perform
  @Prop({ type: [String], default: [] })
  newRoles?: string[];

  // Modules assigned to the user before action was perform
  @Prop({ type: [String], default: [] })
  oldModules?: string[];

  // modules assigned to the user after action was perform
  @Prop({ type: [String], default: [] })
  newModules?: string[];

  // submodule assigned to the user before action was perform
  @Prop({ type: [String], default: [] })
  oldSubModules?: string[]; // Track old sub-modules

  // submodule assigned to the user after action was perform
  @Prop({ type: [String], default: [] })
  newSubModules?: string[]; // Track new sub-modules

  // permissions assigned to the user before action was perform
  @Prop({ type: [String], default: [] })
  oldPermissionKeys?: string[];

  // permission assigned to the user after action was perform
  @Prop({ type: [String], default: [] })
  newPermissionKeys?: string[];

  @Prop()
  note?: string;

  // Email address or identifier of the admin/system that performed the action
  @Prop({ lowercase: true, trim: true })
  performedBy?: string;

  @Prop()
  loginAt?: Date;

  @Prop()
  updatedAt?: Date;

  @Prop()
  startDate?: Date; // Track start date when access is granted

  @Prop()
  endDate?: Date; // Track end date when access expires
}

export const AccessLogSchema = SchemaFactory.createForClass(AccessLog);
