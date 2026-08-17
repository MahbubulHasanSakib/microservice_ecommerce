# =============================================================================
# User Service Dockerfile — Multi-stage build
# =============================================================================
# Same pattern as API Gateway, with the addition of:
# - Prisma client generation in the builder stage
# - Copying Prisma schema for runtime (needed by Prisma client at runtime)
# =============================================================================

# ---- Stage 1: Builder ----
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY libs/shared/ ./libs/shared/
COPY apps/user-service/ ./apps/user-service/

RUN npm ci \
    --workspace=@ecommerce/user-service \
    --workspace=@ecommerce/shared \
    --include-workspace-root

# Generate Prisma client before building — the build depends on generated types
WORKDIR /app/apps/user-service
RUN npx prisma generate

# Compile TypeScript
RUN npx nest build

# ---- Stage 2: Production ----
FROM node:24-alpine AS production
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY libs/shared/ ./libs/shared/
COPY apps/user-service/package.json ./apps/user-service/package.json

RUN npm ci \
    --workspace=@ecommerce/user-service \
    --workspace=@ecommerce/shared \
    --include-workspace-root \
    --omit=dev

# Copy compiled output
COPY --from=builder /app/apps/user-service/dist ./apps/user-service/dist

# Copy Prisma schema — required at runtime for the Prisma client
COPY --from=builder /app/apps/user-service/prisma ./apps/user-service/prisma

# Copy generated Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER appuser

# Expose both ports: TCP for microservice traffic, HTTP for health probes
EXPOSE 3001 3011

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3011/health || exit 1

CMD ["node", "apps/user-service/dist/main.js"]
