/**
 * ResponseFormatter - Unified response formatting for all Squish output contexts
 * @module core/responses
 */

export type ResponseStatus = 'ok' | 'error';

export interface BaseResponse<T = unknown> {
  status: ResponseStatus;
  message?: string;
  data?: T;
  error?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T> extends BaseResponse<T[]> {
  count: number;
  total?: number;
  page?: number;
  limit?: number;
}

/**
 * Format options for web responses
 */
export interface WebFormatOptions {
  statusCode?: number;
  pagination?: { total: number; page: number; limit: number };
}

/**
 * Unified response formatter for all Squish output contexts
 */
export class ResponseFormatter {
  /**
   * Generate ISO timestamp
   */
  private static getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Build base response with timestamp
   */
  private static buildBase<T>(status: ResponseStatus, message?: string, data?: T, error?: string): BaseResponse<T> {
    return {
      status,
      message,
      data,
      error,
      timestamp: this.getTimestamp(),
    };
  }

  // CLI Formatters

  /**
   * Format response for CLI output (pretty-printed JSON)
   */
  static cli<T>(data: T, message?: string): string {
    const response = this.buildBase<T>(data instanceof Error ? 'error' : 'ok', message, data);
    return JSON.stringify(response, null, 2);
  }

  /**
   * Format error for CLI and exit process
   */
  static cliError(error: Error): never {
    const response = this.buildBase<void>('error', error.message, undefined, error.message);
    console.error(JSON.stringify(response, null, 2));
    process.exit(1);
  }

  // Web API Formatters

  /**
   * Format successful response for Web API
   */
  static web<T>(
    data: T,
    message?: string,
    options?: WebFormatOptions
  ): { status: number; body: BaseResponse<T> } {
    const body = this.buildBase<T>('ok', message, data);
    
    // Add pagination metadata if provided
    if (options?.pagination) {
      (body as any).count = options.pagination.total;
      (body as any).total = options.pagination.total;
      (body as any).page = options.pagination.page;
      (body as any).limit = options.pagination.limit;
    }
    
    return {
      status: options?.statusCode ?? 200,
      body,
    };
  }

  /**
   * Format error response for Web API
   */
  static webError(
    error: Error,
    options?: { statusCode?: number; log?: boolean }
  ): { status: number; body: BaseResponse } {
    const statusCode = options?.statusCode ?? 500;
    const body = this.buildBase<void>('error', error.message, undefined, error.message);
    
    if (options?.log !== false) {
      console.error(`[Web API Error ${statusCode}]:`, error.message);
    }
    
    return { status: statusCode, body };
  }

  // MCP Formatters

  /**
   * Format response for MCP tools
   */
  static mcp<T>(
    data: T,
    message?: string
  ): { content: Array<{ type: string; text: string }> } {
    const response = this.buildBase<T>('ok', message, data);
    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  }

  /**
   * Format error for MCP tools (throws McpError)
   */
  static mcpError(
    error: Error,
    context?: string
  ): never {
    const message = context ? `${context}: ${error.message}` : error.message;
    const response = this.buildBase<void>('error', message, undefined, message);
    
    // Import McpError dynamically to avoid requiring @modelcontextprotocol/sdk in non-MCP contexts
    try {
      const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
      throw new McpError(ErrorCode.InternalError, JSON.stringify(response));
    } catch (e) {
      // If McpError is not available, throw a standard error with MCP-formatted message
      const mcpError = new Error(JSON.stringify(response));
      mcpError.name = 'McpError';
      throw mcpError;
    }
  }

  // Algorithm Handler Formatters

  /**
   * Format response for algorithm handlers
   */
  static algorithm<T>(
    data: T,
    message: string,
    options?: { ok?: boolean; error?: string }
  ): BaseResponse<T> {
    const isOk = options?.ok !== false;
    return this.buildBase<T>(
      isOk ? 'ok' : 'error',
      message,
      isOk ? data : undefined,
      options?.error
    );
  }

  /**
   * Convenience method for success responses
   */
  static success<T>(data: T, message?: string): BaseResponse<T> {
    return this.buildBase<T>('ok', message, data);
  }

  /**
   * Convenience method for failure responses
   */
  static failure(message: string, error?: Error | string): BaseResponse {
    const errorMessage = error instanceof Error ? error.message : error;
    return this.buildBase<void>('error', message, undefined, errorMessage);
  }
}
