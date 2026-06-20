/**
 * Export Command - Export memories as portable formats
 * 
 * Usage: squish export [--format=markdown|json|csv] [--place=<place>] [--project=<path>]
 * 
 * From research: Memory-as-plain-text (Obsidian pattern) enables portability across AI tools
 */

import { Command } from 'commander';
import { search } from '../../../../core/memory/memories.js';

export function registerExportCommand(program: Command) {
  program
    .command('export')
    .description('Export memories as portable formats (markdown, json, csv)')
    .option('-f, --format <format>', 'Export format: markdown, json, csv', 'markdown')
    .option('--place <place>', 'Filter by place (inbox, ref, wip, sandbox, board, sparks, archive)')
    .option('-l, --limit <number>', 'Max memories to export', '100')
    .option('-p, --project <project>', 'Project path')
    .option('--actor-user <user>', 'Actor user identity for team-mode ACL')
    .option('--actor-agent <agent>', 'Actor agent identity for team-mode ACL')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (options: any) => {
      try {
        const format = options.format?.toLowerCase() || 'markdown';
        const limit = parseInt(options.limit) || 100;
        
        // Search all memories (filtered by place if specified)
        const memories = await search({
          query: '*', // Get all
          project: options.project,
          limit,
          placeType: options.place,
          actorUser: options.actorUser,
          actorAgent: options.actorAgent,
        });
        
        if (memories.length === 0) {
          console.log('No memories to export');
          return;
        }
        
        const output = formatMemories(memories, format);
        
        if (options.output) {
          const fs = await import('node:fs');
          fs.writeFileSync(options.output, output);
          console.log(`Exported ${memories.length} memories to ${options.output}`);
        } else {
          console.log(output);
        }
      } catch (error) {
        console.error(JSON.stringify({ 
          ok: false, 
          error: error instanceof Error ? error.message : String(error) 
        }));
        process.exit(1);
      }
    });
}

function formatMemories(memories: any[], format: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(memories.map(m => ({
        id: m.id,
        type: m.type,
        content: m.content,
        summary: m.summary,
        tags: m.tags,
        importance: m.importance,
        confidenceLevel: m.confidenceLevel,
        place: m.place,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt
      })), null, 2);
    
    case 'csv':
      const headers = ['id', 'type', 'content', 'summary', 'tags', 'importance', 'confidenceLevel', 'place', 'createdAt', 'updatedAt'];
      const rows = memories.map(m => [
        m.id,
        m.type,
        `"${(m.content || '').replace(/"/g, '""')}"`,
        `"${(m.summary || '').replace(/"/g, '""')}"`,
        `"${(m.tags || []).join(';')}"`,
        m.importance || '',
        m.confidenceLevel || '',
        m.place || '',
        m.createdAt || '',
        m.updatedAt || ''
      ].join(','));
      return [headers.join(','), ...rows].join('\n');
    
    case 'markdown':
    default:
      return memories.map(m => {
        const lines = [
          `## ${m.summary || m.content.slice(0, 60)}${m.content.length > 60 ? '...' : ''}`,
          '',
          `**Type:** ${m.type || 'unknown'}`,
          m.place ? `**Place:** ${m.place}` : null,
          m.confidenceLevel ? `**Confidence:** ${m.confidenceLevel}` : null,
          m.importance ? `**Importance:** ${m.importance.toFixed(2)}` : null,
          m.tags?.length ? `**Tags:** ${m.tags.join(', ')}` : null,
          '',
          m.content
        ].filter(Boolean);
        
        if (m.createdAt) {
          lines.push('', `*Created: ${new Date(m.createdAt).toISOString()}*`);
        }
        
        return lines.join('\n');
      }).join('\n\n---\n\n');
  }
}
