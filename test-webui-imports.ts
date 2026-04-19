// Test imports from webui/server.ts
import { logger } from './core/logger.js';
console.log('logger loaded');

import { getRecent } from './core/memory/memories.js';
console.log('getRecent loaded');

import { getObservations } from './core/ingestion/learnings.js';
console.log('getObservations loaded');

import { getAllProjects, requireProject } from './core/projects.js';
console.log('getAllProjects loaded');

import { checkDatabaseHealth, getDb } from './db/index.js';
console.log('checkDatabaseHealth loaded');

import { config } from './config.js';
console.log('config loaded');

import { isDatabaseUnavailableError } from './core/lib/utils.js';
console.log('isDatabaseUnavailableError loaded');

import { validateLimit } from './core/lib/validation.js';
console.log('validateLimit loaded');

console.log('ALL IMPORTS WORK!');