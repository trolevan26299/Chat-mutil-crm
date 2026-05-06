# Phase 9 — Phần 5: Phân tích Lỗ hổng & Bổ sung

> Sau khi xem kỹ source code thực tế, đây là danh sách các vấn đề **CHƯA ĐƯỢC XỬ LÝ** trong kế hoạch deployment, ảnh hưởng trực tiếp đến bảo mật, tính sẵn sàng cao và hiệu năng.

---

## 🔴 VẤN ĐỀ NGHIÊM TRỌNG (Phải fix trước go-live)

### 1. ZaloPool là Singleton In-Memory — KHÔNG SCALE ĐƯỢC

**Phát hiện trong code:**
```typescript
// zalo-pool.ts
class ZaloAccountPool {
  private instances = new Map<string, ZaloInstance>(); // ← LƯU TRONG RAM!
  private userInfoCache = new Map<string, UserInfoCacheEntry>();
}
export const zaloPool = new ZaloAccountPool(); // ← Singleton
```

**Vấn đề nghiêm trọng:**
- `ZaloPool` lưu toàn bộ Zalo SDK instances (kết nối WebSocket tới Zalo) trong **RAM của container**.
- Khi ECS scale ra 3 containers, mỗi container có một `zaloPool` riêng → **3 pool hoàn toàn tách biệt**.
- Request từ frontend gọi `GET /api/zalo/status` có thể rơi vào container không có instance → trả về `disconnected` sai.
- **Socket.IO `zalo:connected` event** chỉ emit trên container đang xử lý → FE trên tab khác không nhận được.

**Giải pháp bắt buộc:**

**Option A (Khuyến nghị):** Chỉ chạy **1 instance Backend** xử lý Zalo Pool, scale riêng cho API.
```
ECS Service Backend-API:
  Task: chatcrm-backend (API only, no ZaloPool)
  Min: 1, Max: 10 (scale thoải mái)

ECS Service Backend-Zalo:
  Task: chatcrm-zalo-worker (ZaloPool + BullMQ workers)
  Min: 1, Max: 1 (KHÔNG scale — singleton required)
  Desired: 1
```

Tách bằng env var:
```typescript
// app.ts — chỉ khởi động ZaloPool khi WORKER_MODE=true
if (process.env.WORKER_MODE === 'true') {
  // Reconnect Zalo accounts, start BullMQ workers
  await initZaloPool();
  startCampaignScheduler();
  startZaloHealthCheck();
} else {
  // API-only mode: không init ZaloPool
}
```

**Option B:** Dùng Redis để đồng bộ trạng thái Pool giữa các instance (phức tạp hơn nhiều).

---

### 2. Dockerfile hiện tại dùng `prisma db push` thay vì `migrate deploy`

**Phát hiện:**
```dockerfile
# docker/Dockerfile — dòng 45
CMD ["sh", "-c", "npx prisma db push --url \"$DATABASE_URL\" && node dist/app.js"]
```

**Vấn đề:**
- `prisma db push` không an toàn cho production — nó **không tạo migration history**, có thể **xóa data** khi schema thay đổi.
- Mỗi container khởi động đều chạy lại → race condition khi scale nhiều task.

**Fix bắt buộc:**

```dockerfile
# Dockerfile.backend — production fix
# KHÔNG chạy migrate trong CMD của app container
CMD ["node", "dist/app.js"]
```

Migration phải chạy **trước** deploy (đã có trong PART3-CICD workflow):
```yaml
# GitHub Actions: chạy migrate trước deploy-backend
- name: Run Prisma migrate deploy (one-off ECS task)
  run: aws ecs run-task ...overrides... "command": ["npx", "prisma", "migrate", "deploy"]
```

---

### 3. Socket.IO CORS config không đủ chặt

**Phát hiện:**
```typescript
// app.ts
const io = new Server(app.server, {
  cors: {
    origin: config.isProduction ? config.appUrl : '*',
    credentials: true,
  },
});
```

**Vấn đề:**
- `config.appUrl` là một string đơn — trong môi trường multi-tenant, FE của mỗi tenant có subdomain khác nhau (`demo.chatcrm.org`, `abc.chatcrm.org`...).
- Socket.IO sẽ reject kết nối từ các subdomain không khớp `appUrl`.

**Fix:**
```typescript
const io = new Server(app.server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // server-to-server
      // Cho phép tất cả subdomain của chatcrm.org
      if (/^https:\/\/([a-z0-9-]+\.)?chatcrm\.org$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('CORS not allowed'));
    },
    credentials: true,
  },
  // THÊM: transports để hoạt động tốt với Cloudflare
  transports: ['websocket', 'polling'],
  // THÊM: path explicit
  path: '/socket.io/',
});
```

---

### 4. Socket.IO KHÔNG hoạt động qua Cloudflare mặc định

**Vấn đề kiến trúc:**
- Cloudflare mặc định **KHÔNG proxy WebSocket** trên free plan.
- Socket.IO dùng WebSocket (upgrade từ HTTP) → bị Cloudflare drop nếu không cấu hình đúng.

**Fix trên Cloudflare:**

```
Network → WebSockets → ON  ← Bật tính năng này

Cache Rules — Thêm rule bypass cho socket:
  Expression: (http.request.uri.path contains "/socket.io")
  Cache: Bypass
  
  Ngoài ra cần tắt "Rocket Loader" và "Mirage" cho path này.
```

**Fix trên ALB:**

ALB mặc định hỗ trợ WebSocket, nhưng cần đảm bảo:
```
Target Group settings:
  Stickiness: ENABLED (duration: 1 day)
  ← Quan trọng! Socket.IO cần sticky session để polling
     fallback hoạt động đúng với cùng 1 backend instance.
```

**Fix trên backend — thêm ping/pong timeout:**
```typescript
const io = new Server(app.server, {
  pingTimeout: 60000,     // 60s (Cloudflare có thể drop idle connections)
  pingInterval: 25000,    // ping mỗi 25s để giữ connection
  upgradeTimeout: 30000,
  transports: ['websocket', 'polling'],
});
```

---

### 5. Socket.IO Redis Adapter — CHƯA CÀI

**Phát hiện:**
- `app.ts` không có dòng nào cài `@socket.io/redis-adapter`.
- Với nhiều ECS tasks, event `zalo:message` emit trên task A sẽ **KHÔNG đến** client kết nối task B.

**Fix bắt buộc — thêm vào `app.ts`:**
```typescript
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

// Ngay trước khi tạo io:
const pubClient = createClient({ url: config.redisUrl });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);

const io = new Server(app.server, { /* cors config */ });
io.adapter(createAdapter(pubClient, subClient));
```

**Install package:**
```bash
cd backend
npm install @socket.io/redis-adapter redis
```

---

### 6. Config có fallback unsafe defaults

**Phát hiện:**
```typescript
// config/index.ts
jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',  // ← NGUY HIỂM
encryptionKey: process.env.ENCRYPTION_KEY || 'dev-key-change-me-16b', // ← NGUY HIỂM
```

**Fix — thêm validation khi startup:**
```typescript
// config/index.ts
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val && process.env.NODE_ENV === 'production') {
    throw new Error(`❌ Required env var missing: ${key}`);
  }
  return val || '';
}

export const config = {
  jwtSecret: requireEnv('JWT_SECRET') || 'dev-secret-change-me',
  encryptionKey: requireEnv('ENCRYPTION_KEY') || 'dev-key-change-me-16b',
  // ...
};
```

---

## 🟡 VẤN ĐỀ QUAN TRỌNG (Fix trong sprint đầu sau go-live)

### 7. Không có Graceful Shutdown

**Vấn đề:**
- Khi ECS rolling deploy, container cũ nhận `SIGTERM` → bị kill ngay.
- Các Zalo WebSocket connections, BullMQ jobs đang xử lý bị cắt giữa chừng.

**Fix:**
```typescript
// app.ts — thêm graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`[shutdown] Received ${signal}, shutting down gracefully...`);
  
  // 1. Stop nhận request mới
  await app.close();
  
  // 2. Dừng background workers
  await campaignScheduler.close();
  
  // 3. Disconnect tất cả Zalo instances
  zaloPool.disconnectAll();
  
  // 4. Đóng DB connection
  await prisma.$disconnect();
  
  logger.info('[shutdown] Done. Goodbye!');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM')); // ECS gửi SIGTERM
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C local
```

**ECS Task Definition — thêm stopTimeout:**
```json
{
  "stopTimeout": 30
}
```

### 8. BullMQ Workers chạy trong cùng process API

**Vấn đề:**
- Campaign scheduler, zalo sync worker đang chạy trong cùng Node.js process với API server.
- Khi campaign nặng chạy, CPU spike → API bị chậm theo.
- Khi scale API lên 5 tasks → 5 campaign scheduler chạy song song → duplicate jobs.

**Fix (đã đề cập ở mục 1):** Tách `WORKER_MODE` container riêng.

### 9. Static Files (Frontend) nên serve qua CDN, không qua Backend

**Phát hiện:**
```typescript
// app.ts
await app.register(fastifyStatic, {
  root: path.join(__dirname, '../static'), // ← Backend đang serve Vue SPA
});
```

**Vấn đề:**
- Backend phải gánh thêm bandwidth phục vụ static files.
- Mỗi container ECS phải chứa cả `dist/` của frontend (image to hơn).
- Lãng phí tài nguyên Fargate cho việc phục vụ file tĩnh.

**Fix tối ưu:** Tách frontend ra container Nginx riêng (đã có trong PART2) hoặc serve qua **CloudFront + S3**:
```
S3 Bucket: chatcrm-static-assets
  /app/         → Vue FE dist
  /admin/       → Admin FE dist

CloudFront Distribution:
  Origin 1: S3 bucket (static assets)
  Origin 2: ALB (API + WebSocket)
  
  Cache Behavior:
    /api/*      → ALB (no cache)
    /socket.io/*→ ALB (no cache, WebSocket)
    /*          → S3 (cache 1 year)
```

---

## 🟢 ĐÃ ĐỦ & TỐT (Không cần thay đổi)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| JWT Authentication | ✅ Tốt | Đã dùng `@fastify/jwt` |
| Multi-tenant isolation | ✅ Tốt | Mọi query có `organizationId` |
| Rate limiting | ✅ Tốt | `@fastify/rate-limit` 500 req/min |
| Health check endpoint | ✅ Tốt | `/health` check DB connectivity |
| Zalo circuit breaker | ✅ Tốt | >5 disconnects/5min → stop auto-reconnect |
| Zalo auto-reconnect | ✅ Tốt | 30s delay, 2min retry |
| BullMQ anti-spam | ✅ Tốt | Campaign chunking + delay |
| Error handling | ✅ Tốt | `uncaughtException`, `unhandledRejection` |
| CORS | ✅ Tốt | Chỉ cần mở rộng cho multi-tenant |
| Tini PID1 | ✅ Tốt | Dockerfile đã dùng `tini` |
| RDS backup | ✅ Đã plan | 30 ngày retention |
| Proxy support | ✅ Tốt | HTTP/SOCKS proxy cho Zalo account |

---

## 📋 PRIORITY FIX LIST (Thứ tự ưu tiên)

```
P0 — TRƯỚC GO-LIVE (bắt buộc):
  1. [x] Thêm Redis Adapter cho Socket.IO
  2. [x] Tách ZaloPool/Workers ra container riêng (WORKER_MODE)
  3. [x] Fix Dockerfile: bỏ `prisma db push`, dùng migration workflow
  4. [x] Fix Socket.IO CORS cho wildcard subdomain
  5. [x] Bật WebSocket trên Cloudflare
  6. [x] Bật Sticky Session trên ALB Target Group
  7. [x] Thêm env validation (không dùng default secrets trong prod)

P1 — SPRINT ĐẦU SAU GO-LIVE:
  8. [ ] Thêm graceful shutdown
  9. [ ] Move static files sang CloudFront/S3 hoặc container Nginx riêng
  10. [ ] Thêm Socket.IO pingTimeout/pingInterval config

P2 — TƯƠNG LAI:
  11. [ ] Tách BullMQ workers hẳn ra ECS Service riêng
  12. [ ] Dùng CloudWatch Container Insights thay vì chỉ logs
  13. [ ] Thêm distributed tracing (AWS X-Ray)
```

---

## Sơ đồ Kiến trúc Đề xuất Sau Fix

```
Cloudflare (WAF + CDN)
       │
       ├─── Static Assets ────────────────► CloudFront → S3
       │    (JS/CSS/images)                 (cache 1 year)
       │
       └─── Dynamic (API + WS) ──────────► ALB
                                            │
                       ┌────────────────────┼──────────────────────┐
                       │                    │                       │
              ECS: chatcrm-api     ECS: chatcrm-worker   ECS: chatcrm-nginx
              (Fastify API only)   (ZaloPool + BullMQ)   (Nginx serve admin)
              Min:1, Max:10        Desired: 1 FIXED       Min:1, Max:3
              Stateless ✅         Stateful (pool)         Stateless ✅
                       │
                       ▼
              RDS Proxy → RDS PostgreSQL 16 (Multi-AZ)
              ElastiCache Redis (Multi-AZ) ← Socket.IO Adapter
              S3 (file storage)
```
