import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AccessRoleDocument = HydratedDocument<AccessRole>;

@Schema({ timestamps: true, collection: 'access_roles' })
export class AccessRole {
  @Prop({ required: true, index: true })
  name: string; // e.g. "Risk Viewer"

  @Prop({ index: true, trim: true, default: null })
  tenantId?: string | null;

  @Prop({ required: true, index: true })
  module: string; // Module name (e.g., 'risk', 'privacy', 'audit')

  @Prop({ type: [String], default: [] })
  permissions: string[]; // List of permission keys (e.g., 'read', 'create')

  @Prop({ default: true })
  isSystem: boolean; // Indicates if the role is system-generated

  @Prop({ type: [String], default: [] })
  subModules: string[]; // List of sub-modules this role applies to (e.g., ['incident_management', 'policy'])

  @Prop({ type: Date, default: null })
  startDate?: Date; // Start date for when the role is valid

  @Prop({ type: Date, default: null })
  endDate?: Date; // End date for when the role expires
}

export const AccessRoleSchema = SchemaFactory.createForClass(AccessRole);

AccessRoleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
