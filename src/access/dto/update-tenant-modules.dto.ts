import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateTenantModulesDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  emailId?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModuleKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledSubModules?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledPermissions?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  adminEmail?: string;
}
