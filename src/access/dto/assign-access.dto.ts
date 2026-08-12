import {
  IsArray,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';
/**
 * DTO for assigning access to a specific module.
 * This allows module-level permissions, sub-modules, dates, and notes.
 */
export class AssignAccessModuleDto {
  /**
   * Unique key/name of the module to which access is being assigned.
   * Example: "dashboard", "reports", "users"
   */
  @IsString()
  moduleKey: string;
  /**
   * List of permissions granted for this module.
   * Example: ["view", "create", "edit", "delete"]
   */
  @IsOptional()
  @IsArray()
  permissions?: string[];
  /**
   * List of sub-modules under this module that the user can access.
   * Example: ["sales-report", "user-management"]
   */
  @IsOptional()
  @IsArray()
  subModules?: string[];
  /**
   * Module-specific access start date.
   * Must be a valid ISO date string.
   */

  @IsOptional()
  @IsDateString()
  startDate?: string;
  /**
   * Module-specific access end date.
   * Must be a valid ISO date string.
   */

  @IsOptional()
  @IsDateString()
  endDate?: string;
  /**
   * Optional note explaining why this module access is assigned.
   */

  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * DTO for assigning roles and module access to a user.
 */
export class AssignAccessDto {
  @IsEmail()
  userEmail: string; // User email for role assignment

  @IsArray()
  roles: string[]; // Roles the user will be assigned

  // @IsOptional() // Make subModules optional for flexibility
  // @IsArray()
  // subModules?: string[]; // Sub-modules the user is assigned to (optional)

  // ✅ Add this because modules is now array of objects
  @IsOptional()
  @IsArray()
  modules?: AssignAccessModuleDto[];

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional() // Optional note for the role assignment
  @IsString()
  note?: string;
}
