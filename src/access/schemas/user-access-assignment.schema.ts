import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserAccessAssignmentDocument =
  HydratedDocument<UserAccessAssignment>;

// Embedded schema for module-level access details
// each module can have own permissions, sub-modules
// validity dates, notes and timestamps
export class AccessModule {
  // unique key/name of the module assigned to the user
  @Prop({ required: true, trim: true })
  moduleKey: string;

  // list od permissions keys assigned to the user
  @Prop({ type: [String], default: [] })
  permissions: string[];

  // list of sub-modules assigned to the user
  @Prop({ type: [String], default: [] })
  subModules: string[];

  @Prop({ default: null })
  startDate?: Date | null;

  @Prop({ default: null })
  endDate?: Date | null;

  @Prop({ default: '' })
  note?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

const AccessModuleSchema = SchemaFactory.createForClass(AccessModule);

@Schema({ timestamps: true, collection: 'user_access_assignments' })
export class UserAccessAssignment {
  @Prop({ required: true, index: true, lowercase: true, trim: true })
  userEmail: string;

  @Prop({ type: [String], default: [] })
  roles: string[];

  // ✅ modules is now array of objects, not string[]
  @Prop({ type: [AccessModuleSchema], default: [] })
  modules: AccessModule[];

  @Prop({ type: [String], default: [] })
  subModules: string[];

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ required: true })
  startDate: Date; // Start date for when access is granted

  @Prop({ required: true, index: true })
  endDate: Date; // End date for when access expires

  @Prop({
    required: true,
    default: 'ACTIVE',
    enum: ['ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING'],
    index: true,
  })
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'PENDING';

  @Prop({ default: '' })
  note?: string; // Optional note for the assignment

  @Prop()
  assignedAt?: Date; // Timestamp of when the assignment occurred

  @Prop({ lowercase: true, trim: true })
  assignedBy?: string; // Who assigned the role

  @Prop()
  updatedAt?: Date; // Timestamp of when the assignment was updated

  @Prop({ lowercase: true, trim: true })
  updatedBy?: string; // Who updated the assignment

  @Prop()
  lastLoginAt?: Date; // Timestamp of the user's last login
}

export const UserAccessAssignmentSchema =
  SchemaFactory.createForClass(UserAccessAssignment);
