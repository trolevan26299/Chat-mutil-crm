# Phase 9 — Production Deployment Plan
## Phần 1: Kiến trúc Tổng thể & AWS Infrastructure

> **Mục tiêu:** Triển khai hệ thống Chat Multi CRM lên AWS + Cloudflare với khả năng Auto-scale, bảo mật cao, chi phí tối ưu theo mô hình pay-as-you-go.

---

## 1. Tổng quan Kiến trúc Production

```
                        ┌─────────────────────────────┐
                        │   CLOUDFLARE (Global Edge)   │
                        │  WAF · DDoS · CDN · SSL/TLS  │
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │  AWS Application Load        │
                        │  Balancer (ALB)              │
                        │  - HTTPS :443                │
                        │  - Routing rules by Host     │
                        └──┬──────────┬───────────────┘
                           │          │
              ┌────────────▼──┐  ┌───▼────────────┐
              │  ECS Service  │  │  ECS Service    │
              │  (Backend)    │  │  (Frontend+     │
              │  Fargate      │  │   Admin) Fargate│
              │  Min 1/Max 10 │  │  Min 1/Max 5    │
              └──────┬────────┘  └────────┬────────┘
                     │                    │
         ┌───────────▼────────────────────▼──────────┐
         │              Data Layer                     │
         │                                             │
         │  ┌─────────────┐    ┌──────────────────┐   │
         │  │ RDS Proxy   │    │ ElastiCache Redis │   │
         │  │      ↓      │    │ (cluster-disabled │   │
         │  │ RDS Postgres│    │  Multi-AZ)        │   │
         │  │ 16 Multi-AZ │    └──────────────────┘   │
         │  └─────────────┘                            │
         │                                             │
         │  ┌─────────────┐    ┌──────────────────┐   │
         │  │  Amazon S3  │    │  AWS CloudWatch  │   │
         │  │ (files/imgs)│    │  Logs & Metrics  │   │
         │  └─────────────┘    └──────────────────┘   │
         └────────────────────────────────────────────┘
```

---

## 2. Danh sách AWS Services & Lý do chọn

| Service | Tier/Config | Mục đích | Pay-as-you-go? |
|---|---|---|---|
| **ECS Fargate** (Backend) | 0.5 vCPU / 1GB RAM min | Chạy Node.js Fastify + BullMQ | ✅ Trả theo giây |
| **ECS Fargate** (Frontend) | 0.25 vCPU / 0.5GB RAM min | Nginx serve Vue SPA | ✅ Trả theo giây |
| **ALB** | - | HTTPS Load Balancer, host-based routing | ✅ Trả theo LCU |
| **RDS PostgreSQL 16** | db.t4g.medium (Multi-AZ) | Cơ sở dữ liệu chính + pgvector | ❌ On-demand (fixed) |
| **RDS Proxy** | - | Connection pooling cho Node.js | ✅ Trả theo connections |
| **ElastiCache Redis** | cache.t4g.small (Multi-AZ) | BullMQ Queue + Socket.IO Pub/Sub | ❌ On-demand (fixed) |
| **S3** | Standard tier | File/ảnh Zalo, backup DB | ✅ Trả theo GB |
| **ECR** | - | Lưu Docker Images | ✅ Trả theo GB |
| **CloudWatch** | - | Logs, Metrics, Alarms | ✅ Trả theo usage |
| **ACM** | - | SSL Certificate (miễn phí với ALB) | ✅ Free |
| **Route 53** | - | DNS nội bộ (optional, dùng Cloudflare) | ✅ Trả theo query |

> **Lưu ý chi phí:** RDS và ElastiCache là dịch vụ fixed cost vì cần chạy 24/7. Tuy nhiên có thể dùng **Reserved Instance (1 năm)** để tiết kiệm ~40% so với On-demand.

---

## 3. Region & Availability Zones

```
Region: ap-southeast-1 (Singapore) — gần Việt Nam nhất, latency ~30ms

AZ-1a: ap-southeast-1a
  - ECS Fargate Tasks (Backend)
  - RDS Primary
  - ElastiCache Primary

AZ-1b: ap-southeast-1b  
  - ECS Fargate Tasks (Frontend)
  - RDS Standby (Multi-AZ failover)
  - ElastiCache Replica

AZ-1c: ap-southeast-1c
  - Dự phòng khi AZ scale out
```

---

## 4. VPC & Networking

```
VPC: 10.0.0.0/16

Subnets:
  Public (ALB, NAT GW):
    - 10.0.1.0/24  (AZ-1a)
    - 10.0.2.0/24  (AZ-1b)

  Private (ECS Tasks):
    - 10.0.10.0/24 (AZ-1a)
    - 10.0.11.0/24 (AZ-1b)

  Isolated (RDS, Redis):
    - 10.0.20.0/24 (AZ-1a)
    - 10.0.21.0/24 (AZ-1b)
```

### Security Groups

```
sg-alb:
  Inbound:  443 from 0.0.0.0/0 (Cloudflare IPs only - xem mục 6)
  Outbound: 3000 to sg-ecs-backend
            80   to sg-ecs-frontend

sg-ecs-backend:
  Inbound:  3000 from sg-alb
  Outbound: 5432 to sg-rds
            6379 to sg-redis
            443  to 0.0.0.0/0 (gọi Zalo API, OpenAI, v.v.)

sg-ecs-frontend:
  Inbound:  80 from sg-alb
  Outbound: 443 to 0.0.0.0/0

sg-rds:
  Inbound:  5432 from sg-ecs-backend
            5432 from sg-rds-proxy
  Outbound: NONE

sg-redis:
  Inbound:  6379 from sg-ecs-backend
  Outbound: NONE
```

---

## 5. IAM Roles & Permissions

### ECS Task Execution Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    }
  ]
}
```

### ECS Task Role (App permissions)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:GetObjectUrl"
      ],
      "Resource": "arn:aws:s3:::chatcrm-files/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::chatcrm-files"
    }
  ]
}
```

---

## 6. Cấu hình RDS PostgreSQL 16

### Thông số
```
Engine:          PostgreSQL 16.x
Instance:        db.t4g.medium (2 vCPU, 4GB RAM) — ARM Graviton tiết kiệm ~20%
Storage:         100GB gp3 SSD, auto-scaling lên 500GB
Multi-AZ:        Enabled (automatic failover ~60s)
Backup:          Automated, retain 30 ngày
Maintenance:     Chủ Nhật 03:00-04:00 ICT (ít traffic nhất)
Enhanced Monitoring: 60s interval
Performance Insights: Enabled (free 7 ngày)
```

### Parameter Group
```ini
# Tạo custom parameter group: chatcrm-pg16
shared_buffers             = 512MB          # 25% RAM instance
effective_cache_size       = 3GB            # 75% RAM
work_mem                   = 32MB           # cho complex queries
maintenance_work_mem       = 128MB
max_connections            = 200            # RDS Proxy quản lý connections
checkpoint_completion_target = 0.9
wal_buffers                = 16MB
default_statistics_target  = 100
random_page_cost           = 1.1           # SSD storage
```

### Sau khi RDS ready — chạy lệnh bật pgvector
```sql
-- Kết nối vào RDS qua bastion host hoặc SSM Session Manager
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- cho full-text search

-- Verify
SELECT * FROM pg_extension WHERE extname IN ('vector', 'pg_trgm');
```

### RDS Proxy
```
Endpoint:    chatcrm-proxy.proxy-xxx.ap-southeast-1.rds.amazonaws.com
Port:        5432
Pool:        Max 100 connections tới RDS
             Borrow timeout: 120s
IAM auth:    Enabled
TLS:         Required
```

> **Cập nhật .env trong AWS Secrets Manager:**
> `DATABASE_URL=postgresql://user:pass@chatcrm-proxy.proxy-xxx.../zalocrm?sslmode=require`

---

## 7. Cấu hình ElastiCache Redis 7

```
Engine:       Redis 7.x
Node type:    cache.t4g.small (0.5 vCPU, 1.37GB) — Graviton ARM
Mode:         Cluster Disabled (Replication Group)
Replicas:     1 replica (Multi-AZ)
Failover:     Automatic (30-60s)
Auth:         Token-based AUTH enabled
TLS:          In-transit encryption enabled
Backup:       Daily snapshot, retain 7 ngày

Memory policy: allkeys-lru (tự xóa key cũ khi đầy)
maxmemory:     1200mb (giữ 170mb buffer)
```

> **Cập nhật .env:**
> `REDIS_URL=rediss://:token@chatcrm-redis.xxx.cache.amazonaws.com:6379`
> (chú ý `rediss://` — có TLS)

---

## 8. Amazon S3 Setup

```
Bucket name:  chatcrm-files-production
Region:       ap-southeast-1
ACL:          Disabled (Block all public access)
Versioning:   Enabled
Encryption:   SSE-S3 (AES-256)

Folders:
  /zalo-images/     — ảnh từ Zalo webhook
  /attachments/     — file đính kèm
  /knowledge-docs/  — file PDF knowledge base
  /exports/         — báo cáo xuất ra

Lifecycle Rules:
  - /exports/* → Glacier sau 90 ngày
  - /zalo-images/* → Standard-IA sau 30 ngày (giảm 40% chi phí)

CORS (cho phép FE upload trực tiếp nếu cần):
[{
  "AllowedOrigins": ["https://chatcrm.org", "https://*.chatcrm.org"],
  "AllowedMethods": ["GET", "PUT", "POST"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3000
}]
```

---

## 9. ALB Listener Rules

```
HTTPS :443 Listener:

Rule 1: Host = api.chatcrm.org OR *.chatcrm.org/api/*
  → Forward to: ecs-backend-tg (port 3000)

Rule 2: Host = admin.chatcrm.org
  → Forward to: ecs-frontend-admin-tg (port 80)

Rule 3: Host = *.chatcrm.org (wildcard — tenant subdomains)
  → Forward to: ecs-frontend-tg (port 80)

Default:
  → Return 403

Health Check:
  Backend:  GET /health  → 200
  Frontend: GET /        → 200
  Interval: 30s, Threshold: 2 healthy / 3 unhealthy
```

---

## 10. Ước tính Chi phí (ap-southeast-1)

### Môi trường nhỏ (startup, <50 tenant)
| Service | Config | Giá/tháng |
|---|---|---|
| ECS Fargate Backend | 0.5vCPU/1GB × 1 task avg | ~$18 |
| ECS Fargate Frontend | 0.25vCPU/0.5GB × 1 task avg | ~$9 |
| ALB | | ~$22 |
| RDS db.t4g.medium Multi-AZ | | ~$80 |
| RDS Proxy | | ~$15 |
| ElastiCache cache.t4g.small | | ~$25 |
| S3 + Transfer | 50GB | ~$5 |
| ECR | | ~$2 |
| CloudWatch | | ~$5 |
| **Tổng** | | **~$181/tháng** |

### Môi trường trung bình (100-500 tenant, scale out lúc cao điểm)
| Service | Config | Giá/tháng |
|---|---|---|
| ECS Fargate Backend | avg 3 tasks × 1vCPU/2GB | ~$150 |
| ECS Fargate Frontend | avg 2 tasks | ~$40 |
| ALB | traffic cao hơn | ~$30 |
| RDS db.m6g.large Multi-AZ | | ~$200 |
| RDS Proxy | | ~$30 |
| ElastiCache cache.m6g.large | | ~$120 |
| S3 + Transfer | 200GB | ~$20 |
| **Tổng** | | **~$590/tháng** |

> **Tiết kiệm:** Mua Reserved Instance 1 năm cho RDS + ElastiCache → giảm ~40% = tiết kiệm ~$100-130/tháng.

---

**Phần tiếp theo:**
- [PHASE9-PART2-DOCKER.md] — Dockerfile tối ưu multi-stage, docker-compose production
- [PHASE9-PART3-CICD.md] — GitHub Actions workflows chi tiết
- [PHASE9-PART4-CLOUDFLARE.md] — Cloudflare WAF, rules, caching
- [PHASE9-PART5-AUTOSCALING.md] — ECS Auto Scaling + CloudWatch Alarms
- [PHASE9-PART6-SECURITY.md] — Secrets Manager, Security best practices
- [PHASE9-PART7-MONITORING.md] — CloudWatch dashboards, alerts, runbook
