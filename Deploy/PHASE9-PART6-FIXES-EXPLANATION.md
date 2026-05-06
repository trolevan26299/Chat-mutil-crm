# Phase 9 — Phần 6: Giải thích Chi tiết Các Fix & Trạng thái Hoàn chỉnh

---

## ✅ Kết quả Build Local

```
backend (TypeScript)  → ✅ Build thành công (tsc, 0 errors)
frontend (Vue 3)      → ✅ Build thành công (563ms)
frontend-admin (Vue3) → ✅ Build thành công (1.33s)
```

---

## 1. Tại sao phải cài Redis Adapter cho Socket.IO?

### Vấn đề gốc
Khi chạy **nhiều container ECS** (ví dụ 3 API tasks), mỗi container có một instance Socket.IO riêng biệt trong RAM. Khi Worker container nhận tin nhắn Zalo và emit event `zalo:message`, event đó chỉ đến các client **đang kết nối với container đó**.

```
TRƯỚC FIX (SAI):

  Worker container            API container 1        API container 2
  ┌──────────────┐           ┌─────────────┐        ┌─────────────┐
  │ ZaloPool     │           │ Socket.IO   │        │ Socket.IO   │
  │ nhận tin nhắn│──emit──►  │ (clients A) │   ✗    │ (clients B) │
  │ Zalo         │           │             │        │ KHÔNG nhận  │
  └──────────────┘           └─────────────┘        └─────────────┘
                                                     Clients B mở chat
                                                     nhưng không thấy
                                                     tin nhắn mới!
```

```
SAU FIX (ĐÚNG):

  Worker emit → Redis Pub/Sub → Tất cả Socket.IO instance nhận
                                → Đúng client nhận event

  Worker ──► Redis ──► API-1 Socket.IO ──► Client A ✅
                  └──► API-2 Socket.IO ──► Client B ✅
                  └──► API-3 Socket.IO ──► Client C ✅
```

**Code đã thêm vào `app.ts`:**
```typescript
const pubClient = createClient({ url: config.redisUrl });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

---

## 2. Tại sao phải tách WORKER_MODE?

### Vấn đề gốc
`ZaloPool` là một **singleton in-memory Map** chứa các kết nối WebSocket thật tới Zalo:
```typescript
class ZaloAccountPool {
  private instances = new Map<string, ZaloInstance>(); // ← chỉ sống trong RAM
}
```

Khi ECS scale lên 3 containers:
- **Container 1**: `zaloPool` có `{acc-1: connected, acc-2: connected}`
- **Container 2**: `zaloPool` hoàn toàn **RỖNG** — không có kết nối nào
- **Container 3**: `zaloPool` cũng **RỖNG**

Hệ quả:
- ALB gửi request `GET /api/zalo/status` tới Container 2 → trả về `disconnected` (sai)
- Container 2 và 3 không nhận được tin nhắn Zalo (không có kết nối)
- Campaign scheduler chạy trên **cả 3 containers** → cùng 1 chiến dịch gửi **3 lần** cho mỗi khách hàng

**Fix:** Thêm `WORKER_MODE=true/false` env var:
```
WORKER_MODE=false → Container API (stateless, scale tự do 1-10)
  ✅ Fastify REST API
  ✅ Socket.IO (nhận connection từ FE)
  ❌ ZaloPool (không init)
  ❌ Campaign scheduler
  ❌ Zalo health check

WORKER_MODE=true → Container Worker (stateful, cố định 1 instance)
  ✅ Fastify REST API (để nhận lệnh từ FE: loginQR, disconnect...)
  ✅ Socket.IO (emit zalo events về FE)
  ✅ ZaloPool (duy trì kết nối Zalo thật)
  ✅ Campaign scheduler
  ✅ Zalo health check
  ✅ Contact intelligence
```

---

## 3. Tại sao bỏ `prisma db push` trong Dockerfile?

### Vấn đề gốc
```dockerfile
# CŨ — NGUY HIỂM
CMD ["sh", "-c", "npx prisma db push --url \"$DATABASE_URL\" && node dist/app.js"]
```

**`prisma db push` khác với `prisma migrate deploy`:**

| | `db push` | `migrate deploy` |
|---|---|---|
| Migration history | ❌ Không lưu | ✅ Lưu đầy đủ |
| Khi schema thay đổi | ⚠️ Có thể xóa column | ✅ Chạy migration file |
| Rollback được không | ❌ Không | ✅ Có |
| Race condition | ❌ Nếu 3 containers cùng start | ✅ Chạy 1 lần trong CI/CD |

Khi ECS scale lên 3 tasks, **3 containers cùng khởi động** → cả 3 đều chạy `db push` cùng lúc → race condition, nguy cơ corruption dữ liệu.

**Fix:** Migration chạy qua GitHub Actions **trước** khi ECS deploy, trong container riêng biệt 1 lần duy nhất.

---

## 4. Tại sao fix Socket.IO CORS?

### Vấn đề gốc
```typescript
// CŨ
origin: config.isProduction ? config.appUrl : '*'
// appUrl = "https://chatcrm.org"
```

Hệ thống multi-tenant dùng subdomain: `demo.chatcrm.org`, `abc.chatcrm.org`...

Khi client tại `https://demo.chatcrm.org` kết nối Socket.IO, browser gửi:
```
Origin: https://demo.chatcrm.org
```

Server so sánh với `"https://chatcrm.org"` → **KHÔNG KHỚP** → Socket.IO trả về lỗi CORS → WebSocket bị block.

**Fix:** Thay bằng function kiểm tra regex cho phép tất cả subdomain:
```typescript
const isAllowed = origin === `https://chatcrm.org` || origin.endsWith(`.chatcrm.org`);
```

---

## 5. Tại sao thêm pingTimeout/pingInterval cho Cloudflare?

### Vấn đề gốc
Cloudflare tự động **đóng kết nối TCP idle sau 100 giây** nếu không có traffic.

WebSocket của Socket.IO mặc định:
- `pingInterval = 25000ms` (25s) → OK
- `pingTimeout = 20000ms` (20s) — nếu ping không trả lời trong 20s → disconnect

Nhưng nếu Cloudflare can thiệp giữa chừng:
```
Client ──►  Cloudflare ──►  Server
           (drop idle)
           
Client không biết connection đã chết → "phantom connection"
FE vẫn nghĩ đang connected nhưng không nhận được event nào
```

**Fix:** `pingTimeout: 60000` và đảm bảo Cloudflare WebSocket được bật.

---

## 6. Tại sao thêm Graceful Shutdown?

### Vấn đề gốc
Khi ECS rolling deploy, AWS gửi `SIGTERM` tới container cũ, đợi 30s, rồi force kill.

**Nếu không có graceful shutdown:**
- Request HTTP đang xử lý bị cắt giữa chừng → client nhận lỗi 502
- Zalo WebSocket đang nhận tin nhắn → bị ngắt đột ngột → tin nhắn mất
- Campaign đang gửi tin nhắn → worker bị kill → campaign bị treo

**Fix:** `tini` làm PID 1 trong Docker forward `SIGTERM` về Node.js process, Node.js xử lý:
1. Ngừng nhận request mới (Fastify close)
2. Ngắt kết nối Zalo sạch sẽ
3. Đóng DB connection pool
4. Process exit 0

---

## 7. Tại sao thêm env validation?

### Vấn đề gốc
```typescript
// CŨ
jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me'
```

Nếu quên set `JWT_SECRET` trong ECS Task Definition → server vẫn **chạy bình thường** nhưng dùng `'dev-secret-change-me'` → tất cả user đều có thể forge JWT token → **lỗ hổng bảo mật nghiêm trọng**.

**Fix:** Throw error ngay khi khởi động nếu thiếu secret trong production.

---

## 📋 Checklist Đầy đủ — Trạng thái Hiện tại

### Code Changes (đã làm)
- [x] Redis Adapter cho Socket.IO — `app.ts`, `package.json`
- [x] WORKER_MODE tách stateful/stateless — `app.ts`, `docker-compose.yml`
- [x] Fix Dockerfile bỏ `prisma db push` — `docker/Dockerfile`
- [x] Socket.IO CORS wildcard subdomain — `app.ts`
- [x] Socket.IO pingTimeout/pingInterval — `app.ts`
- [x] Graceful shutdown SIGTERM — `app.ts`
- [x] `disconnectAll()` method — `zalo-pool.ts`
- [x] Env validation production — `config/index.ts`
- [x] `redisUrl` thêm vào config — `config/index.ts`
- [x] Non-root user trong Docker — `docker/Dockerfile`
- [x] Healthcheck chuẩn trong Docker — `docker/Dockerfile`

### Phase 9 Documentation Files
- [x] `PHASE9-PART1-ARCHITECTURE.md` — VPC, RDS, Redis, S3, chi phí
- [x] `PHASE9-PART2-DOCKER.md` — Dockerfile riêng, ECS Task Definitions
- [x] `PHASE9-PART3-CICD.md` — GitHub Actions full workflow
- [x] `PHASE9-PART4-CLOUDFLARE-AUTOSCALING.md` — Cloudflare, Auto Scaling, Monitoring
- [x] `PHASE9-PART5-GAPS-ANALYSIS.md` — Phân tích lỗ hổng & priority list
- [x] `PHASE9-PART6-FIXES-EXPLANATION.md` — (File này) Giải thích chi tiết

### Còn thiếu trong docs (cần bổ sung)
- [ ] `PHASE9-PART2-DOCKER.md` — Cần cập nhật ECS Task Definition worker riêng
- [ ] `.github/workflows/deploy.yml` — Cần tạo file thực tế trong repo
- [ ] `.aws/task-def-backend.json` — Template ECS task def cần tạo

---

## Các bước thực hiện tiếp theo theo thứ tự

```
Bước 1 — Tạo file GitHub Actions thực tế trong repo
  mkdir -p .github/workflows
  → Tạo deploy.yml, rollback.yml

Bước 2 — Tạo ECS Task Definition templates
  mkdir -p .aws
  → Tạo task-def-backend.json, task-def-worker.json, task-def-frontend.json

Bước 3 — Setup AWS (chỉ làm 1 lần)
  → Tạo VPC, Subnets, Security Groups
  → Tạo RDS, ElastiCache, S3
  → Tạo ECR repositories (3 repos)
  → Tạo ECS Cluster + Services (api, worker, frontend, admin)

Bước 4 — Setup Cloudflare
  → Trỏ DNS về ALB
  → Bật WebSocket
  → Tạo WAF rules

Bước 5 — Thêm GitHub Secrets
  → AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
  → ECR repo names, ECS cluster/service names
  → VITE_API_URL, VITE_WS_URL

Bước 6 — Push lên main → GitHub Actions tự động deploy
```
