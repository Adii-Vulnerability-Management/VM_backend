import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or entire controller) as not requiring authentication.
 * Used by AuthGuard, applied globally in AppModule.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
