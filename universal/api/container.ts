/**
 * Container Management
 * 
 * Containers scope memories to projects, users, clients, or arbitrary groups.
 * Similar to Supermemory's containerTag system.
 */

import { ensureProject } from '../../core/projects.js';
import type { Container } from '../types.js';

/**
 * Get or create a container by name
 */
export async function getContainer(name: string): Promise<Container | null> {
  const project = await ensureProject(name);
  if (!project) return null;
  
  return {
    id: project.id,
    name: project.name,
    type: 'project',
    metadata: project.metadata || {},
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Create a new container
 */
export async function createContainer(params: {
  name: string;
  type?: Container['type'];
  metadata?: Record<string, unknown>;
}): Promise<Container> {
  const project = await ensureProject(params.name);
  
  if (project) {
    return {
      id: project.id,
      name: project.name,
      type: params.type || 'project',
      metadata: params.metadata || {},
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  
  // If project doesn't exist, this will create it
  // The ensureProject function handles creation
  const newProject = await ensureProject(params.name);
  
  return {
    id: newProject?.id || params.name,
    name: params.name,
    type: params.type || 'project',
    metadata: params.metadata || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * List all containers
 */
export async function listContainers(): Promise<Container[]> {
  // TODO: Implement getAllProjects function in core/projects.ts
  const projects = await getAllProjects();
  
  return projects.map(p => ({
    id: p.id,
    name: p.name,
    type: 'project' as const,
    metadata: p.metadata || {},
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}