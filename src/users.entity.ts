import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'users' })
export class User extends Document {
  @Prop({ default: 'default', index: true })
  tenantId: string;

  @Prop({ required: true, unique: true })
  user_id: number;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: false })
  employeeId: string;

  @Prop({ required: false })
  first_name: string;

  @Prop({ required: false })
  last_name: string;

  @Prop({ required: true })
  user_name: string;

  @Prop({ required: false })
  profile_img_path: string;

  @Prop({ required: false })
  address: string;

  @Prop({ required: true })
  contact_number: string;

  @Prop({ required: false, select: false, default: null })
  password: string;

  @Prop({ required: false })
  user_uuid: string;

  @Prop({ required: false })
  vendor_uuid: string;

  @Prop({ required: false })
  client_uuid: string;

  @Prop({ required: false })
  tprmVendorSchedule: string;

  @Prop({ required: false })
  tprmClientSchedule: string;

  @Prop({ required: false })
  thirdParty_uuid: string;

  @Prop({ required: false })
  thirdPartyAssessmentSchedule: string;

  @Prop({ required: true, type: Boolean, default: false })
  isPasswordChanged: boolean;

  @Prop({ required: true, type: Boolean, default: false })
  emailVerified: boolean;

  @Prop({ required: true, type: Boolean, default: false })
  mfaEnabled: boolean;

  @Prop({ required: false, type: Boolean, default: null })
  afterLoginMfaVerified: boolean;

  @Prop({ required: false })
  admin_email: string;

  @Prop({ required: false })
  admin: number;

  @Prop({ required: false })
  admin_uuid: string;

  // ✅ FIX: default [] so inserts don’t fail
  @Prop({ required: true, type: [String], default: [] })
  resources: string[];

  // ✅ RBAC fields (replacing user_designation)
  @Prop({ required: true, type: [String], default: [] })
  roles: string[];

  // @Prop({ required: true, type: [String], default: [] })
  // permissionKeys: string[];

  @Prop({
    type: [
      {
        moduleKey: { type: String, required: true },
        permissions: { type: [String], default: [] },
        subModules: { type: [String], default: [] },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        note: { type: String, default: '' },
        createdAt: { type: Date },
        updatedAt: { type: Date },
      },
    ],
    default: [],
  })
  modules: {
    moduleKey: string;
    permissions: string[];
    subModules: string[];
    startDate?: Date | null;
    endDate?: Date | null;
    note?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }[];
  // Sub-modules will be stored separately
  // @Prop({ type: [String], default: [] })
  // subModules: string[]; // Separate sub-modules from the modules

  @Prop({ required: true })
  is_superuser: boolean;

  @Prop({ required: true })
  is_staff: boolean;

  @Prop({ required: true })
  is_active: boolean;

  @Prop({ type: Date, required: true })
  date_joined: Date;

  @Prop({ type: Date, default: null })
  last_login: Date;

  @Prop({ required: true, default: false })
  is_deleted: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { tenantId: 1, is_deleted: 1 },
  { partialFilterExpression: { is_deleted: false } },
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, first_name: 1, admin_uuid: 1, is_deleted: 1 });
