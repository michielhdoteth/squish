import type { TableSchema } from '../generator.js';

export const projectsSchema: TableSchema = {
  name: 'projects',
  columns: {
    id: { type: 'TEXT', primary: true },
    name: { type: 'TEXT' },
    path: { type: 'TEXT' },
    description: { type: 'TEXT' },
    metadata: { type: 'TEXT' },
    created_at: { type: 'INTEGER' },
    updated_at: { type: 'INTEGER' },
  },
  indexes: [
    {
      name: 'projects_path_idx',
      columns: ['path'],
    },
  ],
};

export const usersSchema: TableSchema = {
  name: 'users',
  columns: {
    id: { type: 'TEXT', primary: true },
    external_id: { type: 'TEXT' },
    name: { type: 'TEXT' },
    email: { type: 'TEXT' },
    preferences: { type: 'TEXT' },
    created_at: { type: 'INTEGER' },
    updated_at: { type: 'INTEGER' },
  },
};
