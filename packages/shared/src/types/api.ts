/**
 * Generic API envelope types.
 *
 * Shared response wrappers used across the `src/app/api/*` routes.
 */

/** Standard `{ success, data?, error? }` envelope for API responses. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
