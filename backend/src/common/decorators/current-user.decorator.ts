import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Shape of req.user after JWT validation */
export interface AuthUser {
  sub: string;
  email: string;
  role: string;
}

/**
 * Parameter decorator to extract the current authenticated user from the request.
 *
 * Usage:
 *   @CurrentUser() user: AuthUser           — full user payload
 *   @CurrentUser('sub') userId: string      — single field from payload
 *   @CurrentUser('email') email: string
 *   @CurrentUser('role') role: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
