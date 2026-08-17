import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TenantRegistryDocument = HydratedDocument<TenantRegistry>;

/**
 * Canonical tenant record for onboarding + module entitlements.
 * `tenantId` matches Mongo users.tenant_id and x-tenant-id header values.
 */
@Schema({ timestamps: true, collection: 'tenant_registry' })
export class TenantRegistry {
  @Prop({ required: true, unique: true, index: true, trim: true })
  tenantId: string;

  @Prop({ required: true, trim: true })
  displayName: string;

  @Prop({ default: 'active', index: true })
  status: string;

  @Prop({ trim: true, default: '' })
  industry?: string;

  @Prop({ trim: true, default: '' })
  contactNumber?: string;

  @Prop({ lowercase: true, trim: true, default: '' })
  emailId?: string;

  @Prop({ trim: true, default: '' })
  country?: string;

  @Prop({ trim: true, default: '' })
  region?: string;

  /** Module keys from MODULE_ROLE_PERMISSIONS (e.g. privacy, risk). */
  @Prop({ type: [String], default: [] })
  enabledModuleKeys: string[];

  /** Optional submodule restrictions from MODULE_ROLE_PERMISSIONS. Empty means all submodules. */
  @Prop({ type: [String], default: [] })
  enabledSubModules: string[];

  /** Permission keys allowed for tenant role creation (e.g. privacy.read). */
  @Prop({ type: [String], default: [] })
  enabledPermissions: string[];

  @Prop({ default: '' })
  notes?: string;

  @Prop({ lowercase: true, trim: true })
  createdByEmail?: string;

  @Prop({ lowercase: true, trim: true })
  adminEmail?: string;
}

export const TenantRegistrySchema =
  SchemaFactory.createForClass(TenantRegistry);
