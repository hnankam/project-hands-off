# =============================================================================
# Multi-stage Dockerfile for CopilotKit Runtime Server
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Base image with Node.js
# -----------------------------------------------------------------------------
FROM node:20-alpine as base

# Set environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# -----------------------------------------------------------------------------
# Stage 2: Dependencies installation
# -----------------------------------------------------------------------------
FROM base as dependencies

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 3: Production image
# -----------------------------------------------------------------------------
FROM base as production

# Copy installed dependencies from dependencies stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create necessary directories
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start server with dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]

# -----------------------------------------------------------------------------
# Stage 4: Development image
# -----------------------------------------------------------------------------
FROM base as development

# Switch to root to install dev dependencies
USER root

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm install && npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create necessary directories
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Override CMD for development (with watch mode)
CMD ["npm", "run", "dev"]
