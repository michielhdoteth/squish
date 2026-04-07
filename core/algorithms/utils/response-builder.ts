/**
 * Unified response builder for algorithm handlers
 * Provides consistent response formatting across all algorithm handlers
 */

export interface ErrorResponse {
  ok: false;
  message: string;
  error: string;
}

export interface SuccessResponse<T = unknown> {
  ok: true;
  message: string;
  data?: T;
}

export type ApiResponse<T = unknown> = ErrorResponse | SuccessResponse<T>;

/**
 * Build a success response with optional data
 */
export function buildSuccessResponse<T = unknown>(
  message: string,
  data?: T
): SuccessResponse<T> {
  const response: SuccessResponse<T> = { ok: true, message };
  if (data !== undefined) {
    response.data = data;
  }
  return response;
}

/**
 * Build an error response
 */
export function buildErrorResponse(
  message: string,
  error?: unknown
): ErrorResponse {
  return {
    ok: false,
    message,
    error: error instanceof Error ? error.message : String(error || 'Unknown error'),
  };
}

/**
 * Wrap async handlers with consistent error handling
 */
export async function withErrorHandler<T>(
  handler: () => Promise<T>,
  errorMessage: string
): Promise<ApiResponse<T>> {
  try {
    const result = await handler();
    return buildSuccessResponse(errorMessage, result);
  } catch (error) {
    return buildErrorResponse(errorMessage, error);
  }
}
