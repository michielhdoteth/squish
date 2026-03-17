#!/usr/bin/env node

/**
 * Claude Code Plugin: Squish Memory Integration
 * 
 * Hooks:
 * - SessionStart: Initialize memory session
 * - UserPromptSubmit: Capture user input as memory
 * - PostToolUse: Capture tool usage as observations
 * - SessionEnd: Summarize session
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

class ClaudeCodeSquishPlugin {
  private client: Client | null = null;
  private sessionId: string = "";
  private workspaceDir: string;
  private debounceTimer: NodeJS.Timeout | null = null;
  private recentMemories: string[] = [];
  
  constructor() {
    this.workspaceDir = process.env.CLAUDE_WORKING_DIRECTORY || process.cwd();
  }
  
  async initialize(): Promise<void> {
    console.log("[SquishPlugin] Claude Code plugin initializing...");
    
    // Connect to Squish MCP (assumes Squish is running)
    await this.connectToSquish();
    
    // Register hooks
    this.registerHooks();
    
    console.log("[SquishPlugin] ✓ Plugin ready");
  }
  
  private async connectToSquish(): Promise<void> {
    // Check if Squish is running as MCP server (stdio mode expected)
    // In Claude Code plugin mode, Squish should already be running
    // We'll spawn a separate connection or use existing if available
    
    this.client = new Client(
      { name: "claude-squish-plugin", version: "1.0.0" },
      { capabilities: {} }
    );
    
    // Connect via stdio to Squish MCP server
    // Squish should be running: squish-mcp --stdio
    const transport = new StdioClientTransport({
      command: process.env.SQUISH_COMMAND || "squish-mcp",
      args: ["--stdio"],
      env: {
        ...process.env,
        SQUISH_MODE: "local",
        SQUISH_DATA_DIR: process.env.SQUISH_DATA_DIR || path.join(os.homedir(), ".squish", "claude")
      }
    });
    
    try {
      await this.client.connect(transport);
      console.log("[SquishPlugin] Connected to Squish MCP");
    } catch (error: any) {
      console.error("[SquishPlugin] Failed to connect to Squish:", error?.message || error);
      throw error;
    }
  }
  
  private registerHooks(): void {
    // Hook: SessionStart
    this.onSessionStart();
    
    // Hook: UserPromptSubmit (via environment or stdin monitoring)
    this.onUserPromptSubmit();
    
    // Hook: PostToolUse
    this.onPostToolUse();
    
    // Hook: SessionEnd
    this.onSessionEnd();
  }
  
  private async onSessionStart(): Promise<void> {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log("[SquishPlugin] Session started:", this.sessionId);
    
    // Store session start observation
    await this.observe("session_start", "Claude Code session started", {
      sessionId: this.sessionId,
      workspace: this.workspaceDir,
      timestamp: new Date().toISOString()
    });
  }
  
  private async onUserPromptSubmit(): Promise<void> {
    // In Claude Code plugin system, we receive prompts via stdin
    // For this plugin implementation, we'll use a wrapper approach
    
    // Capture stdin lines as user input
    process.stdin?.on("data", async (data) => {
      const prompt = data.toString().trim();
      if (!prompt) return;
      
      // Debounce to avoid capturing intermediate states
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(async () => {
        await this.captureUserPrompt(prompt);
      }, 2000); // 2 second debounce
    });
  }
  
  private async captureUserPrompt(prompt: string): Promise<void> {
    try {
      console.log("[SquishPlugin] Capturing user prompt...");
      
      // Store as memory
      const result = await this.callTool("squish_remember", {
        content: prompt,
        type: "observation",
        tags: ["user-prompt", "claude-code"],
        project: this.workspaceDir,
        metadata: {
          source: "claude-plugin",
          sessionId: this.sessionId,
          capturedAt: new Date().toISOString()
        }
      });
      
      const memoryId = JSON.parse(result).id;
      this.recentMemories.push(memoryId);
      if (this.recentMemories.length > 50) this.recentMemories.shift();
      
      console.log("[SquishPlugin] ✓ Captured user prompt as memory:", memoryId);
    } catch (error: any) {
      console.error("[SquishPlugin] Failed to capture prompt:", error?.message || error);
    }
  }
  
  private async onPostToolUse(): Promise<void> {
    // Capture tool usage from Claude Code output
    // This would need integration with Claude Code's tool result streaming
    // Simplified: we'll rely on users to call observe manually or via prompts
  }
  
  private async onSessionEnd(): Promise<void> {
    console.log("[SquishPlugin] Session ending:", this.sessionId);
    
    try {
      // Generate session summary
      const summary = await this.summarizeSession();
      
      // Store summary observation
      await this.observe("session_summary", summary, {
        sessionId: this.sessionId,
        memoryCount: this.recentMemories.length,
        endedAt: new Date().toISOString()
      });
      
      console.log("[SquishPlugin] ✓ Session summary stored");
    } catch (error: any) {
      console.error("[SquishPlugin] Session end error:", error?.message || error);
    }
  }
  
  private async summarizeSession(): Promise<string> {
    // Generate a brief summary of this session's memories
    if (this.recentMemories.length === 0) {
      return "Empty session - no memories captured.";
    }
    
    return `Session ${this.sessionId}: Captured ${this.recentMemories.length} memories from user prompts and interactions.`;
  }
  
  private async observe(type: string, summary: string, details?: Record<string, any>): Promise<any> {
    return this.callTool("squish_observe", {
      type,
      action: "claude_code_event",
      summary,
      details,
      project: this.workspaceDir
    });
  }
  
  private async callTool(name: string, args: Record<string, any>): Promise<string> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }
    
    const result: any = await this.client.callTool({ name, arguments: args });
    const content = result?.content?.find((c: any) => c.type === "text")?.text || "{}";
    return content;
  }
  
  public async shutdown(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.client) await this.client.close();
    console.log("[SquishPlugin] Shutdown complete");
  }
}

// Plugin entry point for Claude Code hook system
export async function onSessionStart() {
  const plugin = new ClaudeCodeSquishPlugin();
  await plugin.initialize();
  return plugin;
}

export async function onUserPromptSubmit(prompt: string) {
  // This will be called by Claude Code hook system
  // For now, the instance manages its own stdin listener
}

export async function onSessionEnd() {
  // Cleanup handled by plugin instance
}

// Standalone test mode
if (process.argv[1] === pathToFileURL(__filename).pathname) {
  const plugin = new ClaudeCodeSquishPlugin();
  plugin.initialize().catch(console.error);
}
