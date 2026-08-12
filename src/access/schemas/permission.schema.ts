import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PermissionDocument = HydratedDocument<Permission>;

@Schema({ timestamps: true })
export class Permission {
  @Prop({ required: true, unique: true, index: true })
  key: string; // Permission key (e.g., 'read', 'create', 'update')

  @Prop({ required: true, index: true })
  module: string; // Module that this permission belongs to (e.g., 'operations')

  @Prop()
  resource?: string; // Optional: resource this permission is tied to (e.g., 'finding_management')

  @Prop()
  action?: string; // Optional: the specific action for the permission (e.g., 'create', 'read')

  @Prop()
  description?: string; // Optional: description of the permission

  @Prop({ type: [String], default: [] })
  subModules: string[]; // List of sub-modules that this permission applies to (if relevant)

  @Prop({ type: Date, default: null })
  startDate?: Date; // Optional: when this permission starts being valid

  @Prop({ type: Date, default: null })
  endDate?: Date; // Optional: when this permission stops being valid
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
