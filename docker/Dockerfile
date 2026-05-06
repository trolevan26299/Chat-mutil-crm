# ── Stage 1: Build main frontend ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# ── Stage 1b: Build admin frontend ──────────────────────────────────────────
FROM node:20-alpine AS admin-builder
WORKDIR /app/frontend-admin
COPY frontend-admin/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend-admin/ ./
RUN npm run build

# ── Stage 2: Build backend ───────────────────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
RUN npm run build

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-alpine
# tini: PID 1 xử lý SIGTERM đúng cách → graceful shutdown khi ECS stop task
# tzdata: timezone Asia/Ho_Chi_Minh
RUN apk add --no-cache tini tzdata

# Bảo mật: chạy bằng non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built artefacts
COPY --from=backend-builder /app/backend/dist          /app/dist
COPY --from=backend-builder /app/backend/node_modules  /app/node_modules
COPY --from=backend-builder /app/backend/prisma        /app/prisma
COPY --from=backend-builder /app/backend/package.json  /app/package.json
COPY --from=frontend-builder /app/frontend/dist        /app/static
COPY --from=admin-builder /app/frontend-admin/dist     /app/static-admin

RUN mkdir -p /var/lib/zalo-crm/files && \
    chown -R appuser:appgroup /app /var/lib/zalo-crm

ENV TZ=Asia/Ho_Chi_Minh
ENV NODE_ENV=production

# Health check — ALB và ECS dùng endpoint này
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

USER appuser
EXPOSE 3000

# tini làm PID 1 → forward SIGTERM → Node.js graceful shutdown
# KHÔNG chạy prisma db push ở đây — migration chạy qua CI/CD job riêng
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/app.js"]
