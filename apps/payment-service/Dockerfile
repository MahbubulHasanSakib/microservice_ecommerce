# =============================================================================
# Payment Service Dockerfile — Multi-stage production build
# =============================================================================

# ---- Stage 1: Builder ----
FROM node:24-alpine AS builder
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy dependencies
COPY libs/shared/ ./libs/shared/
COPY apps/payment-service/ ./apps/payment-service/

# Install all dependencies
RUN npm ci --workspace=@ecommerce/payment-service --workspace=@ecommerce/shared --include-workspace-root

# Generate Prisma Client
WORKDIR /app/apps/payment-service
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
COPY apps/payment-service/package.json ./apps/payment-service/package.json
COPY apps/payment-service/prisma ./apps/payment-service/prisma

# Install production dependencies only
RUN npm ci \
    --workspace=@ecommerce/payment-service \
    --workspace=@ecommerce/shared \
    --include-workspace-root \
    --omit=dev

# Generate Prisma Client in production environment
WORKDIR /app/apps/payment-service
RUN npx prisma generate
WORKDIR /app

# Copy compiled output
COPY --from=builder /app/apps/payment-service/dist ./apps/payment-service/dist

USER appuser

EXPOSE 3005 3015

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3015/health || exit 1

CMD ["node", "apps/payment-service/dist/main.js"]
