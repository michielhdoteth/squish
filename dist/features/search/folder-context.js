/**
 * Folder Context Generation
 * Generates and maintains per-folder CLAUDE.md files with session summaries
 */
import { promises as fs } from 'fs';
import path from 'path';
import { getRecentConversations } from './conversations.js';
function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}
function generateClaudeMdContent(data) {
    const lines = [
        `# Squish Context - ${data.projectName}`,
        '',
        '<squish-context>',
        '',
        `**Project**: ${data.projectPath}`
    ];
    if (data.gitRemote) {
        const gitInfo = data.gitBranch ? `${data.gitRemote} @ ${data.gitBranch}` : data.gitRemote;
        lines.push(`**Git**: ${gitInfo}`);
    }
    lines.push(`**Last Updated**: ${data.lastUpdated}`, '');
    if (data.recentConversations.length > 0) {
        lines.push('## Recent Activity');
        for (const conv of data.recentConversations) {
            const date = formatDate(conv.timestamp);
            const preview = conv.content.substring(0, 80).replace(/\n/g, ' ');
            lines.push(`- [${date}] ${preview}...`);
        }
        lines.push('');
    }
    if (data.keyObservations.length > 0) {
        lines.push('## Key Observations');
        for (const obs of data.keyObservations) {
            lines.push(`- ${obs.summary} (${obs.type})`);
        }
        lines.push('');
    }
    lines.push('## Previous Context', '*(Managed by Squish - do not edit this section)*', '', '</squish-context>', '', '<!-- You can add custom notes and project context here -->', '');
    return lines.join('\n');
}
async function collectFolderContextData(projectPath) {
    const recentConversations = await getRecentConversations({ n: 5, project: projectPath })
        .catch(() => []);
    return {
        projectPath,
        projectName: path.basename(projectPath),
        recentConversations: (recentConversations || []).map((conv) => ({
            content: conv?.summary || '',
            timestamp: conv?.startedAt?.toISOString() || new Date().toISOString()
        })),
        keyObservations: [],
        lastUpdated: new Date().toISOString()
    };
}
async function preserveUserContent(claudeMdPath) {
    try {
        const existingContent = await fs.readFile(claudeMdPath, 'utf-8');
        const match = existingContent.match(/<\/squish-context>([\s\S]*)/);
        return match ? match[1] : '';
    }
    catch {
        return '';
    }
}
export async function generateAndInjectFolderContext(projectPath) {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    const contextData = await collectFolderContextData(projectPath);
    const newContent = generateClaudeMdContent(contextData);
    const userContent = await preserveUserContent(claudeMdPath);
    await fs.writeFile(claudeMdPath, newContent + userContent, 'utf-8');
    console.error(`[squish] Updated folder context: ${claudeMdPath}`);
}
export async function readFolderContext(projectPath) {
    try {
        const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
        const content = await fs.readFile(claudeMdPath, 'utf-8');
        const contextMatch = content.match(/<squish-context>([\s\S]*?)<\/squish-context>/);
        if (!contextMatch)
            return null;
        const contextContent = contextMatch[1];
        const projectPathMatch = contextContent.match(/\*\*Project\*\*:\s*(.+)/);
        const gitMatch = contextContent.match(/\*\*Git\*\*:\s*(.+)/);
        const updatedMatch = contextContent.match(/\*\*Last Updated\*\*:\s*(.+)/);
        return {
            projectPath: projectPathMatch?.[1] || projectPath,
            projectName: path.basename(projectPath),
            gitRemote: gitMatch?.[1].split(' @')[0],
            gitBranch: gitMatch?.[1].split('@ ')[1],
            recentConversations: [],
            keyObservations: [],
            lastUpdated: updatedMatch?.[1] || new Date().toISOString()
        };
    }
    catch {
        return null;
    }
}
export async function injectFolderContextIntoSession(projectPath) {
    try {
        const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
        const content = await fs.readFile(claudeMdPath, 'utf-8');
        const match = content.match(/<squish-context>([\s\S]*?)<\/squish-context>/);
        if (match) {
            return `\n<squish-folder-context>\n${match[1]}\n</squish-folder-context>\n`;
        }
    }
    catch {
        // File doesn't exist or can't be read
    }
    return '';
}
//# sourceMappingURL=folder-context.js.map