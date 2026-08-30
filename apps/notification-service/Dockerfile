# =============================================================================
# Notification Service Dockerfile — Multi-stage production build
# =============================================================================

# ---- Stage 1: Builder ----
FROM node:24-alpine AS builder
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy dependencies
COPY libs/shared/ ./libs/shared/
COPY apps/notification-service/ ./apps/notification-service/

# Install all dependencies
RUN npm ci --workspace=@ecommerce/notification-service --workspace=@ecommerce/shared --include-workspace-root

# Compile TypeScript
WORKDIR /app/apps/notification-service
RUN npx nest build

# ---- Stage 2: Production ----
FROM node:24-alpine AS production
WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy workspace manifests
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY libs/shared/ ./libs/shared/
COPY apps/notification-service/package.json ./apps/notification-service/package.json

# Install production dependencies only
RUN npm ci \
    --workspace=@ecommerce/notification-service \
    --workspace=@ecommerce/shared \
    --include-workspace-root \
    --omit=dev

# Copy compiled output
COPY --from=builder /app/apps/notification-service/dist ./apps/notification-service/dist

USER appuser

EXPOSE 3007

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3007/health || exit 1

CMD ["node", "apps/notification-service/dist/main.js"]
