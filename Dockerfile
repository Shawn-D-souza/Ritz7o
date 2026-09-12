# Stage 1: Build environment
FROM node:24-slim AS builder
# Install curl and agy for local development (dev server uses builder stage)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app
COPY package*.json ./
RUN npm ci 
COPY . .
RUN npm run build

# Stage 2: Production environment
FROM node:24-slim AS runner
# Install dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Copy the agy binary from the builder stage into the system path
COPY --from=builder /root/.local/bin/agy /usr/local/bin/agy

# Create app dir and assign to 'node' user before switching
RUN mkdir /app && chown node:node /app
WORKDIR /app

ENV NODE_ENV=production 
USER node

# Cache-optimized dependency installation
COPY --from=builder --chown=node:node /app/package*.json ./
RUN npm ci --omit=dev

# Code changes only invalidate this final layer
COPY --from=builder --chown=node:node /app/dist ./dist

# Wrap the node process with dumb-init
CMD ["dumb-init", "node", "dist/index.js"]