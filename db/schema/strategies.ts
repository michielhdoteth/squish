/**
 * Strategies table schema for migrations
 * Column definitions for ALTER TABLE migrations
 */

import type { TableSchema } from '../generator.js';

export const strategiesSchema: TableSchema = {
  name: 'strategies',
  columns: {
    id: { type: 'TEXT', primary: true },
    project_id: { type: 'TEXT' },
    user_id: { type: 'TEXT' },
    agent_id: { type: 'TEXT' },
    strategy_type: { type: 'TEXT' },
    title: { type: 'TEXT' },
    description: { type: 'TEXT' },
    context: { type: 'TEXT' },
    steps: { type: 'TEXT' },
    success_criteria: { type: 'TEXT' },
    failure_indicators: { type: 'TEXT' },
    confidence: { type: 'REAL', default: '0.5' },
    usage_count: { type: 'INTEGER', default: '0' },
    success_count: { type: 'INTEGER', default: '0' },
    failure_count: { type: 'INTEGER', default: '0' },
    last_used_at: { type: 'INTEGER' },
    last_success_at: { type: 'INTEGER' },
    last_failure_at: { type: 'INTEGER' },
    status: { type: 'TEXT', default: "'active'" },
    superseded_by: { type: 'TEXT' },
    tags: { type: 'TEXT' },
    metadata: { type: 'TEXT' },
    visibility_scope: { type: 'TEXT', default: "'private'" },
    created_at: { type: 'INTEGER' },
    updated_at: { type: 'INTEGER' },
  },
};

export const strategyEdgesSchema: TableSchema = {
  name: 'strategy_edges',
  columns: {
    id: { type: 'TEXT', primary: true },
    from_strategy_id: { type: 'TEXT' },
    to_strategy_id: { type: 'TEXT' },
    edge_type: { type: 'TEXT' },
    metadata: { type: 'TEXT' },
    created_at: { type: 'INTEGER' },
  },
};

export const strategyBeliefEdgesSchema: TableSchema = {
  name: 'strategy_belief_edges',
  columns: {
    id: { type: 'TEXT', primary: true },
    strategy_id: { type: 'TEXT' },
    belief_id: { type: 'TEXT' },
    edge_type: { type: 'TEXT' },
    metadata: { type: 'TEXT' },
    created_at: { type: 'INTEGER' },
  },
};

export const teamMembersSchema: TableSchema = {
  name: 'team_members',
  columns: {
    id: { type: 'TEXT', primary: true },
    project_id: { type: 'TEXT' },
    user_id: { type: 'TEXT' },
    agent_id: { type: 'TEXT' },
    role: { type: 'TEXT', default: "'member'" },
    joined_at: { type: 'INTEGER' },
    last_active_at: { type: 'INTEGER' },
    metadata: { type: 'TEXT' },
  },
};
