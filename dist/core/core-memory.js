/**
 * Core Memory Service - Always-in-context memory (Tier 1)
 *
 * Small, persistent, always-visible memory block (< 2KB total).
 * This memory is automatically injected into every agent interaction.
 */
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { getSchema } from '../db/schema.js';
import { createDatabaseClient } from './database.js';
const MAX_TOTAL_SIZE_BYTES = 2048; // 2KB limit
const MAX_SECTION_SIZE_BYTES = 1024; // 1KB per section
/**
 * Initialize core memory for a project
 */
export async function initializeCoreMemory(projectId, userId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { coreMemory } = schema;
    const sections = ['persona', 'user_info', 'project_context', 'working_notes'];
    for (const section of sections) {
        const existing = await db
            .select()
            .from(coreMemory)
            .where(and(eq(coreMemory.projectId, projectId), eq(coreMemory.section, section)))
            .limit(1);
        if (existing.length === 0) {
            await db.insert(coreMemory).values({
                projectId: projectId,
                userId: userId,
                section,
                content: '',
                sizeBytes: 0,
                version: 1,
            });
        }
    }
}
/**
 * Get all core memory sections for a project
 */
export async function getCoreMemory(projectId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { coreMemory } = schema;
    const sections = await db
        .select()
        .from(coreMemory)
        .where(eq(coreMemory.projectId, projectId));
    const content = {
        persona: '',
        user_info: '',
        project_context: '',
        working_notes: '',
    };
    for (const section of sections) {
        const key = section.section;
        content[key] = section.content || '';
    }
    return content;
}
/**
 * Get a specific core memory section
 */
export async function getCoreMemorySection(projectId, section) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { coreMemory } = schema;
    const result = await db
        .select()
        .from(coreMemory)
        .where(and(eq(coreMemory.projectId, projectId), eq(coreMemory.section, section)))
        .limit(1);
    return result[0]?.content || '';
}
/**
 * Update (replace) a core memory section
 */
export async function editCoreMemorySection(projectId, section, content) {
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    // Check section size limit
    if (sizeBytes > MAX_SECTION_SIZE_BYTES) {
        return {
            success: false,
            message: `Content exceeds section limit of ${MAX_SECTION_SIZE_BYTES} bytes (got ${sizeBytes} bytes)`,
        };
    }
    // Check total size limit
    const totalSize = await getTotalCoreMemorySize(projectId, section, sizeBytes);
    if (totalSize > MAX_TOTAL_SIZE_BYTES) {
        return {
            success: false,
            message: `Total core memory would exceed ${MAX_TOTAL_SIZE_BYTES} bytes (would be ${totalSize} bytes)`,
        };
    }
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { coreMemory } = schema;
    await db
        .update(coreMemory)
        .set({
        content,
        sizeBytes,
        version: db.raw?.('version + 1') || 1,
        updatedAt: new Date(),
    })
        .where(and(eq(coreMemory.projectId, projectId), eq(coreMemory.section, section)));
    return { success: true, sizeBytes };
}
/**
 * Append content to a core memory section
 */
export async function appendCoreMemorySection(projectId, section, text) {
    const currentContent = await getCoreMemorySection(projectId, section);
    const newContent = currentContent ? `${currentContent}\n${text}` : text;
    return editCoreMemorySection(projectId, section, newContent);
}
/**
 * Replace text within a core memory section
 */
export async function replaceCoreMemoryText(projectId, section, oldText, newText) {
    const currentContent = await getCoreMemorySection(projectId, section);
    if (!currentContent.includes(oldText)) {
        return {
            success: false,
            message: `Text "${oldText}" not found in section "${section}"`,
        };
    }
    const newContent = currentContent.replace(oldText, newText);
    return editCoreMemorySection(projectId, section, newContent);
}
/**
 * Get total size of core memory (excluding one section if calculating new size)
 */
async function getTotalCoreMemorySize(projectId, excludeSection, newSectionSize) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { coreMemory } = schema;
    const sections = await db
        .select()
        .from(coreMemory)
        .where(eq(coreMemory.projectId, projectId));
    let total = 0;
    for (const section of sections) {
        if (section.section === excludeSection) {
            total += newSectionSize || 0;
        }
        else {
            total += section.sizeBytes || 0;
        }
    }
    return total;
}
/**
 * Get core memory stats
 */
export async function getCoreMemoryStats(projectId) {
    const db = createDatabaseClient(await getDb());
    const schema = await getSchema();
    const { coreMemory } = schema;
    const sections = await db
        .select()
        .from(coreMemory)
        .where(eq(coreMemory.projectId, projectId));
    const totalBytes = sections.reduce((sum, s) => sum + (s.sizeBytes || 0), 0);
    return {
        totalBytes,
        maxBytes: MAX_TOTAL_SIZE_BYTES,
        usagePercent: (totalBytes / MAX_TOTAL_SIZE_BYTES) * 100,
        sections: sections.map((s) => ({
            section: s.section,
            sizeBytes: s.sizeBytes || 0,
            version: s.version || 1,
            updatedAt: s.updatedAt,
        })),
    };
}
/**
 * Estimate token count from text (rough approximation: 1 token ≈ 4 chars)
 */
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Get core memory formatted for context injection
 */
export async function formatCoreMemoryForInjection(projectId) {
    const content = await getCoreMemory(projectId);
    const stats = await getCoreMemoryStats(projectId);
    let formatted = `# Core Memory (Always-In-Context)\n\n`;
    if (content.persona) {
        formatted += `## Agent Persona\n${content.persona}\n\n`;
    }
    if (content.user_info) {
        formatted += `## User Information\n${content.user_info}\n\n`;
    }
    if (content.project_context) {
        formatted += `## Project Context\n${content.project_context}\n\n`;
    }
    if (content.working_notes) {
        formatted += `## Working Notes\n${content.working_notes}\n\n`;
    }
    formatted += `---\n`;
    formatted += `Core Memory Usage: ${stats.totalBytes}/${stats.maxBytes} bytes (${stats.usagePercent.toFixed(1)}%)\n`;
    formatted += `Estimated Tokens: ~${estimateTokens(formatted)}\n`;
    return formatted;
}
//# sourceMappingURL=core-memory.js.map