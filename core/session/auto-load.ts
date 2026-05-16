/** Session Auto-Load - Automatically load context when MCP session initializes */

import { logger } from '../logger.js';
import { config } from '../../config.js';
import { initializeCoreMemory, getCoreMemory } from '../ingestion/core-memory.js';
import { search } from '../memory/memories.js';
import { getProjectContext } from '../context/context.js';
import { getOrCreateProject } from '../projects.js';
import { AutoLoadConfig, AutoLoadResult, DEFAULT_AUTO_LOAD_CONFIG } from './types.js';
import { estimateTokens } from '../context/context-window.js';
import { getLatestProjectWorkingSetSummary } from './working-set.js';

export async function performAutoLoad(
  projectPath: string,
  customConfig?: Partial<AutoLoadConfig>
): Promise<AutoLoadResult> {
  const startTime = Date.now();
  const cfg: AutoLoadConfig = { ...DEFAULT_AUTO_LOAD_CONFIG, ...customConfig };
  const result: AutoLoadResult = {
    coreMemoryLoaded: false,
    memoriesLoaded: 0,
    projectContextLoaded: false,
    tokensUsed: 0,
    duration: 0,
    warnings: [],
  };

  if (!cfg.enabled) {
    result.warnings.push('Auto-load disabled by configuration');
    result.duration = Date.now() - startTime;
    return result;
  }

  try {
    const project = await getOrCreateProject(projectPath);
    if (!project) {
      result.warnings.push(`Failed to create/find project: ${projectPath}`);
      result.duration = Date.now() - startTime;
      return result;
    }
    const projectId = project.id;

try {
      const workingSetSummary = await getLatestProjectWorkingSetSummary(projectPath);
      if (workingSetSummary) {
        result.tokensUsed += estimateTokens(workingSetSummary);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.warnings.push(`Failed to load session working set: ${msg}`);
    }

    if (cfg.includeCoreMemory) {
      try {
        await initializeCoreMemory(projectId);
        const coreMemory = await getCoreMemory(projectId);
        if (coreMemory) {
          result.coreMemoryLoaded = true;
          const coreMemoryText = Object.values(coreMemory).join('\n');
          result.tokensUsed += estimateTokens(coreMemoryText);
          logger.info(`[AutoLoad] Core memory loaded for project ${projectId}`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.warnings.push(`Failed to load core memory: ${msg}`);
        logger.warn(`[AutoLoad] Failed to load core memory: ${msg}`);
      }
    }

    if (cfg.includeRecentMemories && cfg.recentMemoryCount > 0) {
      try {
        const recentMemories = await search({
          query: '',
          project: projectPath,
          limit: cfg.recentMemoryCount,
        });

        if (recentMemories && recentMemories.length > 0) {
          const importantMemories = recentMemories.filter(
            (m: any) => (m.importanceScore ?? 50) >= cfg.importanceThreshold
          );

          result.memoriesLoaded = importantMemories.length;

          for (const memory of importantMemories) {
            result.tokensUsed += estimateTokens(memory.content || '');
          }

          logger.info(`[AutoLoad] Loaded ${result.memoriesLoaded} high-importance memories`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.warnings.push(`Failed to load recent memories: ${msg}`);
        logger.warn(`[AutoLoad] Failed to load recent memories: ${msg}`);
      }
    }

    if (cfg.includeProjectContext) {
      try {
        const context = await getProjectContext({
          project: projectPath,
          include: ['memories', 'observations'],
          limit: 5,
        });

        if (context) {
          result.projectContextLoaded = true;
          result.tokensUsed += estimateTokens(JSON.stringify(context));
          logger.info('[AutoLoad] Project context loaded');
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.warnings.push(`Failed to load project context: ${msg}`);
        logger.warn(`[AutoLoad] Failed to load project context: ${msg}`);
      }
    }

    result.duration = Date.now() - startTime;
    logger.info(`[AutoLoad] Complete: ${result.memoriesLoaded} memories, ${result.tokensUsed} tokens, ${result.duration}ms`);

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Auto-load failed: ${msg}`);
    result.duration = Date.now() - startTime;
    logger.error(`[AutoLoad] Failed: ${msg}`);
    return result;
  }
}

export function getAutoLoadConfig(): AutoLoadConfig {
  return {
    enabled: config.sessionAutoLoadEnabled,
    includeCoreMemory: true,
    includeRecentMemories: true,
    recentMemoryCount: config.sessionAutoLoadRecentCount,
    importanceThreshold: config.sessionAutoLoadImportanceThreshold,
    includeProjectContext: true,
  };
}

export function shouldAutoLoad(): boolean {
  return config.sessionAutoLoadEnabled;
}
