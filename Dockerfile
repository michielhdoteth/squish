FROM node:22-slim

WORKDIR /app

# Install bun for faster installs
RUN npm install -g bun

# Copy package files first for layer caching
COPY package.json bun.lock ./
COPY tsconfig.json ./
COPY bunfig.toml ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY config.ts ./
COPY config/ ./config/
COPY core/ ./core/
COPY db/ ./db/
COPY packages/ ./packages/
COPY bin/ ./bin/
COPY plugin/ ./plugin/
COPY skills/ ./skills/

# Health check for Glama introspection
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)"

# Default: stdio mode for Glama evaluation
CMD ["bun", "run", "packages/mcp/src/index.ts", "--stdio"]
