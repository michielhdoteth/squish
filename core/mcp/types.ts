import { z } from 'zod';

export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.any()),
});

export const MCPToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.any()),
});

export const MCPToolResultSchema = z.object({
  content: z.array(z.object({
    type: z.enum(['text', 'image', 'resource']),
    text: z.string().optional(),
    data: z.string().optional(),
    mimeType: z.string().optional(),
  })),
  isError: z.boolean().optional(),
});

export const MCPCapabilitiesSchema = z.object({
  tools: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
  resources: z.object({
    subscribe: z.boolean().optional(),
    listChanged: z.boolean().optional(),
  }).optional(),
  prompts: z.object({
    listChanged: z.boolean().optional(),
  }).optional(),
});

export const MCPInitializeRequestSchema = z.object({
  protocolVersion: z.string(),
  capabilities: MCPCapabilitiesSchema,
  clientInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
});

export const MCPInitializeResponseSchema = z.object({
  protocolVersion: z.string(),
  capabilities: MCPCapabilitiesSchema,
  serverInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
});

export type MCPTool = z.infer<typeof MCPToolSchema>;
export type MCPToolCall = z.infer<typeof MCPToolCallSchema>;
export type MCPToolResult = z.infer<typeof MCPToolResultSchema>;
export type MCPCapabilities = z.infer<typeof MCPCapabilitiesSchema>;
export type MCPInitializeRequest = z.infer<typeof MCPInitializeRequestSchema>;
export type MCPInitializeResponse = z.infer<typeof MCPInitializeResponseSchema>;

export interface MCPToolHandler {
  (args: Record<string, any>): Promise<MCPToolResult>;
}

export interface MCPToolDefinition {
  tool: MCPTool;
  handler: MCPToolHandler;
}
