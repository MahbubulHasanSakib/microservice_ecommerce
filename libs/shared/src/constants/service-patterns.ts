/**
 * Message patterns for User Service TCP communication.
 */
export const USER_PATTERNS = {
  CREATE: 'user.create',
  FIND_BY_ID: 'user.find_by_id',
  FIND_BY_EMAIL: 'user.find_by_email',
} as const;

/**
 * Message patterns for Auth Service TCP communication.
 */
export const AUTH_PATTERNS = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  REFRESH_TOKENS: 'auth.refresh_tokens',
  LOGOUT: 'auth.logout',
  VALIDATE_TOKEN: 'auth.validate_token',
} as const;
