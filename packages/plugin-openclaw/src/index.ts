#!/usr/bin/env node

/**
 * OpenClaw Plugin: Squish Memory Integration
 * 
 * This plugin connects OpenClaw to Squish memory system:
 * - Tools: memory_search, memory_get
 * - Sync: Monitors workspace and stores memories
 * - Server: Can auto-start Squish MCP or connect to existing
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
interface PluginConfig {
  baseUrl?: string;
  autoStart?: boolean;
  sync?: {
    enabled: boolean;
    interval?: string;
    extraPaths?: string[];
  };
}

class OpenClawSquishPlugin {
  private config: PluginConfig;
  private client: Client | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private workspaceDir: string;
  private agentId: string;
  
  constructor(config: PluginConfig) {
    this.config = {
      baseUrl: "http://127.0.0.1:8767",
      autoStart: false,
      sync: { enabled: true, interval: "5m", extraPaths: [] },
      ...config
    };
    
    this.workspaceDir = process.env.OPENCLAW_WORKSPACE || process.cwd();
    this.agentId = process.env.OPENCLAW_AGENT_ID || "default";
    
    console.log("[SquishPlugin] Initializing with workspace:", this.workspaceDir);
  }
  
  async initialize(): Promise<void> {
    // Connect to Squish MCP
    await this.connect();
    
    // Start sync if enabled
    if (this.config.sync?.enabled) {
      this.startSync();
    }
  }
  
  private async connect(): Promise<void> {
    try {
      // If baseUrl is set, try HTTP connection
      if (this.config.baseUrl && this.config.baseUrl.startsWith("http")) {
        console.log("[SquishPlugin] Connecting via HTTP to", this.config.baseUrl);

        await this.connectViaHTTP(this.config.baseUrl);
      } else {
        // Use stdio for local spawn or existing Squish
        console.log("[SquishPlugin] Connecting via stdio");
        await this.connectViaStdio();
      }
      
      console.log("[SquishPlugin] ✓ Connected to Squish");
    } catch (error: any) {
      console.error("[SquishPlugin] ✗ Connection failed:", error?.message || error);
      throw error;
    }
  }
  
  private async connectViaStdio(): Promise<void> {
    this.client = new Client(
      { name: "openclaw-squish-plugin", version: "1.0.0" },
      { capabilities: {} }
    );
    
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.join(__dirname, "..", "..", "..", "dist", "commands", "mcp-server.cjs"), "--stdio"],
      env: {
        ...process.env,
        SQUISH_MODE: "local",
        SQUISH_DATA_DIR: path.join(os.homedir(), ".squish", "openclaw")
      }
    });
    
    await this.client.connect(transport);
    
    // Verify connection with health check
    const result = await this.client.callTool({ name: "squish_health", arguments: {} });
    console.log("[SquishPlugin] Health:", result.content);
  }
  
  private async connectViaHTTP(url: string): Promise<void> {
    // OpenClaw uses mcporter for MCP connections - no direct HTTP needed
    console.log(`[SquishPlugin] HTTP mode requested but not needed (mcporter handles MCP); using stdio`);
    await this.connectViaStdio();
  }
  
  private startSync(): void {
    if (this.config.sync?.interval) {
      const ms = this.parseInterval(this.config.sync.interval);
      this.syncInterval = setInterval(() => this.performSync(), ms);
    }
    
    // Initial sync
    setTimeout(() => this.performSync(), 1000);
  }
  
  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)([smhd])$/);
    if (!match) throw new Error(`Invalid interval: ${interval}`);
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 } as const;
    return value * (multipliers[unit as keyof typeof multipliers]);
  }
  
  private async performSync(): Promise<void> {
    try {
      console.log("[SquishPlugin] Starting workspace sync...");
      
      // Find markdown files in workspace
      const files = this.collectMarkdownFiles();
      console.log(`[SquishPlugin] Found ${files.length} files to sync`);
      
      for (const file of files) {
        await this.syncFile(file);
      }
      
      console.log("[SquishPlugin] Sync complete");
    } catch (error: any) {
      console.error("[SquishPlugin] Sync error:", error?.message || error);
    }
  }
  
  private collectMarkdownFiles(): string[] {
    const files: string[] = [];
    const extraPaths = this.config.sync?.extraPaths || [];
    const searchPaths = [this.workspaceDir, ...extraPaths.map(p => path.join(this.workspaceDir, p))];
    
    for (const searchPath of searchPaths) {
      if (!fs.existsSync(searchPath)) continue;
      
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.name.endsWith(".md")) {
            files.push(fullPath);
          }
        }
      };
      walk(searchPath);
    }
    
    return files;
  }
  
  private async syncFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const relativePath = path.relative(this.workspaceDir, filePath);
      
      // Store as memory with metadata
      await this.client?.callTool({
        name: "squish_remember",
        arguments: {
          content: content,
          type: "context",
          tags: ["openclaw-sync", relativePath],
          metadata: {
            source: "openclaw-plugin",
            filePath: relativePath,
            agentId: this.agentId,
            syncedAt: new Date().toISOString()
          }
        }
       });
       
       console.log(`[SquishPlugin] Synced: ${relativePath}`);
     } catch (error: any) {
       console.error(`[SquishPlugin] Failed to sync ${filePath}:`, error?.message || error);
     }
  }
  
  // Tool implementation for OpenClaw to call
  async memory_search(params: { query: string; maxResults?: number; project?: string }): Promise<any> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }
    
    const result = await this.client.callTool({
      name: "squish_search",
      arguments: {
        query: params.query,
        limit: params.maxResults || 6,
        project: params.project || this.workspaceDir,
        mode: "hybrid"
      }
    }) as any;
    
    // Parse result
    const text = (result.content?.find((c: any) => c.type === "text")?.text || "{}");
    const parsed = JSON.parse(text);
    
    return {
      results: parsed.results || [],
      count: parsed.results?.length || 0,
      query: params.query
    };
  }
  
  async memory_get(params: { uri: string; lineRange?: number[]; overview?: boolean }): Promise<any> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }
    
    // Extract memory ID from URI
    const memoryId = this.extractMemoryId(params.uri);
    
    const result = await this.client.callTool({
      name: "squish_recall",
      arguments: { memoryId }
    }) as any;
    
    const text = (result.content?.find((c: any) => c.type === "text")?.text || "{}");
    const memory = JSON.parse(text);
    
    if (!memory) {
      throw new Error(`Memory not found: ${params.uri}`);
    }
    
    // Handle lineRange or overview
    let content = memory.content || "";
    if (params.lineRange && Array.isArray(params.lineRange)) {
      const lines = content.split("\n");
      const [start, end] = params.lineRange;
      content = lines.slice(start, end).join("\n");
    }
    
    if (params.overview) {
      content = content.substring(0, 500) + "...";
    }
    
    return {
      uri: params.uri,
      content,
      metadata: memory
    };
  }
  
  private extractMemoryId(uri: string): string {
    // Handle squish://memory/<id> format
    const match = uri.match(/^squish:\/\/memory\/([a-f0-9\-]+)$/);
    if (match) return match[1];
    
    // Handle direct UUID
    // Handle direct UUID
    if (/^[a-f0-9\-]{36}$/.test(uri)) return uri;
    
    throw new Error(`Invalid memory URI: ${uri}`);
  }
  
  public async shutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    
    console.log("[SquishPlugin] Shutdown complete");
  }
}

// Export for OpenClaw
export { OpenClawSquishPlugin };

// If run directly (testing), start plugin server
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config: PluginConfig = {
    baseUrl: process.env.SQUISH_BASE_URL,
    autoStart: process.env.SQUISH_AUTO_START === "true",
    sync: {
      enabled: true,
      interval: process.env.SQUISH_SYNC_INTERVAL || "5m"
    }
  };
  
  const plugin = new OpenClawSquishPlugin(config);
  
  process.on("SIGINT", () => plugin.shutdown());
  process.on("SIGTERM", () => plugin.shutdown());
  
  plugin.initialize().then(() => {
    console.log("[SquishPlugin] Ready");
    // Keep process alive
    process.stdin?.resume();
  }).catch((err) => {
    console.error("[SquishPlugin] Failed to start:", err);
    process.exit(1);
  });
}
