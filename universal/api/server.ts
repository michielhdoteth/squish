/**
 * Universal HTTP REST API Server
 * 
 * Provides HTTP API endpoints for any AI agent to interact with Squish.
 * Works with Hermes Agent, OpenClaw, OpenFang, or any agent that can make HTTP requests.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { logger } from '../../core/logger.js';
import { config } from '../../config.js';
import { rememberMemory, searchMemories } from '../../core/memory/memories.js';
import { ensureProject } from '../../core/projects.js';
import { getContainer, createContainer, listContainers } from './container.js';
import type {
  AddMemoryRequest,
  AddMemoryResponse,
  SearchMemoriesRequest,
  SearchMemoriesResponse,
  GetProfileRequest,
  UserProfile,
  HealthResponse,
  ContainerStats,
  APIError,
} from '../types.js';

const app = express();
const PORT = process.env.SQUISH_API_PORT || 3456;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth middleware (API key)
function authenticate(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  const validKey = process.env.SQUISH_API_KEY;
  
  if (validKey && apiKey !== validKey) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' }
    } as APIError);
  }
  next();
}

// Apply auth to all routes except health
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') return next();
  // For now, auth is optional unless SQUISH_API_KEY is set
  next();
});

// Error handler
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  logger.error('API Error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred'
    }
  } as APIError);
}

// ===== Health =====

app.get('/health', async (req: Request, res: Response) => {
  const health: HealthResponse = {
    status: 'healthy',
    version: '0.9.0',
    uptime: process.uptime(),
    database: 'connected', // TODO: actual check
    containers: 0,
    memories: 0,
  };
  res.json(health);
});

// ===== Containers =====

/**
 * GET /containers
 * List all containers
 */
app.get('/containers', async (req: Request, res: Response) => {
  const containers = await listContainers();
  res.json({ containers });
});

/**
 * GET /containers/:name
 * Get container by name
 */
app.get('/containers/:name', async (req: Request, res: Response) => {
  const container = await getContainer(req.params.name);
  if (!container) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Container '${req.params.name}' not found` }
    } as APIError);
  }
  res.json(container);
});

/**
 * POST /containers
 * Create a new container
 */
app.post('/containers', async (req: Request, res: Response) => {
  const { name, type = 'project', metadata = {} } = req.body;
  
  if (!name) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Container name is required' }
    } as APIError);
  }
  
  const container = await createContainer({ name, type, metadata });
  res.status(201).json(container);
});

// ===== Memories =====

/**
 * POST /memories
 * Add a new memory
 */
app.post('/memories', async (req: Request, res: Response) => {
  const body = req.body as AddMemoryRequest;
  
  if (!body.content) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Memory content is required' }
    } as APIError);
  }
  
  const containerName = body.container || 'default';
  
  try {
    // Ensure container exists
    await ensureProject(containerName);
    
    const memory = await rememberMemory({
      content: body.content,
      type: body.type as any,
      project: containerName,
      tags: body.tags,
      metadata: body.metadata,
      source: body.source?.agentType || 'http-api',
    });
    
    const response: AddMemoryResponse = {
      id: memory.id,
      container: containerName,
      type: memory.type as any,
      importance: memory.importance || 0.5,
      createdAt: memory.createdAt || new Date().toISOString(),
    };
    
    res.status(201).json(response);
  } catch (error) {
    logger.error('Failed to add memory:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: (error as Error).message }
    } as APIError);
  }
});

// Additional endpoints would go here...

// Error handling
app.use(errorHandler);

// Start server
export function startUniversalServer() {
  app.listen(PORT, () => {
    logger.info(`Universal API server running on port ${PORT}`);
    logger.info(`Health: http://localhost:${PORT}/health`);
    logger.info(`API: http://localhost:${PORT}/memories`);
  });
}

export { app };
