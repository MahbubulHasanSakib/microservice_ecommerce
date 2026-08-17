# =============================================================================
# API Gateway Dockerfile — Multi-stage build
# =============================================================================
# Stage 1 (builder): Install ALL deps and compile TypeScript
# Stage 2 (production): Only the compiled output + production deps, non-root user
# =============================================================================

# ---- Stage 1: Builder ----
FROM node:24-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching.
# If only source code changes, npm ci is not re-run.
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy the packages this app depends on
COPY libs/shared/ ./libs/shared/
COPY apps/api-gateway/ ./apps/api-gateway/

# Install all dependencies (including devDeps needed for compilation)
RUN npm ci --workspace=@ecommerce/api-gateway --workspace=@ecommerce/shared --include-workspace-root

# Compile TypeScript
WORKDIR /app/apps/api-gateway
RUN npx nest build

# ---- Stage 2: Production ----
FROM node:24-alpine AS production
WORKDIR /app

# Create a non-root user for security — never run production as root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy workspace manifests for production install
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY libs/shared/ ./libs/shared/
COPY apps/api-gateway/package.json ./apps/api-gateway/package.json

# Install production dependencies only
RUN npm ci \
    --workspace=@ecommerce/api-gateway \
    --workspace=@ecommerce/shared \
    --include-workspace-root \
    --omit=dev

# Copy compiled output from builder stage
COPY --from=builder /app/apps/api-gateway/dist ./apps/api-gateway/dist

USER appuser

EXPOSE 3000

# Health check for Docker — uses the liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "apps/api-gateway/dist/main.js"]
