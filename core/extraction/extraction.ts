/**
 * Auto-Extraction Pipeline
 *
 * Uses LLM to analyze accumulated memories and extract:
 * - Reusable skills (SOPs) from repeated patterns
 * - Wiki pages from accumulated knowledge
 * - Strategy documents from decision patterns
 *
 * Run periodically or on-demand to keep skills/wiki fresh.
 */

// ─── Types ────────────────────────────────────────────────────────

interface ExtractionResult {
  type: "skill" | "wiki" | "strategy";
  confidence: number;
  data: any;
}

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// ─── LLM Client ───────────────────────────────────────────────────

async function callLLM(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  const apiUrl = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
  const apiKey = process.env.LLM_API_KEY || "";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM API error: ${res.status}`);
  }

  const data = (await res.json()) as LLMResponse;
  return data.choices[0]?.message?.content || "";
}

// ─── Skill Extraction ─────────────────────────────────────────────

const SKILL_EXTRACTION_SYSTEM = `You are a knowledge extraction agent. Your job is to analyze conversations and extract reusable skills (Standard Operating Procedures).

When given a set of related memories/conversations, extract:
1. A clear skill name
2. What type of skill it is (workflow, troubleshooting, checklist, template, playbook)
3. Step-by-step instructions
4. When to use this skill (triggers)
5. Prerequisites and required resources
6. Success criteria

Respond in JSON format:
{
  "name": "Skill Name",
  "type": "workflow|troubleshooting|checklist|template|playbook",
  "description": "Brief description of what this skill does",
  "steps": ["Step 1", "Step 2", ...],
  "triggers": ["When X happens", "When Y is needed", ...],
  "prerequisites": ["Prerequisite 1", ...],
  "resources": ["Resource 1", ...],
  "success_criteria": ["Criteria 1", ...],
  "confidence": 0.85
}

Only extract skills with confidence > 0.7. If the memories don't contain a clear, reusable pattern, return null.`;

/**
 * Extract a skill from a cluster of related memories
 */
export async function extractSkillFromMemories(
  memories: Array<{ content: string; type: string; tags: string[] }>,
  projectId: string
): Promise<ExtractionResult | null> {
  const memoryText = memories
    .map((m, i) => `[Memory ${i + 1}] (${m.type}) ${m.content}`)
    .join("\n\n");

  const prompt = `Analyze these related memories and extract a reusable skill (SOP) if a clear pattern exists:

${memoryText}

Extract a skill only if:
- The memories describe a repeatable process
- There are clear steps that can be followed
- The pattern would be useful to other agents or future sessions

Return null (just the word "null") if no clear skill can be extracted.`;

  try {
    const response = await callLLM(prompt, SKILL_EXTRACTION_SYSTEM);

    if (response.trim() === "null" || !response.includes("{")) {
      return null;
    }

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const extracted = JSON.parse(jsonMatch[0]);

    if (!extracted.name || !extracted.steps || extracted.confidence < 0.7) {
      return null;
    }

    return {
      type: "skill",
      confidence: extracted.confidence,
      data: {
        name: extracted.name,
        type: extracted.type || "workflow",
        description: extracted.description || "",
        steps: extracted.steps,
        triggers: extracted.triggers || [],
        prerequisites: extracted.prerequisites || [],
        resources: extracted.resources || [],
        validation_rules: {
          success_criteria: extracted.success_criteria || [],
        },
        tags: memories.flatMap((m) => m.tags).filter((t) => t !== "auto-captured"),
        source_memory_ids: memories.map((m) => (m as any).id).filter(Boolean),
      },
    };
  } catch {
    return null;
  }
}

// ─── Wiki Extraction ──────────────────────────────────────────────

const WIKI_EXTRACTION_SYSTEM = `You are a documentation agent. Your job is to analyze accumulated knowledge and create structured wiki pages.

When given a set of related memories on a topic, create a wiki page that:
1. Has a clear, descriptive title
2. Summarizes the key knowledge
3. Includes relevant details and examples
4. Links to related topics using [[Wiki Link]] syntax
5. Is organized with clear sections

Respond in JSON format:
{
  "title": "Page Title",
  "type": "article|reference|guide|decision|note",
  "content": "Markdown content with [[wikilinks]]",
  "tags": ["tag1", "tag2"],
  "related_topics": ["Topic 1", "Topic 2"],
  "confidence": 0.85
}

Only create wiki pages with confidence > 0.7.`;

/**
 * Create a wiki page from accumulated knowledge
 */
export async function extractWikiFromMemories(
  memories: Array<{ content: string; type: string; tags: string[] }>,
  topic: string,
  projectId: string
): Promise<ExtractionResult | null> {
  const memoryText = memories
    .map((m, i) => `[Memory ${i + 1}] (${m.type}) ${m.content}`)
    .join("\n\n");

  const prompt = `Create a wiki page about "${topic}" based on these accumulated memories:

${memoryText}

The page should:
- Synthesize the knowledge into clear documentation
- Use [[Wiki Link]] syntax for related topics
- Be organized with headers and sections
- Include practical examples where relevant

Return null (just the word "null") if the memories don't contain enough information for a useful wiki page.`;

  try {
    const response = await callLLM(prompt, WIKI_EXTRACTION_SYSTEM);

    if (response.trim() === "null" || !response.includes("{")) {
      return null;
    }

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const extracted = JSON.parse(jsonMatch[0]);

    if (!extracted.title || !extracted.content || extracted.confidence < 0.7) {
      return null;
    }

    return {
      type: "wiki",
      confidence: extracted.confidence,
      data: {
        title: extracted.title,
        type: extracted.type || "article",
        content: extracted.content,
        tags: extracted.tags || [],
        source_memory_ids: memories.map((m) => (m as any).id).filter(Boolean),
      },
    };
  } catch {
    return null;
  }
}

// ─── Batch Extraction ─────────────────────────────────────────────

/**
 * Run extraction on a batch of memories, clustering by topic
 */
export async function runExtractionBatch(
  memories: Array<{
    id: string;
    content: string;
    type: string;
    tags: string[];
    created_at: string;
  }>,
  projectId: string,
  db: any
): Promise<{
  skills_extracted: number;
  wiki_pages_extracted: number;
  errors: string[];
}> {
  const results = {
    skills_extracted: 0,
    wiki_pages_extracted: 0,
    errors: [] as string[],
  };

  // Group memories by shared tags (simple clustering)
  const tagGroups = new Map<string, typeof memories>();
  for (const mem of memories) {
    for (const tag of mem.tags) {
      if (tag === "auto-captured") continue;
      const group = tagGroups.get(tag) || [];
      group.push(mem);
      tagGroups.set(tag, group);
    }
  }

  // Process groups with 3+ memories (enough for pattern extraction)
  for (const [tag, group] of tagGroups) {
    if (group.length < 3) continue;

    // Try skill extraction
    try {
      const skill = await extractSkillFromMemories(group, projectId);
      if (skill) {
        // Check if similar skill already exists
        const existing = db.prepare(
          "SELECT id FROM skills WHERE project_id = ? AND name = ? LIMIT 1"
        ).get(projectId, skill.data.name);

        if (!existing) {
          // Insert new skill
          const skillId = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          db.prepare(`
            INSERT INTO skills (id, project_id, name, type, description, steps, triggers, prerequisites, resources, validation_rules, tags, version, status, visibility, usage_count, success_rate, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'draft', 'team', 0, 1.0, ?, ?)
          `).run(
            skillId,
            projectId,
            skill.data.name,
            skill.data.type,
            skill.data.description,
            JSON.stringify(skill.data.steps),
            JSON.stringify(skill.data.triggers),
            JSON.stringify(skill.data.prerequisites),
            JSON.stringify(skill.data.resources),
            JSON.stringify(skill.data.validation_rules),
            JSON.stringify(skill.data.tags),
            new Date().toISOString(),
            new Date().toISOString()
          );

          // Create initial version
          db.prepare(`
            INSERT INTO skill_versions (id, skill_id, version, steps, triggers, change_summary, created_at)
            VALUES (?, ?, 1, ?, ?, 'Auto-extracted from memory patterns', ?)
          `).run(
            `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            skillId,
            JSON.stringify(skill.data.steps),
            JSON.stringify(skill.data.triggers),
            new Date().toISOString()
          );

          // Link source memories
          for (const memId of skill.data.source_memory_ids) {
            if (memId) {
              db.prepare(`
                INSERT INTO skill_memory_links (id, skill_id, memory_id, relationship, created_at)
                VALUES (?, ?, ?, 'extracted_from', ?)
              `).run(
                `sml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                skillId,
                memId,
                new Date().toISOString()
              );
            }
          }

          results.skills_extracted++;
        }
      }
    } catch (e: any) {
      results.errors.push(`Skill extraction for "${tag}": ${e.message}`);
    }

    // Try wiki extraction
    try {
      const wiki = await extractWikiFromMemories(group, tag, projectId);
      if (wiki) {
        // Wiki pages are created via the API
        results.wiki_pages_extracted++;
      }
    } catch (e: any) {
      results.errors.push(`Wiki extraction for "${tag}": ${e.message}`);
    }
  }

  return results;
}

// ─── Scheduled Extraction ─────────────────────────────────────────

/**
 * Run extraction on recent memories (last N hours)
 */
export async function runScheduledExtraction(
  db: any,
  projectId: string,
  hoursBack: number = 24
): Promise<void> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  // Get recent memories with tags
  const memories = db.prepare(`
    SELECT * FROM memories
    WHERE project_id = ? AND created_at > ? AND tags != '[]'
    ORDER BY created_at DESC
  `).all(projectId, cutoff);

  if (memories.length < 5) return;

  const results = await runExtractionBatch(memories, projectId, db);

  console.log(
    `[extraction] Project ${projectId}: ${results.skills_extracted} skills, ${results.wiki_pages_extracted} wiki pages extracted`
  );

  if (results.errors.length > 0) {
    console.error("[extraction] Errors:", results.errors);
  }
}
