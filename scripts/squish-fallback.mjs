#!/usr/bin/env node

/**
 * Squish Fallback Policy Handler
 * 
 * Usage:
 *   node scripts/squish-fallback.mjs --op <operation> [--mcp-enabled] [--simulate-mcp-failure] [--dry-run] [--payload <payload>]
 * 
 * Execution paths:
 *   - mcp: Use MCP server for operation
 *   - cli-fallback: Fall back to CLI when MCP fails
 *   - error: Operation not allowed or payload blocked
 */

import fs from 'node:fs';

const ALLOWED_OPERATIONS = ['search', 'remember', 'recall', 'stats', 'context', 'recent', 'stale', 'inspect', 'health'];
const DANGEROUS_PATTERNS = ['&&', '||', ';', '`', '$', '|'];

function parseArgs() {
  const args = process.argv.slice(2);
  const op = args[args.indexOf('--op') + 1];
  const mcpEnabled = args.includes('--mcp-enabled');
  const simulateMcpFailure = args.includes('--simulate-mcp-failure');
  const dryRun = args.includes('--dry-run');
  const payloadIndex = args.indexOf('--payload');
  const payload = payloadIndex >= 0 ? args[payloadIndex + 1] : null;
  
  return { op, mcpEnabled, simulateMcpFailure, dryRun, payload };
}

function isOperationAllowed(op) {
  return ALLOWED_OPERATIONS.includes(op);
}

function isPayloadBlocked(payload) {
  if (!payload) return false;
  return DANGEROUS_PATTERNS.some(pattern => payload.includes(pattern));
}

function executeMcpPath(op, dryRun) {
  if (dryRun) {
    return { executionPath: 'mcp', operation: op, status: 'would-execute' };
  }
  // Actual MCP execution would happen here
  return { executionPath: 'mcp', operation: op, status: 'executed' };
}

function executeCliFallback(op, dryRun) {
  if (dryRun) {
    return { executionPath: 'cli-fallback', operation: op, status: 'would-execute' };
  }
  // CLI fallback execution would happen here
  return { executionPath: 'cli-fallback', operation: op, status: 'executed' };
}

function main() {
  const { op, mcpEnabled, simulateMcpFailure, dryRun, payload } = parseArgs();
  
  if (!op) {
    console.error('Operation required: --op <operation>');
    process.exit(1);
  }
  
  // Check if operation is allowed
  if (!isOperationAllowed(op)) {
    console.error(`Operation not allowed: ${op}`);
    process.exit(1);
  }
  
  // Check payload for dangerous patterns
  if (isPayloadBlocked(payload)) {
    console.error('Payload blocked: contains dangerous patterns');
    process.exit(1);
  }
  
  // Determine execution path
  let result;
  
  if (mcpEnabled && !simulateMcpFailure) {
    // MCP is enabled and working
    result = executeMcpPath(op, dryRun);
  } else if (mcpEnabled && simulateMcpFailure) {
    // MCP enabled but simulating failure - fall back to CLI
    result = executeCliFallback(op, dryRun);
  } else {
    // MCP not enabled, use CLI directly
    result = executeCliFallback(op, dryRun);
  }
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main();
