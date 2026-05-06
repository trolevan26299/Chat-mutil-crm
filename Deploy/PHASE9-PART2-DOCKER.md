# Phase 9 — Production Deployment Plan
## Phần 2: Docker & Container Configuration

---

## 1. Dockerfile Backend (Multi-stage, tối ưu size)

```dockerfile
# docker/Dockerfile.backend
# ── Stage 1: Dependencies ──────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production && cp -R node_modules prod_modules
RUN npm ci

# ── Stage 2: Build TypeScript ──────────────────────────
FROM deps AS builder
COPY backend/ .
RUN npm run build

# ── Stage 3: Production image ──────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Bảo mật: chạy bằng non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prod_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json .

# Prisma client cần schema để generate
RUN npx prisma generate

# Set timezone Việt Nam
ENV TZ=Asia/Ho_Chi_Minh
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

USER appuser
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

## 2. Dockerfile Frontend App (Vue 3)

```dockerfile
# docker/Dockerfile.frontend
# ── Stage 1: Build Vue SPA ─────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .

# Build với env production
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# ── Stage 2: Nginx serve static ───────────────────────
FROM nginx:1.27-alpine AS runner

# Nginx config tối ưu cho SPA
COPY docker/nginx-frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:80/ || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 3. Dockerfile Frontend Admin

```dockerfile
# docker/Dockerfile.frontend-admin
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend-admin/package*.json ./
RUN npm ci
COPY frontend-admin/ .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY docker/nginx-admin.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 4. Nginx Config — Frontend SPA

```nginx
# docker/nginx-frontend.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Bật gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript
               image/svg+xml;
    gzip_min_length 1024;
    gzip_comp_level 6;

    # Cache static assets dài hạn (Vite tự hash filename)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback — tất cả route về index.html
    location / {
        try_files $uri $uri/ /index.html;
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
        add_header Referrer-Policy "strict-origin-when-cross-origin";
    }

    # Health check endpoint
    location /health {
        return 200 "ok";
        add_header Content-Type text/plain;
    }

    # Không cho phép truy cập file ẩn
    location ~ /\. {
        deny all;
    }
}
```

---

## 5. ECS Task Definitions

### Backend Task Definition

```json
{
  "family": "chatcrm-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "chatcrm-backend",
      "image": "ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/chatcrm-backend:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 3000, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" },
        { "name": "TZ", "value": "Asia/Ho_Chi_Minh" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:ACCOUNT:secret:chatcrm/prod:DATABASE_URL::"
        },
        {
          "name": "REDIS_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:ACCOUNT:secret:chatcrm/prod:REDIS_URL::"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:ACCOUNT:secret:chatcrm/prod:JWT_SECRET::"
        },
        {
          "name": "OPENROUTER_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:ACCOUNT:secret:chatcrm/prod:OPENROUTER_API_KEY::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/chatcrm-backend",
          "awslogs-region": "ap-southeast-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 60
      },
      "ulimits": [
        { "name": "nofile", "softLimit": 65536, "hardLimit": 65536 }
      ]
    }
  ]
}
```

### Frontend Task Definition

```json
{
  "family": "chatcrm-frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "chatcrm-frontend",
      "image": "ACCOUNT.dkr.ecr.ap-southeast-1.amazonaws.com/chatcrm-frontend:latest",
      "essential": true,
      "portMappings": [
        { "containerPort": 80, "protocol": "tcp" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/chatcrm-frontend",
          "awslogs-region": "ap-southeast-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:80/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      }
    }
  ]
}
```

---

## 6. AWS Secrets Manager — Cấu trúc Secret

```
Secret name: chatcrm/prod
Secret type: Other type of secret (key/value)

Keys cần lưu:
  DATABASE_URL        = postgresql://user:pass@rds-proxy-endpoint:5432/zalocrm?sslmode=require
  REDIS_URL           = rediss://:authtoken@elasticache-endpoint:6379
  JWT_SECRET          = <random 64 chars>
  PLATFORM_JWT_SECRET = <random 64 chars>
  OPENROUTER_API_KEY  = sk-or-...
  GOOGLE_API_KEY      = AIza...
  ZALO_APP_ID         = ...
  ZALO_APP_SECRET     = ...
  AWS_S3_BUCKET       = chatcrm-files-production
  AWS_REGION          = ap-southeast-1
```

> **Lưu ý:** Không cần `AWS_ACCESS_KEY_ID` và `AWS_SECRET_ACCESS_KEY` trong Secrets Manager vì ECS Task Role tự động cấp quyền S3 thông qua IAM.

---

## 7. Prisma Migration khi Deploy

Prisma migration cần chạy **1 lần trước khi ECS task mới start**, không chạy trong container chính. Giải pháp: **ECS One-off Task** trong GitHub Actions CI/CD:

```bash
# Chạy migration qua AWS CLI trong workflow deploy
aws ecs run-task \
  --cluster chatcrm-cluster \
  --task-definition chatcrm-migrate \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}" \
  --overrides '{
    "containerOverrides": [{
      "name": "chatcrm-backend",
      "command": ["npx", "prisma", "migrate", "deploy"]
    }]
  }'
```

---

**File tiếp theo:** [PHASE9-PART3-CICD.md] — GitHub Actions CI/CD workflows đầy đủ
