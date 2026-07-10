/**
 * Schema types for migration column definitions
 */

export interface ColumnDefinition {
  type: string;
  primary?: boolean;
  default?: string;
}

export interface IndexDefinition {
  name: string;
  columns: string[];
}

export interface TableSchema {
  name: string;
  columns: Record<string, ColumnDefinition>;
  indexes?: IndexDefinition[];
}