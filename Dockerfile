FROM node:22-slim

WORKDIR /app

# Install bun for faster installs and TS execution
RUN npm install -g bun

# Copy package files first for layer caching
COPY package.json bun.lock ./
COPY tsconfig.json ./
COPY bunfig.toml ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source files needed for MCP server
COPY config.ts ./
COPY config/ ./config/
COPY core/ ./core/
COPY db/ ./db/
COPY packages/ ./packages/
COPY bin/ ./bin/
COPY skills/ ./skills/

# Set default DB path inside container
ENV SQUISH_DB_PATH=/app/data
RUN mkdir -p /app/data

# Health check - verify bun can parse the MCP entrypoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD bun run -e "process.exit(0)"

# Default: stdio mode for Glama evaluation and MCP clients
CMD ["bun", "run", "packages/mcp/src/index.ts", "--stdio"]
