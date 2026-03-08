/**
 * Session Ingestion Pipeline
 * 
 * Parses session data from any agent format and converts to universal memory format.
 * Supports: Claude Code, Hermes Agent, OpenClaw JSONL, OpenFang logs
 */

import { randomUUID } from 'crypto';
import { logger } from '../../core/logger.js';
import { rememberMemory } from '../../core/memory/memories.js';
import { ensureProject } from '../../core/projects.js';
import type {
  SessionFormat,
  SessionData,
  SessionMessage,
  IngestSessionRequest,
  IngestSessionResponse,
  UniversalMemory,
} from './types.js';

/**
 * Detect session format from data structure
 */
export function detectFormat(data: any): SessionFormat {
  if (!data || typeof data !== 'object') return 'universal-json';
  
  // Claude Code format
  if (Array.isArray(data.messages) && data.messages[0]?.role) {
    return 'claude-code';
  }
  
  // Hermes Agent format (Python dict-like)
  if (data.agent_id || data.observations || data.learnings) {
    return 'hermes-agent';
  }
  
  // OpenClaw JSONL format (array of lines)
  if (Array.isArray(data) && data[0]?.type === 'tool_use') {
    return 'openclaw-jsonl';
  }
  
  // OpenFang log format
  if (data.timestamp && (data.level || data.message)) {
    return 'openfang-log';
  }
  
  return 'auto-detect';
}

/**
 * Parse Claude Code session format
 */
async function parseClaudeCode(session: SessionData, container: string): Promise<UniversalMemory[]> {
  const memories: UniversalMemory[] = [];
  
  for (const msg of session.messages) {
    if (msg.role === 'user' && msg.content) {
      memories.push({
        id: randomUUID(),
        containerId: container,
        content: msg.content,
        type: 'observation',
        tags: ['claude-code', 'user-prompt'],
        importance: 0.5,
        source: {
          agentType: 'claude-code',
          sessionId: session.sessionId,
        },
        createdAt: msg.timestamp || new Date().toISOString(),
      });
    }
    
    if (msg.role === 'assistant' && msg.content) {
      memories.push({
        id: randomUUID(),
        containerId: container,
        content: msg.content,
        type: 'action',
        tags: ['claude-code', 'assistant-response'],
        importance: 0.3,
        source: {
          agentType: 'claude-code',
          sessionId: session.sessionId,
        },
        createdAt: msg.timestamp || new Date().toISOString(),
      });
    }
    
    if (msg.role === 'tool' && msg.toolName) {
      memories.push({
        id: randomUUID(),
        containerId: container,
        content: `${msg.toolName}: ${JSON.stringify(msg.toolInput || {})}`,
        type: 'action',
        tags: ['claude-code', 'tool-use', msg.toolName],
        importance: 0.4,
        source: {
          agentType: 'claude-code',
          sessionId: session.sessionId,
          toolName: msg.toolName,
        },
        createdAt: msg.timestamp || new Date().toISOString(),
      });
    }
  }
  
  return memories;
}

/**
 * Parse Hermes Agent session format
 */
async function parseHermesAgent(session: SessionData, container: string): Promise<UniversalMemory[]> {
  const memories: UniversalMemory[] = [];
  
  // Process observations
  if (Array.isArray(session.messages)) {
    for (const obs of session.messages) {
      memories.push({
        id: randomUUID(),
        containerId: container,
        content: obs.content || obs.observation || JSON.stringify(obs),
        type: mapHermesType(obs.type),
        tags: ['hermes-agent', obs.type || 'observation'],
        importance: obs.importance || 0.5,
        source: {
          agentType: 'hermes-agent',
          agentId: session.agentId,
          sessionId: session.sessionId,
        },
        createdAt: obs.timestamp || new Date().toISOString(),
      });
    }
  }
  
  return memories;
}

/**
 * Map Hermes type to universal type
 */
function mapHermesType(type?: string): UniversalMemory['type'] {
  switch (type) {
    case 'reflection': return 'reflection';
    case 'learning': return 'learning';
    case 'action': return 'action';
    case 'fact': return 'fact';
    default: return 'observation';
  }
}

/**
 * Parse OpenClaw JSONL format
 */
async function parseOpenClaw(session: SessionData, container: string): Promise<UniversalMemory[]> {
  const memories: UniversalMemory[] = [];
  
  if (Array.isArray(session.messages)) {
    for (const line of session.messages) {
      const type = line.type || 'observation';
      
      memories.push({
        id: randomUUID(),
        containerId: container,
        content: line.content || line.summary || line.message || JSON.stringify(line),
        type: mapOpenClawType(type),
        tags: ['openclaw', type],
        importance: line.importance || 0.5,
        source: {
          agentType: 'openclaw',
          sessionId: session.sessionId,
          toolName: line.tool,
        },
        createdAt: line.timestamp || new Date().toISOString(),
      });
    }
  }
  
  return memories;
}

/**
 * Map OpenClaw type to universal type
 */
function mapOpenClawType(type: string): UniversalMemory['type'] {
  switch (type) {
    case 'tool_use': return 'action';
    case 'user_message': return 'observation';
    case 'error': return 'context';
    case 'pattern': return 'insight';
    default: return 'observation';
  }
}

/**
 * Parse OpenFang log format
 */
async function parseOpenFang(session: SessionData, container: string): Promise<UniversalMemory[]> {
  const memories: UniversalMemory[] = [];
  
  if (Array.isArray(session.messages)) {
    for (const log of session.messages) {
      const level = log.level?.toLowerCase() || 'info';
      
      if (level === 'error') {
        memories.push({
          id: randomUUID(),
          containerId: container,
          content: log.message || log.msg,
          type: 'context',
          tags: ['openfang', 'error', level],
          importance: 0.8,
          source: {
            agentType: 'openfang',
            sessionId: session.sessionId,
          },
          createdAt: log.timestamp || new Date().toISOString(),
        });
      } else if (level === 'info' || level === 'debug') {
        memories.push({
          id: randomUUID(),
          containerId: container,
          content: log.message || log.msg,
          type: 'observation',
          tags: ['openfang', level],
          importance: 0.3,
          source: {
            agentType: 'openfang',
            sessionId: session.sessionId,
          },
          createdAt: log.timestamp || new Date().toISOString(),
        });
      }
    }
  }
  
  return memories;
}

/**
 * Parse generic JSON format
 */
async function parseUniversalJson(session: SessionData, container: string): Promise<UniversalMemory[]> {
  const memories: UniversalMemory[] = [];
  
  // Try to extract any useful data from the session
  if (session.messages && Array.isArray(session.messages)) {
    for (const msg of session.messages) {
      const content = typeof msg === 'string' ? msg : msg.content || msg.text || JSON.stringify(msg);
      
      if (content) {
        memories.push({
          id: randomUUID(),
          containerId: container,
          content,
          type: 'observation',
          tags: ['universal', 'imported'],
          importance: 0.5,
          source: {
            agentType: 'universal',
            sessionId: session.sessionId,
          },
          createdAt: new Date().toISOString(),
        });
      }
    }
  }
  
  return memories;
}

/**
 * Ingest a session from any agent
 */
export async function ingestSession(request: IngestSessionRequest): Promise<IngestSessionResponse> {
  const startTime = Date.now();
  const errors: string[] = [];
  let ingested = 0;
  let duplicated = 0;
  let failed = 0;
  
  const container = request.container || 'default';
  await ensureProject(container);
  
  // Detect or use specified format
  const format = request.session.format === 'auto-detect' 
    ? detectFormat(request.session)
    : request.session.format;
  
  logger.info(`Ingesting session in ${format} format for container ${container}`);
  
  try {
    // Parse based on format
    let memories: UniversalMemory[];
    
    switch (format) {
      case 'claude-code':
        memories = await parseClaudeCode(request.session, container);
        break;
      case 'hermes-agent':
        memories = await parseHermesAgent(request.session, container);
        break;
      case 'openclaw-jsonl':
        memories = await parseOpenClaw(request.session, container);
        break;
      case 'openfang-log':
        memories = await parseOpenFang(request.session, container);
        break;
      default:
        memories = await parseUniversalJson(request.session, container);
    }
    
    // Store each memory
    for (const memory of memories) {
      try {
        await rememberMemory({
          content: memory.content,
          type: memory.type,
          project: container,
          tags: memory.tags,
          metadata: {
            ...memory.metadata,
            source: memory.source,
            originalId: memory.id,
          },
          source: memory.source.agentType,
        });
        ingested++;
      } catch (err) {
        failed++;
        errors.push((err as Error).message);
      }
    }
    
    logger.info(`Session ingested: ${ingested} memories, ${failed} failed`);
    
    return {
      ingested,
      duplicated,
      failed,
      errors,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Session ingestion failed:', error);
    return {
      ingested,
      duplicated,
      failed: failed + 1,
      errors: [...errors, (error as Error).message],
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Get supported formats
 */
export function getSupportedFormats(): SessionFormat[] {
  return [
    'claude-code',
    'hermes-agent', 
    'openclaw-jsonl',
    'openfang-log',
    'universal-json',
    'auto-detect',
  ];
}
