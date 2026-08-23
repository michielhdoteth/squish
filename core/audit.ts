/**
 * Audit logging for squish-memory
 * Tracks all actions in the system for compliance and debugging
 */
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { createDatabaseClient } from './storage/database.js';

// ============================================================================
// Types
// ============================================================================

export type AuditAction = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'share'
  | 'unshare'
  | 'login'
  | 'logout'
  | 'invite'
  | 'accept_invitation'
  | 'remove_member'
  | 'export'
  | 'import'
  | 'search'
  | 'tag'
  | 'untag';

export type EntityType = 
  | 'memory'
  | 'entity'
  | 'relation'
  | 'team'
  | 'team_member'
  | 'team_share'
  | 'user'
  | 'source'
  | 'context'
  | 'event';

export interface AuditLog {
  id: string;
  userId?: string | null;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  teamId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

export interface AuditLogChange {
  id: string;
  auditLogId: string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: Date;
}

export interface AuditLogWithChanges extends AuditLog {
  changes: AuditLogChange[];
}

export interface AuditQueryOptions {
  userId?: string;
  teamId?: string;
  action?: AuditAction;
  entityType?: EntityType;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalActions: number;
  actionsByType: Record<string, number>;
  actionsByEntity: Record<string, number>;
  recentActivity: AuditLog[];
}

// ============================================================================
// Errors
// ============================================================================

export class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditError';
  }
}

// ============================================================================
// Database Access
// ============================================================================

async function getDbInstance() {
  return createDatabaseClient(await getDb());
}

async function getSchemaInstance() {
  return await getSchema();
}

// ============================================================================
// Core Logging Functions
// ============================================================================

/**
 * Log an action
 */
export async function logAction(params: {
  userId?: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  teamId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AuditLog> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const logId = randomUUID();
  const now = new Date();

  await db.insert(schema.audit_logs).values({
    id: logId,
    userId: params.userId || null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    teamId: params.teamId || null,
    metadata: params.metadata || null,
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
    createdAt: now,
  });

  return {
    id: logId,
    userId: params.userId || null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    teamId: params.teamId || null,
    metadata: params.metadata || null,
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
    createdAt: now,
  };
}

/**
 * Log a change with field-level details
 */
export async function logChange(params: {
  userId?: string;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  teamId?: string;
  changes: Array<{
    field: string;
    oldValue?: unknown;
    newValue?: unknown;
  }>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<AuditLogWithChanges> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const logId = randomUUID();
  const now = new Date();

  // Create audit log
  await db.insert(schema.audit_logs).values({
    id: logId,
    userId: params.userId || null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    teamId: params.teamId || null,
    metadata: params.metadata || null,
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
    createdAt: now,
  });

  // Create change records
  const changeRecords: AuditLogChange[] = [];
  for (const change of params.changes) {
    const changeId = randomUUID();
    await db.insert(schema.audit_log_changes).values({
      id: changeId,
      auditLogId: logId,
      field: change.field,
      oldValue: change.oldValue !== undefined ? String(change.oldValue) : null,
      newValue: change.newValue !== undefined ? String(change.newValue) : null,
      createdAt: now,
    });
    changeRecords.push({
      id: changeId,
      auditLogId: logId,
      field: change.field,
      oldValue: change.oldValue !== undefined ? String(change.oldValue) : null,
      newValue: change.newValue !== undefined ? String(change.newValue) : null,
      createdAt: now,
    });
  }

  return {
    id: logId,
    userId: params.userId || null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    teamId: params.teamId || null,
    metadata: params.metadata || null,
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
    createdAt: now,
    changes: changeRecords,
  };
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get audit logs with optional filters
 */
export async function getAuditLogs(options: AuditQueryOptions = {}): Promise<AuditLog[]> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const conditions = [];

  if (options.userId) {
    conditions.push(eq(schema.audit_logs.userId, options.userId));
  }
  if (options.teamId) {
    conditions.push(eq(schema.audit_logs.teamId, options.teamId));
  }
  if (options.action) {
    conditions.push(eq(schema.audit_logs.action, options.action));
  }
  if (options.entityType) {
    conditions.push(eq(schema.audit_logs.entityType, options.entityType));
  }
  if (options.entityId) {
    conditions.push(eq(schema.audit_logs.entityId, options.entityId));
  }
  if (options.startDate) {
    conditions.push(gte(schema.audit_logs.createdAt, options.startDate));
  }
  if (options.endDate) {
    conditions.push(lte(schema.audit_logs.createdAt, options.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(schema.audit_logs)
    .where(whereClause)
    .orderBy(desc(schema.audit_logs.createdAt))
    .limit(options.limit || 100)
    .offset(options.offset || 0);

  return results;
}

/**
 * Get a single audit log with its changes
 */
export async function getAuditLogById(logId: string): Promise<AuditLogWithChanges | null> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const logResult = await db
    .select()
    .from(schema.audit_logs)
    .where(eq(schema.audit_logs.id, logId))
    .limit(1);

  if (logResult.length === 0) return null;

  const changes = await db
    .select()
    .from(schema.audit_log_changes)
    .where(eq(schema.audit_log_changes.auditLogId, logId));

  return {
    ...logResult[0],
    changes,
  };
}

/**
 * Get audit logs for a specific entity
 */
export async function getEntityAuditLogs(
  entityType: EntityType,
  entityId: string
): Promise<AuditLogWithChanges[]> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const logs = await db
    .select()
    .from(schema.audit_logs)
    .where(
      and(
        eq(schema.audit_logs.entityType, entityType),
        eq(schema.audit_logs.entityId, entityId)
      )
    )
    .orderBy(desc(schema.audit_logs.createdAt));

  const logsWithChanges: AuditLogWithChanges[] = [];

  for (const log of logs) {
    const changes = await db
      .select()
      .from(schema.audit_log_changes)
      .where(eq(schema.audit_log_changes.auditLogId, log.id));

    logsWithChanges.push({
      ...log,
      changes,
    });
  }

  return logsWithChanges;
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(
  userId: string,
  options: Omit<AuditQueryOptions, 'userId'> = {}
): Promise<AuditLog[]> {
  return getAuditLogs({ ...options, userId });
}

/**
 * Get audit logs for a specific team
 */
export async function getTeamAuditLogs(
  teamId: string,
  options: Omit<AuditQueryOptions, 'teamId'> = {}
): Promise<AuditLog[]> {
  return getAuditLogs({ ...options, teamId });
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get audit statistics
 */
export async function getAuditStats(options: {
  userId?: string;
  teamId?: string;
  startDate?: Date;
  endDate?: Date;
} = {}): Promise<AuditStats> {
  const logs = await getAuditLogs({
    ...options,
    limit: 10000,
  });

  const actionsByType: Record<string, number> = {};
  const actionsByEntity: Record<string, number> = {};

  for (const log of logs) {
    actionsByType[log.action] = (actionsByType[log.action] || 0) + 1;
    actionsByEntity[log.entityType] = (actionsByEntity[log.entityType] || 0) + 1;
  }

  return {
    totalActions: logs.length,
    actionsByType,
    actionsByEntity,
    recentActivity: logs.slice(0, 10),
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Log memory access
 */
export async function logMemoryAccess(
  userId: string,
  memoryId: string,
  action: 'read' | 'update' | 'delete' | 'share',
  metadata?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<AuditLog> {
  return logAction({
    userId,
    action,
    entityType: 'memory',
    entityId: memoryId,
    metadata,
    ipAddress,
    userAgent,
  });
}

/**
 * Log team action
 */
export async function logTeamAction(
  userId: string,
  teamId: string,
  action: AuditAction,
  entityType: EntityType,
  entityId: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<AuditLog> {
  return logAction({
    userId,
    action,
    entityType,
    entityId,
    teamId,
    metadata,
    ipAddress,
    userAgent,
  });
}

/**
 * Log entity changes
 */
export async function logEntityChanges(
  userId: string,
  entityType: EntityType,
  entityId: string,
  changes: Array<{
    field: string;
    oldValue?: unknown;
    newValue?: unknown;
  }>,
  teamId?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuditLogWithChanges> {
  return logChange({
    userId,
    action: 'update',
    entityType,
    entityId,
    teamId,
    changes,
    ipAddress,
    userAgent,
  });
}

/**
 * Log authentication events
 */
export async function logAuthEvent(
  userId: string,
  action: 'login' | 'logout',
  ipAddress?: string,
  userAgent?: string
): Promise<AuditLog> {
  return logAction({
    userId,
    action,
    entityType: 'user',
    entityId: userId,
    ipAddress,
    userAgent,
  });
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Delete old audit logs (for maintenance)
 */
export async function deleteOldAuditLogs(olderThanDays: number): Promise<number> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await db
    .delete(schema.audit_logs)
    .where(lte(schema.audit_logs.createdAt, cutoffDate));

  return result.changes || 0;
}

/**
 * Get audit log count
 */
export async function getAuditLogCount(): Promise<number> {
  const db = await getDbInstance();
  const schema = await getSchemaInstance();

  const result = await db
    .select({ count: schema.audit_logs.id })
    .from(schema.audit_logs);

  return result.length;
}
