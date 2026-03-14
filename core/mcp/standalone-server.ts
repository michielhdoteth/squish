import { MCPServer } from './server.js';
import { getAllSquishTools } from './tools.js';
import { logger } from '../logger.js';
import { config } from '../../config.js';

export class SquishMCPServer {
  private server: MCPServer;

  constructor() {
    this.server = new MCPServer(
      config.mcpServerPort || 8767,
      'squish-mcp',
      '0.9.0'
    );
  }

  async initialize(): Promise<void> {
    const tools = getAllSquishTools();
    this.server.registerTools(tools);
    logger.info(`Squish MCP server initialized with ${tools.length} tools`);
  }

  async start(): Promise<void> {
    await this.server.start();
    logger.info(`Squish MCP server started on port ${config.mcpServerPort || 8767}`);
  }

  async stop(): Promise<void> {
    await this.server.stop();
    logger.info('Squish MCP server stopped');
  }

  getServer(): MCPServer {
    return this.server;
  }
}

let serverInstance: SquishMCPServer | null = null;

export async function getSquishMCPServer(): Promise<SquishMCPServer> {
  if (!serverInstance) {
    serverInstance = new SquishMCPServer();
    await serverInstance.initialize();
  }
  return serverInstance;
}

export async function startMCPServer(): Promise<SquishMCPServer> {
  const server = await getSquishMCPServer();
  await server.start();
  return server;
}

export async function stopMCPServer(): Promise<void> {
  if (serverInstance) {
    await serverInstance.stop();
    serverInstance = null;
  }
}
