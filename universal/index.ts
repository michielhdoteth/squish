/**
 * Squish Universal Memory System
 * 
 * Provides universal interfaces for any AI agent to interact with Squish:
 * - HTTP REST API
 * - MCP Server (universal)
 * - Session ingestion pipeline
 */

export * from './types.js';
export * from './api/server.js';
export * from './mcp/server.js';
export * from './ingestion/parser.js';
