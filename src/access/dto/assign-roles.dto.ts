import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
/** DTO for assigning module-level access and permissions.
 * This obkect is used inside 'AssignRolesDto.modules
 * to define which modules/submodules a user can access
 */

export class AssignRoleModuleDto {
  @IsString()
  moduleKey: string; // Unique key/identifier of the module

  @IsOptional()
  @IsArray()
  permissions?: string[]; // List of permission of the modules

  @IsOptional()
  @IsArray()
  subModules?: string[]; // List of submodules of the modules

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
/* main DTO for assign roles to a user
 * assign multiple roles, module-wise permission, temporary access dates and email notifiaction option */

export class AssignRolesDto {
  @IsOptional()
  @IsNumber()
  user_id?: number; // internal user_id

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsArray()
  roles: string[]; // Roles the user will be assigned

  // @IsOptional()
  // @IsArray()
  // subModules?: string[]; // Sub-modules the user will be assigned to

  // ✅ Optional support for modules as object array
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignRoleModuleDto)
  modules?: AssignRoleModuleDto[];

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean; // Option to send email

  @IsOptional()
  @IsBoolean()
  resetPassword?: boolean; // Option to reset password

  @IsOptional()
  @IsDateString()
  startDate?: string; // Start date for the role assignment

  @IsOptional()
  @IsDateString()
  endDate?: string; // End date for the role assignment

  @IsOptional()
  @IsString()
  note?: string; // Optional note for the role assignment
}
