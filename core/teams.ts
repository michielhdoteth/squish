import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { createDatabaseClient } from './storage/database.js';

// ============================================================================
// Types
// ============================================================================

export interface TeamRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMemberRecord {
  id: string;
  teamId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

export interface TeamInvitationRecord {
  id: string;
  teamId: string;
  email: string;
  role: 'admin' | 'member';
  code: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface TeamShareRecord {
  id: string;
  memoryId: string;
  teamId: string;
  sharedBy: string;
  permission: 'read' | 'write';
  createdAt: Date;
}

// ============================================================================
// Errors
// ============================================================================

export class TeamNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Team not found: ${identifier}`);
    this.name = 'TeamNotFoundError';
  }
}

export class DuplicateTeamError extends Error {
  constructor(slug: string) {
    super(`Team with slug "${slug}" already exists`);
    this.name = 'DuplicateTeamError';
  }
}

export class TeamMemberNotFoundError extends Error {
  constructor(teamId: string, userId: string) {
    super(`Member not found: user ${userId} in team ${teamId}`);
    this.name = 'TeamMemberNotFoundError';
  }
}

export class InvitationNotFoundError extends Error {
  constructor(code: string) {
    super(`Invitation not found or expired: ${code}`);
    this.name = 'InvitationNotFoundError';
  }
}

// ============================================================================
// Normalizers
// ============================================================================

function normalizeTeam(row: any): TeamRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    createdAt: row.createdAt ?? row.created_at ?? new Date(),
    updatedAt: row.updatedAt ?? row.updated_at ?? new Date(),
  };
}

function normalizeTeamMember(row: any): TeamMemberRecord {
  return {
    id: row.id,
    teamId: row.teamId ?? row.team_id,
    userId: row.userId ?? row.user_id,
    role: row.role,
    joinedAt: row.joinedAt ?? row.joined_at ?? new Date(),
  };
}

function normalizeInvitation(row: any): TeamInvitationRecord {
  return {
    id: row.id,
    teamId: row.teamId ?? row.team_id,
    email: row.email,
    role: row.role,
    code: row.code,
    expiresAt: row.expiresAt ?? row.expires_at ?? null,
    createdAt: row.createdAt ?? row.created_at ?? new Date(),
  };
}

function normalizeShare(row: any): TeamShareRecord {
  return {
    id: row.id,
    memoryId: row.memoryId ?? row.memory_id,
    teamId: row.teamId ?? row.team_id,
    sharedBy: row.sharedBy ?? row.shared_by,
    permission: row.permission,
    createdAt: row.createdAt ?? row.created_at ?? new Date(),
  };
}

// ============================================================================
// Team CRUD
// ============================================================================

/**
 * Generate a URL-safe slug from a team name.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createTeam(
  name: string,
  ownerId: string,
  description?: string,
): Promise<TeamRecord> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const id = randomUUID();
  const slug = slugify(name);
  const now = new Date();

  await db.insert(schema.teams).values({
    id,
    name,
    slug,
    description: description ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // Add owner as first member
  await db.insert(schema.team_members).values({
    id: randomUUID(),
    teamId: id,
    userId: ownerId,
    role: 'owner',
    joinedAt: now,
  });

  return { id, name, slug, description: description ?? null, createdAt: now, updatedAt: now };
}

export async function getTeamById(id: string): Promise<TeamRecord | null> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db.select().from(schema.teams).where(eq(schema.teams.id, id)).limit(1);
  return rows[0] ? normalizeTeam(rows[0]) : null;
}

export async function getTeamBySlug(slug: string): Promise<TeamRecord | null> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db.select().from(schema.teams).where(eq(schema.teams.slug, slug)).limit(1);
  return rows[0] ? normalizeTeam(rows[0]) : null;
}

export async function getTeamsByOwner(ownerId: string): Promise<TeamRecord[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  // Find teams where user is owner via team_members
  const memberships = await db
    .select()
    .from(schema.team_members)
    .where(and(eq(schema.team_members.userId, ownerId), eq(schema.team_members.role, 'owner')));

  if (memberships.length === 0) return [];

  const teamIds = memberships.map((m: { teamId: string }) => m.teamId);
  const results: TeamRecord[] = [];
  for (const teamId of teamIds) {
    const team = await getTeamById(teamId);
    if (team) results.push(team);
  }
  return results;
}

export async function getAllTeams(): Promise<TeamRecord[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db.select().from(schema.teams);
  return rows.map(normalizeTeam);
}

export async function updateTeam(
  id: string,
  updates: Partial<Pick<TeamRecord, 'name' | 'description'>>,
): Promise<TeamRecord> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  const setValues: Record<string, any> = { updatedAt: new Date() };
  if (updates.name !== undefined) {
    setValues.name = updates.name;
    setValues.slug = slugify(updates.name);
  }
  if (updates.description !== undefined) {
    setValues.description = updates.description;
  }

  await db.update(schema.teams).set(setValues).where(eq(schema.teams.id, id));

  const team = await getTeamById(id);
  if (!team) throw new TeamNotFoundError(id);
  return team;
}

export async function deleteTeam(id: string): Promise<void> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  // Members, invitations, and shares cascade-delete via FK constraints
  await db.delete(schema.teams).where(eq(schema.teams.id, id));
}

export async function requireTeam(id: string): Promise<TeamRecord> {
  const team = await getTeamById(id);
  if (!team) throw new TeamNotFoundError(id);
  return team;
}

// ============================================================================
// Team Membership
// ============================================================================

export async function addMember(
  teamId: string,
  userId: string,
  role: 'admin' | 'member' = 'member',
): Promise<TeamMemberRecord> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const id = randomUUID();
  const now = new Date();

  await db.insert(schema.team_members).values({
    id,
    teamId,
    userId,
    role,
    joinedAt: now,
  });

  return { id, teamId, userId, role, joinedAt: now };
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  await db
    .delete(schema.team_members)
    .where(and(eq(schema.team_members.teamId, teamId), eq(schema.team_members.userId, userId)));
}

export async function getMembers(teamId: string): Promise<TeamMemberRecord[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db
    .select()
    .from(schema.team_members)
    .where(eq(schema.team_members.teamId, teamId));
  return rows.map(normalizeTeamMember);
}

export async function getMember(
  teamId: string,
  userId: string,
): Promise<TeamMemberRecord | null> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db
    .select()
    .from(schema.team_members)
    .where(and(eq(schema.team_members.teamId, teamId), eq(schema.team_members.userId, userId)))
    .limit(1);
  return rows[0] ? normalizeTeamMember(rows[0]) : null;
}

export async function isMember(teamId: string, userId: string): Promise<boolean> {
  const member = await getMember(teamId, userId);
  return member !== null;
}

export async function updateMemberRole(
  teamId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<TeamMemberRecord> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();

  await db
    .update(schema.team_members)
    .set({ role })
    .where(and(eq(schema.team_members.teamId, teamId), eq(schema.team_members.userId, userId)));

  const member = await getMember(teamId, userId);
  if (!member) throw new TeamMemberNotFoundError(teamId, userId);
  return member;
}

// ============================================================================
// Team Invitations
// ============================================================================

export async function createInvitation(
  teamId: string,
  email: string,
  role: 'admin' | 'member' = 'member',
  expiresInDays: number = 7,
): Promise<TeamInvitationRecord> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const id = randomUUID();
  const code = randomUUID().replace(/-/g, '').slice(0, 12);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  await db.insert(schema.team_invitations).values({
    id,
    teamId,
    email,
    role,
    code,
    expiresAt,
    createdAt: now,
  });

  return { id, teamId, email, role, code, expiresAt, createdAt: now };
}

export async function getInvitationByCode(
  code: string,
): Promise<TeamInvitationRecord | null> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db
    .select()
    .from(schema.team_invitations)
    .where(eq(schema.team_invitations.code, code))
    .limit(1);
  return rows[0] ? normalizeInvitation(rows[0]) : null;
}

export async function revokeInvitation(code: string): Promise<void> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  await db
    .delete(schema.team_invitations)
    .where(eq(schema.team_invitations.code, code));
}

export async function getTeamInvitations(teamId: string): Promise<TeamInvitationRecord[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db
    .select()
    .from(schema.team_invitations)
    .where(eq(schema.team_invitations.teamId, teamId));
  return rows.map(normalizeInvitation);
}

// ============================================================================
// Team Shares (memory sharing)
// ============================================================================

export async function shareMemory(
  memoryId: string,
  teamId: string,
  sharedBy: string,
  permission: 'read' | 'write' = 'read',
): Promise<TeamShareRecord> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const id = randomUUID();
  const now = new Date();

  await db.insert(schema.team_shares).values({
    id,
    memoryId,
    teamId,
    sharedBy,
    permission,
    createdAt: now,
  });

  return { id, memoryId, teamId, sharedBy, permission, createdAt: now };
}

export async function unshareMemory(memoryId: string, teamId: string): Promise<void> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  await db
    .delete(schema.team_shares)
    .where(
      and(
        eq(schema.team_shares.memoryId, memoryId),
        eq(schema.team_shares.teamId, teamId),
      ),
    );
}

export async function getTeamShares(teamId: string): Promise<TeamShareRecord[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db
    .select()
    .from(schema.team_shares)
    .where(eq(schema.team_shares.teamId, teamId));
  return rows.map(normalizeShare);
}

export async function getMemoryShares(memoryId: string): Promise<TeamShareRecord[]> {
  const db = createDatabaseClient(await getDb());
  const schema = await getSchema();
  const rows = await db
    .select()
    .from(schema.team_shares)
    .where(eq(schema.team_shares.memoryId, memoryId));
  return rows.map(normalizeShare);
}
