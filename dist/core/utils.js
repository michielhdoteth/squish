/**
 * Shared utility functions for the squish codebase
 */
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { config } from '../config.js';
import { toSqliteJson } from '../features/memory/serialization.js';
export function normalizeTimestamp(value) {
    if (!value)
        return null;
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'number')
        return new Date(value * 1000).toISOString();
    if (typeof value === 'string')
        return value;
    return null;
}
export function isDatabaseUnavailableError(error) {
    return error.message?.includes('Database unavailable') ||
        error.message?.includes('not a valid Win32 application');
}
export async function withDatabaseErrorHandling(operation, errorMessage) {
    try {
        return await operation();
    }
    catch (dbError) {
        if (isDatabaseUnavailableError(dbError)) {
            throw new McpError(ErrorCode.InternalError, errorMessage);
        }
        throw dbError;
    }
}
export function clampLimit(value, defaultValue, min = 1, max = 100) {
    return Math.min(Math.max(value ?? defaultValue, min), max);
}
export function prepareEmbedding(embedding) {
    if (config.isTeamMode) {
        return { embedding: embedding ?? null };
    }
    return { embeddingJson: toSqliteJson(embedding ?? null) };
}
export function determineOverallStatus(dbStatus, redisOk) {
    if ((dbStatus === 'ok' || dbStatus === 'unavailable') && redisOk) {
        return 'ok';
    }
    if (dbStatus === 'unavailable') {
        return 'degraded';
    }
    return 'error';
}
//# sourceMappingURL=utils.js.map