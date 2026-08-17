/**
 * UserResponse
 *
 * The public contract for user data returned across service boundaries.
 * CRITICAL SECURITY INVARIANT:
 * The password field is NEVER present on this interface.
 * No service outside User Service should ever receive a password hash.
 */
export interface UserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
