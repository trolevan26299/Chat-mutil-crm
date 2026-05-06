# Phase 9 — Production Deployment Plan
## Phần 4: Cloudflare + Auto Scaling + Monitoring

---

## PHẦN A — CLOUDFLARE (Bảo mật & Tốc độ)

### 1. DNS Setup

```
Cloudflare DNS (Proxied — bật cờ cam):

Type  Name                   Value                          TTL   Proxy
A     chatcrm.org            <ALB IP>                       Auto  ✅ Proxied
A     *.chatcrm.org          <ALB IP>                       Auto  ✅ Proxied
CNAME www                   chatcrm.org                    Auto  ✅ Proxied
CNAME api                   <ALB DNS>.ap-southeast-1.elb.amazonaws.com Auto ✅ Proxied
CNAME admin                 <ALB DNS>.ap-southeast-1.elb.amazonaws.com Auto ✅ Proxied

Lưu ý:
- KHÔNG dùng Cloudflare cho endpoint RDS, Redis (internal AWS)
- TXT records cho email (SES, DKIM) không cần proxy
```

### 2. SSL/TLS

```
Mode: Full (Strict)

Cấu hình:
✅ Always Use HTTPS
✅ HTTP Strict Transport Security (HSTS): max-age=31536000, includeSubDomains
✅ Automatic HTTPS Rewrites
✅ Minimum TLS Version: TLS 1.2
✅ TLS 1.3: Enabled
✅ Opportunistic Encryption

Origin Certificate:
- Tạo Cloudflare Origin Certificate (15 năm)
- Import vào AWS ACM (Certificate Manager)
- Gắn vào ALB Listener HTTPS :443
```

### 3. WAF Rules

```
Security Level: Medium

Rule 1 — Rate Limit API Login
  Expression: (http.request.uri.path contains "/api/auth/login")
  Action: Rate Limit
  Threshold: 5 requests / 60 seconds / IP
  Duration: 10 minutes block

Rule 2 — Rate Limit Webhook
  Expression: (http.request.uri.path contains "/api/webhooks")
  Action: Rate Limit
  Threshold: 100 requests / 10 seconds / IP

Rule 3 — Block bad bots
  Expression: (cf.client.bot) and not (cf.verified_bot_category in {"Search Engine Crawlers"})
  Action: Block

Rule 4 — Block suspicious User-Agents
  Expression: (http.user_agent contains "sqlmap") or
              (http.user_agent contains "nikto") or
              (http.user_agent contains "nmap") or
              (http.user_agent eq "")
  Action: Block

Rule 5 — Allow only Zalo webhook IPs (nếu biết Zalo IP ranges)
  Expression: (http.request.uri.path contains "/api/webhooks/zalo") and
              not (ip.src in {103.130.212.0/24 103.130.213.0/24})
  Action: Block

Rule 6 — Geo block (optional — chỉ cho phép VN + admin từ VN)
  Expression: (not ip.geoip.country in {"VN"}) and
              (http.request.uri.path contains "/admin")
  Action: Block
```

### 4. Cache Rules

```
Rule 1 — Không cache API
  Expression: (http.request.uri.path contains "/api/") or
              (http.request.uri.path contains "/socket.io/")
  Cache: Bypass

Rule 2 — Cache Frontend Assets lâu dài (Vite hash filenames)
  Expression: (http.request.uri.path matches ".*\\.(js|css|woff2?|ttf|ico|png|jpg|svg)$")
  Edge Cache TTL: 1 month
  Browser TTL: 1 year

Rule 3 — Cache HTML ngắn hạn
  Expression: (http.request.uri.path eq "/" or
               http.request.uri.path eq "/index.html")
  Edge Cache TTL: 5 minutes

Rule 4 — No cache cho admin
  Expression: (http.host eq "admin.chatcrm.org")
  Cache: Bypass
```

### 5. Performance Settings

```
✅ Auto Minify: JavaScript + CSS + HTML
✅ Brotli Compression
✅ HTTP/2: Enabled
✅ HTTP/3 (QUIC): Enabled
✅ 0-RTT Connection Resumption
✅ Rocket Loader: Disabled (Vue SPA không cần)
✅ Polish: Lossless (nén ảnh tự động)

Page Rules:
  chatcrm.org/*  → Cache Level: Standard
  *.chatcrm.org/api/*  → Cache Level: Bypass
```

---

## PHẦN B — AUTO SCALING (ECS Fargate)

### 1. Cấu hình Service Auto Scaling — Backend

```
Service: chatcrm-backend-service
Min Capacity: 1 task
Max Capacity: 10 tasks

Scaling Policies:

Policy 1: CPU Target Tracking
  Target: 70% CPU utilization
  Scale Out Cooldown: 60s
  Scale In Cooldown: 300s

Policy 2: Memory Target Tracking
  Target: 75% Memory utilization
  Scale Out Cooldown: 60s
  Scale In Cooldown: 300s

Policy 3: ALB Request Count (Step Scaling)
  Metric: RequestCountPerTarget
  Step 1: > 500 req/target/min → add 2 tasks
  Step 2: > 1000 req/target/min → add 4 tasks
  Scale In: < 100 req/target/min → remove 1 task (slow)
```

### 2. Cấu hình Service Auto Scaling — Frontend

```
Service: chatcrm-frontend-service
Min Capacity: 1 task
Max Capacity: 5 tasks

Policy: CPU Target Tracking
  Target: 60% CPU
  Scale Out Cooldown: 120s
  Scale In Cooldown: 600s
```

### 3. CloudWatch Alarms

```yaml
# Alarm 1: Backend CPU cao → Notify + Auto Scale
AlarmName: chatcrm-backend-cpu-high
Metric: AWS/ECS CPUUtilization
Namespace: AWS/ECS
Dimensions:
  ClusterName: chatcrm-cluster
  ServiceName: chatcrm-backend-service
Statistic: Average
Period: 60
EvaluationPeriods: 3
Threshold: 80
ComparisonOperator: GreaterThanThreshold
AlarmActions:
  - arn:aws:sns:...:chatcrm-alerts  # gửi Telegram/Slack
  - arn:aws:applicationautoscaling:...:scalingPolicy/...

# Alarm 2: Backend 5xx errors
AlarmName: chatcrm-backend-5xx
Metric: AWS/ApplicationELB HTTPCode_Target_5XX_Count
Period: 60
EvaluationPeriods: 2
Threshold: 10
TreatMissingData: notBreaching
AlarmActions:
  - arn:aws:sns:...:chatcrm-alerts  # CRITICAL alert

# Alarm 3: RDS CPU
AlarmName: chatcrm-rds-cpu-high
Metric: AWS/RDS CPUUtilization
Threshold: 80
EvaluationPeriods: 5
AlarmActions:
  - arn:aws:sns:...:chatcrm-alerts

# Alarm 4: RDS Free Storage
AlarmName: chatcrm-rds-storage-low
Metric: AWS/RDS FreeStorageSpace
Threshold: 10737418240  # 10GB
ComparisonOperator: LessThanThreshold
AlarmActions:
  - arn:aws:sns:...:chatcrm-alerts

# Alarm 5: Redis Memory
AlarmName: chatcrm-redis-memory-high
Metric: AWS/ElastiCache DatabaseMemoryUsagePercentage
Threshold: 80
AlarmActions:
  - arn:aws:sns:...:chatcrm-alerts
```

### 4. SNS → Telegram notification

```python
# Lambda function: chatcrm-alarm-notifier
# Trigger: SNS topic chatcrm-alerts

import json
import urllib.request

TELEGRAM_BOT_TOKEN = "your-bot-token"
TELEGRAM_CHAT_ID   = "your-chat-id"

def lambda_handler(event, context):
    message = json.loads(event['Records'][0]['Sns']['Message'])
    alarm_name = message.get('AlarmName', 'Unknown')
    state = message.get('NewStateValue', 'UNKNOWN')
    reason = message.get('NewStateReason', '')

    emoji = "🔴" if state == "ALARM" else "✅" if state == "OK" else "⚠️"
    text = f"{emoji} *AWS Alert*\n\n*Alarm:* {alarm_name}\n*State:* {state}\n*Reason:* {reason}"

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "Markdown"})
    req = urllib.request.Request(url, data=data.encode(), headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req)
```

---

## PHẦN C — MONITORING & OBSERVABILITY

### 1. CloudWatch Log Groups

```
/ecs/chatcrm-backend          Retention: 30 ngày
/ecs/chatcrm-frontend         Retention: 7 ngày
/ecs/chatcrm-admin            Retention: 7 ngày
/ecs/chatcrm-migrate          Retention: 30 ngày
/rds/chatcrm                  Retention: 30 ngày
```

### 2. CloudWatch Dashboard

```
Dashboard: chatcrm-production

Row 1 — Traffic Overview
  - ALB: RequestCount (5min sum)
  - ALB: TargetResponseTime (avg)
  - ALB: HTTPCode_Target_2XX / 4XX / 5XX

Row 2 — ECS Backend
  - CPUUtilization (avg)
  - MemoryUtilization (avg)
  - RunningTaskCount

Row 3 — Database
  - RDS CPUUtilization
  - RDS DatabaseConnections
  - RDS FreeStorageSpace
  - RDS ReadLatency / WriteLatency

Row 4 — Redis
  - ElastiCache CurrConnections
  - ElastiCache DatabaseMemoryUsagePercentage
  - ElastiCache CacheHits / CacheMisses

Row 5 — Business Metrics (Custom)
  - Active WebSocket connections
  - BullMQ queue depth
  - Messages processed/min
```

### 3. Health Check Endpoint

```typescript
// backend/src/routes/health.ts — thêm vào app.ts
app.get('/health', async (req, reply) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'unknown',
    redis: 'unknown',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    checks.status = 'degraded';
  }

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
    checks.status = 'degraded';
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  reply.code(statusCode).send(checks);
});
```

---

## PHẦN D — BẢNG TỔNG HỢP CHECKLIST TRƯỚC KHI GO-LIVE

### Infrastructure
- [ ] VPC, Subnets, Security Groups đã tạo đúng
- [ ] RDS PostgreSQL 16 Multi-AZ đã chạy
- [ ] pgvector extension đã enable trên RDS
- [ ] ElastiCache Redis Multi-AZ đã chạy
- [ ] RDS Proxy đã cấu hình và test kết nối
- [ ] S3 bucket đã tạo, CORS đã cấu hình
- [ ] ECS Cluster, Task Definitions đã đăng ký
- [ ] ECR repositories đã tạo (backend, frontend, admin)
- [ ] IAM Roles đã tạo (ecsTaskExecutionRole, ecsTaskRole)
- [ ] AWS Secrets Manager đã lưu đủ secrets

### CI/CD
- [ ] GitHub Secrets đã cấu hình đủ
- [ ] `.github/workflows/deploy.yml` đã push lên main
- [ ] Chạy thử workflow lần đầu → images đã lên ECR
- [ ] ECS Services đã được update với image mới
- [ ] Health check ALB → backend trả 200
- [ ] Health check ALB → frontend trả 200

### Cloudflare
- [ ] DNS trỏ đúng về ALB, proxy đang bật
- [ ] SSL Full (Strict) đã cấu hình
- [ ] Origin Certificate đã import vào ACM, gắn vào ALB
- [ ] WAF rules đã tạo (rate limit, bot block)
- [ ] Cache rules đã tạo (bypass /api/)
- [ ] HSTS đã bật

### Monitoring
- [ ] CloudWatch Log Groups đã tạo
- [ ] CloudWatch Alarms cho CPU, Memory, 5xx, DB
- [ ] SNS topic → Lambda → Telegram đã test
- [ ] CloudWatch Dashboard đã tạo

### Database
- [ ] `prisma migrate deploy` đã chạy thành công
- [ ] Seed data (platform admin account) đã có
- [ ] RDS automated backup đang bật, retain 30 ngày

### Security
- [ ] Không có secret nào trong source code (chỉ trong Secrets Manager)
- [ ] ECS Tasks chạy bằng non-root user
- [ ] Security Groups: RDS và Redis không accessible từ internet
- [ ] ALB chỉ nhận traffic từ Cloudflare IPs

---

## PHẦN E — WHITELIST CLOUDFLARE IPs cho ALB

Để ngăn bypass Cloudflare (truy cập thẳng vào ALB), chỉ cho phép Cloudflare IPs kết nối vào ALB:

```
# IPv4 Cloudflare ranges (cập nhật tại https://www.cloudflare.com/ips/)
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

```bash
# Script tự động update Security Group ALB với Cloudflare IPs
#!/bin/bash
CF_IPS=$(curl -s https://www.cloudflare.com/ips-v4)
SG_ID="sg-your-alb-sg-id"

for IP in $CF_IPS; do
  aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 443 \
    --cidr $IP 2>/dev/null || true
done
echo "✅ Cloudflare IPs updated in ALB Security Group"
```

---

**Tóm tắt 7 file Phase 9:**

| File | Nội dung |
|---|---|
| `PHASE9-PART1-ARCHITECTURE.md` | Kiến trúc tổng thể, VPC, RDS, Redis, S3, chi phí |
| `PHASE9-PART2-DOCKER.md` | Dockerfile backend/frontend, ECS Task Definitions |
| `PHASE9-PART3-CICD.md` | GitHub Actions workflows đầy đủ (deploy + rollback) |
| `PHASE9-PART4-CLOUDFLARE.md` | ← **(File này)** Cloudflare + Auto Scaling + Monitoring + Checklist |
