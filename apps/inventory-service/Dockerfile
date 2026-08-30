# =============================================================================
# Inventory Service Dockerfile — Multi-stage production build
# =============================================================================

# ---- Stage 1: Builder ----
FROM node:24-alpine AS builder
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy dependencies
COPY libs/shared/ ./libs/shared/
COPY apps/inventory-service/ ./apps/inventory-service/

# Install all dependencies
RUN npm ci --workspace=@ecommerce/inventory-service --workspace=@ecommerce/shared --include-workspace-root

# Generate Prisma Client
WORKDIR /app/apps/inventory-service
RUN npx prisma generate

# Compile TypeScript
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
COPY apps/inventory-service/package.json ./apps/inventory-service/package.json
COPY apps/inventory-service/prisma ./apps/inventory-service/prisma

# Install production dependencies only
RUN npm ci \
    --workspace=@ecommerce/inventory-service \
    --workspace=@ecommerce/shared \
    --include-workspace-root \
    --omit=dev

# Generate Prisma Client in production environment
WORKDIR /app/apps/inventory-service
RUN npx prisma generate
WORKDIR /app

# Copy compiled output
COPY --from=builder /app/apps/inventory-service/dist ./apps/inventory-service/dist

USER appuser

EXPOSE 3006 3016

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3016/health || exit 1

CMD ["node", "apps/inventory-service/dist/main.js"]
