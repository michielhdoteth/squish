/**
 * Unified Error Handling System for Squish
 * Provides standardized error handling across CLI, Web API, MCP server, and algorithm handlers
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { isDatabaseUnavailableError } from './lib/utils.js';

export { isDatabaseUnavailableError };

// Database operation wrapper

/**
 * Wraps database operations with standardized error handling
 */
export async function withDbErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (dbError: any) {
    if (isDatabaseUnavailableError(dbError)) {
      throw new Error(`Database unavailable: ${context}. Please check your database connection.`);
    }
    throw dbError;
  }
}

// API Response Formatters

/**
 * Formats errors for Web API responses
 */
export function formatApiError(
  error: any,
  defaultStatus: number = 500
): { status: number; response: { status: string; message: string } } {
  let message: string;
  
  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String(error.message);
  } else if (error && typeof error === 'object') {
    message = 'Unknown error';
  } else {
    message = 'Unknown error';
  }
  
  // Check if it's a database unavailable error
  if (isDatabaseUnavailableError(error)) {
    return {
      status: 503,
      response: {
        status: 'error',
        message: `Service unavailable: ${message}`
      }
    };
  }
  
  // Check for custom error classes with status hints
  if (error.status) {
    return {
      status: error.status,
      response: {
        status: 'error',
        message
      }
    };
  }
  
  return {
    status: defaultStatus,
    response: {
      status: 'error',
      message
    }
  };
}

// MCP Error Formatter

/**
 * Formats errors for MCP tool responses
 */
export function formatMcpError(
  error: any,
  context?: string
): never {
  const message = error?.message || error?.toString() || 'Unknown error';
  const fullMessage = context ? `${context}: ${message}` : message;
  
  // Determine appropriate error code
  let code: ErrorCode;
  
  if (isDatabaseUnavailableError(error)) {
    code = ErrorCode.InternalError; // -32603
  } else if (error instanceof ValidationError) {
    code = ErrorCode.InvalidParams; // -32602
  } else {
    code = ErrorCode.InternalError;
  }
  
  throw new McpError(code, fullMessage);
}

// CLI Error Formatter

/**
 * Formats errors for CLI commands
 */
export function formatCliError(
  error: any,
  exitCode: number = 1
): never {
  let message: string;
  
  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String(error.message);
  } else {
    message = 'Unknown error';
  }
  
  // Output JSON to stdout for CLI consumers
  console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(exitCode);
}

// Algorithm Handler Formatters

/**
 * Formats errors for algorithm handlers
 */
export function formatAlgorithmError(
  error: any,
  context?: string
): { ok: false; error: string } {
  let message: string;
  
  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String(error.message);
  } else {
    message = 'Unknown error';
  }
  
  const fullMessage = context ? `${context}: ${message}` : message;
  return { ok: false, error: fullMessage };
}

/**
 * Formats successful responses for algorithm handlers.
 * 
 * @param data - The success data to return
 * @param message - Optional success message
 * @returns Object with ok: true, optional message, and data
 */
export function formatAlgorithmSuccess<T>(
  data: T,
  message?: string
): { ok: true; data: T; message?: string } {
  const result: { ok: true; data: T; message?: string } = { ok: true, data };
  if (message) {
    result.message = message;
  }
  return result;
}

// Custom Error Classes

/**
 * Error thrown when validation fails
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when a requested resource is not found.
 * Used for missing memories, projects, etc.
 */
export class NotFoundError extends Error {
  constructor(
    message: string,
    public resource?: string
  ) {
    super(message);
    this.name = 'NotFoundError';
  }
}
