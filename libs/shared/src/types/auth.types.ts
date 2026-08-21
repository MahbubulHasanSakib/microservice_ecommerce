import { Role } from '../enums/role.enum';
import { UserResponse } from './user.types';

/**
 * Access Token Payload stored inside signed JWTs
 */
export interface JwtPayload {
  sub: string; // userId
  email: string;
  roles: Role[];
  jti: string; // unique token ID for Redis blacklisting
  iat?: number;
  exp?: number;
}

/**
 * Tokens returned upon successful login / registration / refresh
 */
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  user: UserResponse;
}

/**
 * Validated request context attached to req.user by JwtAuthGuard
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  roles: Role[];
}
