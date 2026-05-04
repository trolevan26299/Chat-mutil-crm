# Chat Multi CRM — Quản lý nhiều tài khoản Zalo cá nhân

Hệ thống quản lý tập trung nhiều tài khoản Zalo cá nhân trên 1 giao diện web duy nhất. Chat real-time, AI tự động trả lời (RAG Knowledge Base), workflow automation, chiến dịch gửi tin hàng loạt, tích hợp đa nền tảng, analytics nâng cao, PWA mobile.

**GitHub:** [https://github.com/trolevan26299/Chat-mutil-crm](https://github.com/trolevan26299/Chat-mutil-crm)

---

## Tính năng đầy đủ

### 💬 Chat & Tin nhắn

- **Chat real-time** — Gửi/nhận text, ảnh (nhiều ảnh cùng lúc), file, video, sticker, voice
- **Trả lời tin nhắn (Quote/Reply)** — Reply trực tiếp tin nhắn cụ thể, hiển thị preview tin gốc
- **Thả cảm xúc (Reaction)** — Thả emoji/sticker reaction lên tin nhắn, đồng bộ real-time
- **Thu hồi tin nhắn (Undo)** — Thu hồi tin đã gửi, đồng bộ xóa trên cả CRM và Zalo
- **Tìm & gửi Sticker** — Tìm kiếm sticker Zalo theo keyword, gửi trực tiếp trong chat
- **Proxy file download** — Tải file/ảnh từ Zalo CDN qua server proxy (bypass cookie auth)
- **Sticker image proxy** — Proxy ảnh sticker từ Zalo CDN, cache 24h
- **Tin nhắn đặc biệt** — Hiển thị sticker, hình ảnh, video, file, chuyển khoản, cuộc gọi, QR, nhắc hẹn
- **Tab "Khác"** — Ẩn hội thoại không quan trọng sang tab riêng, chuột phải để chuyển tab
- **Bộ lọc hội thoại** — Lọc theo chưa đọc, chưa trả lời, thời gian, tags, với bộ đếm realtime
- **Template nhanh** — Gõ `/` trong ô chat để chèn mẫu tin nhắn với biến động (`{{tên}}`, `{{ngày}}`, `{{trạng thái}}`)
- **Tên KH 2 lớp** — CRM Name (tên thật) + Zalo Name, ưu tiên CRM Name hiển thị

### 📱 Quản lý tài khoản Zalo

- **Multi-account** — Đăng nhập nhiều tài khoản Zalo cùng lúc qua QR code
- **Auto-reconnect** — Tự kết nối lại khi mất kết nối, lưu phiên đăng nhập (session persistence)
- **Circuit breaker** — Phát hiện >5 lần disconnect trong 5 phút → yêu cầu QR re-login
- **Proxy per-account** — Cấu hình proxy HTTP/SOCKS5 riêng cho từng tài khoản, tránh block IP
- **selfListen** — Nhận cả tin nhắn gửi từ app Zalo gốc, dedup tránh trùng
- **Đồng bộ tin cũ** — Lấy tin nhắn cũ (old_messages) khi kết nối, backfill vào DB
- **Sync nhóm chat** — Polling backup group messages mỗi 5 phút qua `getGroupChatHistory()`
- **Backfill orphaned conversations** — Tự liên kết hội thoại mồ côi với contact qua Zalo API
- **Health check** — Kiểm tra kết nối Zalo định kỳ
- **User info cache** — Cache thông tin user Zalo (tên, avatar) 5 phút, tự cập nhật avatar contact

### 🤖 AI Assistant (Multi-Provider via OpenRouter)

- **Gợi ý trả lời (Reply Draft)** — AI soạn sẵn câu trả lời dựa trên ngữ cảnh hội thoại
- **Tóm tắt hội thoại (Summary)** — Tóm tắt nội dung cuộc trò chuyện
- **Phân tích cảm xúc (Sentiment)** — Đánh giá cảm xúc khách hàng (positive/neutral/negative) với confidence score
- **AI tự động trả lời** — Automation action gửi tin nhắn AI tự động khi khách nhắn, với debounce 45s chờ khách gõ xong
- **Multi-message split** — AI chia reply thành 2-4 tin nhắn ngắn tự nhiên (delimiter `---MSG---`)
- **Phát hiện ngôn ngữ** — Tự động detect tiếng Việt/English, luôn trả lời bằng tiếng Việt
- **18+ model AI** — Anthropic Claude, Google Gemini, OpenAI GPT-4o, Meta Llama, DeepSeek, Qwen, Mistral
- **Quota & billing** — Giới hạn request/ngày, theo dõi chi phí OpenRouter (daily/monthly), biểu đồ 7 ngày
- **Cấu hình linh hoạt** — Chọn model, set quota, bật/tắt AI theo tổ chức

### 🧠 Knowledge Base (RAG)

- **Kho tri thức đội nhóm** — Mỗi team có knowledge base riêng, AI tham chiếu khi trả lời
- **3 loại nguồn** — Text thủ công, URL (auto-crawl max 50 subpages), PDF upload (parse nội dung)
- **Web Crawler** — Crawl cùng domain, loại bỏ nav/footer/script, deduplicate nội dung trùng giữa các trang
- **Chunking thông minh** — Chia text 800 ký tự/chunk, overlap 150, ưu tiên cắt theo paragraph/sentence
- **Vector Embeddings** — Google Gemini `gemini-embedding-2` (768 dimensions), lưu trong pgvector
- **Semantic Search** — Cosine similarity search, Top-5 chunks, threshold 0.3
- **RAG Integration** — Inject knowledge context vào prompt AI khi gợi ý trả lời hoặc auto-reply
- **Re-index** — Hỗ trợ re-index lại knowledge đã tạo
- **Background indexing** — Indexing chạy async, không block UI

### ⚡ Workflow Automation

- **3 trigger** — `message_received`, `contact_created`, `status_changed`
- **8 toán tử điều kiện** — `eq`, `neq`, `contains`, `in`, `gt`, `lt`, `is_empty`, `is_not_empty`
- **6 field lọc** — `contact.source`, `contact.status`, `contact.assignedUserId`, `contact.aiAutoReply`, `message.content`, `message.contentType`
- **5 loại action**:
  - `assign_user` — Phân công nhân viên phụ trách
  - `update_status` — Cập nhật trạng thái pipeline
  - `send_template` — Gửi tin nhắn template tự động
  - `create_appointment` — Tạo lịch hẹn (offset giờ tùy chỉnh)
  - `ai_reply` — AI tự động trả lời (debounce 45s)
- **Priority & chống loop** — Sắp xếp theo priority, max recursion depth = 3
- **Template renderer** — Render biến động trong template (`{{contact.fullName}}`, `{{org.name}}`, ...)

### 📢 Chiến dịch (Campaign)

- **Nhóm khách hàng** — 3 chế độ: `all` (tất cả), `manual` (chọn tay), `exclude` (loại trừ)
- **Nội dung đa phương tiện** — Kết hợp text + nhiều ảnh trong 1 chiến dịch, gộp ảnh liền kề thành 1 message
- **Lập lịch** — Gửi 1 lần, hàng ngày, hàng tuần, hàng tháng (timezone UTC+7)
- **Anti-spam** — Chunk 3 contacts, delay 1-2s giữa contacts, 5-10s giữa chunks
- **Queue system** — Hàng đợi gửi tin với trạng thái: pending → sending → sent/failed
- **Scheduler** — Kiểm tra campaigns đến hạn mỗi 60 giây, auto-run
- **Preview** — Xem trước danh sách contacts và queue trước khi gửi

### 👥 Quản lý khách hàng (CRM)

- **Pipeline** — Mới → Đã liên hệ → Quan tâm → Chuyển đổi → Mất
- **Lead Scoring** — Tự động tính điểm: +10/tin nhắn 7 ngày (max 40), +20 có lịch hẹn, +30 status "interested", -10/-20 penalty lâu không hoạt động
- **Auto Tagging** — Tự động gắn tag dựa trên lead score và last activity
- **Duplicate Detection** — Phát hiện trùng theo phone, zalo_uid, name
- **Merge Contacts** — Gộp khách hàng trùng, giữ lại 1 bản chính
- **Contact Intelligence** — Cron job định kỳ chạy lead scoring + auto tag + duplicate detection
- **CRM Name** — Tên riêng trong CRM (khác Zalo Name), ưu tiên hiển thị
- **Metadata mở rộng** — JSON metadata tùy chỉnh (VD: `aiAutoReply: true`)

### 📅 Lịch hẹn

- **CRUD** — Tạo, xem, sửa, xóa lịch hẹn theo contact
- **Trạng thái** — scheduled, completed, cancelled, no_show
- **Nhắc nhở tự động** — Cron job nhắc lịch hẹn hàng ngày qua Socket.IO
- **Liên kết** — Gắn với contact và assigned user

### 📊 Dashboard & Analytics

- **Dashboard** — Biểu đồ tin nhắn, KPI, nguồn khách hàng, trạng thái pipeline
- **Daily Message Stats** — Thống kê tin nhắn gửi/nhận/chưa đọc/chưa trả lời theo ngày per user per account
- **Saved Reports** — Lưu cấu hình báo cáo: conversion funnel, team performance, response time, custom
- **Báo cáo Excel** — Xuất báo cáo Excel, lọc theo thời gian

### 🔗 Tích hợp bên ngoài (Integration Hub)

- **Google Sheets** — Import/export contacts
- **Telegram Bot** — Thông báo qua Telegram
- **Facebook** — Đồng bộ leads từ Facebook
- **Zapier Webhook** — Kết nối với 5000+ ứng dụng qua Zapier
- **Sync Engine** — Hệ thống sync chung cho tất cả providers, ghi log sync

### 🔐 Phân quyền & Bảo mật

- **3 vai trò** — Owner / Admin / Member
- **Đội nhóm** — Organization → Teams → Users (N-N), 1 user thuộc nhiều team
- **ACL Zalo** — Phân quyền truy cập tài khoản Zalo: read / chat / admin
- **JWT Auth** — Xác thực bằng JWT token
- **Rate Limiting** — 500 req/phút cho API, 200 tin/ngày và 5 tin/30s cho Zalo
- **Encryption** — Mã hóa settings nhạy cảm (API keys)
- **Security** — `no-new-privileges`, tmpfs cho /tmp, healthcheck

### 🌐 API công khai & Webhook

- **REST API** — Xác thực qua header `X-API-Key`
- **11 endpoints**:

| Phương thức | Đường dẫn | Mô tả |
|------------|----------|-------|
| GET | `/api/public/contacts` | Danh sách KH (search, filter status) |
| GET | `/api/public/contacts/:id` | Chi tiết KH + appointments |
| POST | `/api/public/contacts` | Tạo KH mới |
| PUT | `/api/public/contacts/:id` | Cập nhật KH |
| GET | `/api/public/conversations` | Danh sách hội thoại |
| GET | `/api/public/conversations/:id/messages` | Tin nhắn trong hội thoại |
| GET | `/api/public/appointments` | Lịch hẹn (filter from/to) |
| POST | `/api/public/appointments` | Tạo lịch hẹn |
| POST | `/api/public/messages/send` | Gửi tin nhắn |

- **5 sự kiện Webhook**: `message.received`, `message.sent`, `contact.created`, `zalo.connected`, `zalo.disconnected`

### 🔍 Tìm kiếm & Thông báo

- **Global Search** — Tìm khách hàng, tin nhắn, lịch hẹn toàn hệ thống
- **Thông báo realtime** — Tin chưa trả lời >30 phút, lịch hẹn sắp tới, Zalo mất kết nối
- **Notification Bell** — UI thông báo trong app

### 📱 Giao diện & Mobile

- **Vue 3 + Vuetify 4** — Material Design 3, responsive
- **Theme tối/sáng** — Chuyển đổi dark/light mode
- **PWA** — Service Worker, offline support, installable trên điện thoại
- **Mobile views** — Giao diện chat và contacts riêng cho mobile
- **Pull to Refresh** — Kéo xuống để refresh (mobile)
- **Offline Queue** — Hàng đợi hành động khi mất mạng
- **Bottom Navigation** — Thanh điều hướng dưới cùng cho mobile
- **Emoji Picker** — Bộ chọn emoji trong chat
- **Setup Wizard** — Trang thiết lập ban đầu khi chưa có admin
- **14 trang giao diện** — Dashboard, Chat, Contacts, Zalo Accounts, Appointments, Reports, Analytics, Settings, API Settings, Integrations, Automation, Campaigns, Mobile Chat, Mobile Contact
- **Dashboard 5 biểu đồ** — KPI Cards, Message Volume, Pipeline, Source, Appointment Charts
- **Analytics 5 biểu đồ** — Conversion Funnel, Response Time, Team Leaderboard, Trend Line, Report Builder
- **Settings 4 tab** — Nhân viên (CRUD, reset password), Đội nhóm (team management, Zalo access), Tổ chức, AI (model picker, usage chart, billing)
- **Automation UI** — Rule Builder visual, Condition Editor, Action Editor, Template Manager
- **Campaign UI** — Campaign Dialog (nội dung text+ảnh), Group Dialog (chọn KH), Queue Preview (xem trước hàng đợi)
- **Contact UI** — Detail Dialog, Filters, Duplicate Review Dialog
- **Chat UI** — Conversation List, Message Thread (52KB+), Contact Panel, Quick Template Popup, Special Message Renderer

---

## Kiến trúc hệ thống

### Docker Compose — 3 Container

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                                                          │
│  ┌──────────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  zalo-crm-app    │  │ zalo-crm-db  │  │ zalo-crm-  │ │
│  │  Node.js 20      │──│ PostgreSQL   │──│ backup     │ │
│  │  Fastify 5       │  │ 16 + pgvector│  │ @daily     │ │
│  │  Vue 3 (static)  │  │ Port: 5432   │  │ 7d/4w/3m   │ │
│  │  Port: 3002      │  └──────────────┘  └────────────┘ │
│  └──────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

| Container | Image | Vai trò |
|-----------|-------|---------|
| `zalo-crm-app` | `node:20-alpine` (multi-stage) | Backend + Frontend, 14 modules, Socket.IO, AI, Zalo SDK |
| `zalo-crm-db` | `pgvector/pgvector:pg16` | PostgreSQL 16 + pgvector (23 models, vector embeddings) |
| `zalo-crm-backup` | `prodrigestivill/postgres-backup-local` | Auto backup hàng ngày, giữ 7 ngày / 4 tuần / 3 tháng |

### Multi-stage Docker Build

1. **Stage 1** — Build Frontend (Vue 3 + Vite → static files)
2. **Stage 2** — Build Backend (TypeScript → JS, Prisma generate)
3. **Stage 3** — Production image gọn nhẹ, `prisma db push` → `node dist/app.js`

### Backend Modules (14)

| Module | Files | Chức năng |
|--------|-------|----------|
| `auth` | auth, user, team, org routes | JWT, phân quyền, quản lý đội nhóm |
| `zalo` | pool, listener, sync, rate-limiter, health-check | Quản lý tài khoản Zalo, QR login, proxy |
| `chat` | chat-routes, message-handler | Conversations, messages, send/receive |
| `contacts` | contacts, appointments, lead-scoring, duplicate, merge | CRM pipeline, lịch hẹn, intelligence |
| `ai` | ai-service, prompts, providers, provider-registry | AI gợi ý, tóm tắt, sentiment |
| `knowledge` | knowledge-service, chunking, embedding, rag-retrieval | RAG knowledge base, vector search |
| `campaign` | campaign-routes, runner, scheduler | Chiến dịch gửi tin hàng loạt |
| `automation` | automation-service, template-renderer, 6 actions | Workflow tự động |
| `integrations` | integration-routes, sync-engine, 4 providers | Google Sheets, Telegram, Facebook, Zapier |
| `analytics` | analytics-routes, analytics-service, reports | Phân tích, báo cáo |
| `dashboard` | dashboard-routes, report-routes | KPIs, biểu đồ |
| `notifications` | notification-routes | Thông báo realtime |
| `search` | search-routes | Tìm kiếm toàn hệ thống |
| `api` | public-api-routes, webhook-service, webhook-settings | REST API + Webhook |

### Database Schema (23 models)

`Organization` → `Team` → `TeamMember` → `User` → `ZaloAccount` → `ZaloAccountAccess` → `Contact` → `Conversation` → `Message` → `Appointment` → `ActivityLog` → `DailyMessageStat` → `Integration` → `SyncLog` → `AppSetting` → `DuplicateGroup` → `SavedReport` → `AutomationRule` → `MessageTemplate` → `AiConfig` → `AiSuggestion` → `CampaignGroup` → `Campaign` → `CampaignQueue` → `TeamKnowledge` → `KnowledgeChunk`

---

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|-----------|----------|
| Backend | Node.js 20 / Fastify 5 / Prisma 7 / TypeScript 6 |
| Frontend | Vue 3 / Vuetify 4 / Vite 8 / Chart.js / Pinia 3 |
| AI Generation | OpenRouter API (18+ models: Claude, Gemini, GPT-4o, Llama, DeepSeek, Qwen, Mistral) |
| AI Embeddings | Google Gemini `gemini-embedding-2` (768 dimensions) |
| Vector DB | PostgreSQL 16 + pgvector extension |
| Real-time | Socket.IO 4.x |
| Zalo SDK | zca-js 2.x (QR login, send/receive, sticker, reaction, undo, group) |
| Proxy | https-proxy-agent + socks-proxy-agent (HTTP/SOCKS5) |
| Web Scraping | Cheerio (crawl URL cho knowledge base) |
| PDF Parse | pdf-parse (extract text từ PDF) |
| Excel | ExcelJS (xuất báo cáo) |
| Cron | node-cron (scheduler) |
| Mobile | PWA (Service Worker + Web App Manifest) |
| Triển khai | Docker Compose (3 containers) |
| Backup | prodrigestivill/postgres-backup-local |

---

## Yêu cầu hệ thống

| Thành phần | Tối thiểu | Khuyến nghị |
|-----------|----------|------------|
| CPU | 1 vCPU | 2-4 vCPU |
| RAM | 1 GB | 4 GB |
| Ổ cứng | 10 GB | 20 GB SSD |
| Hệ điều hành | Ubuntu 20.04+ | Ubuntu 22.04 LTS |
| Phần mềm | Docker + Docker Compose | Docker 24+ |

## Cài đặt nhanh

> Hướng dẫn chi tiết: [HUONG-DAN-CAI-DAT.md](HUONG-DAN-CAI-DAT.md)

```bash
git clone https://github.com/trolevan26299/Chat-mutil-crm.git
cd Chat-mutil-crm
cp .env.example .env
# Sửa file .env — đặt mật khẩu, JWT secret, API keys
docker compose up -d --build
```

Truy cập **http://IP-server:3002** → Tạo tài khoản admin lần đầu.

### Biến môi trường quan trọng

| Biến | Mô tả |
|------|-------|
| `JWT_SECRET` | Secret key cho JWT token (bắt buộc thay đổi) |
| `ENCRYPTION_KEY` | Key mã hóa settings nhạy cảm (16+ ký tự) |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Thông tin PostgreSQL |
| `OPENROUTER_API_KEY` | API key OpenRouter cho AI (https://openrouter.ai) |
| `AI_DEFAULT_MODEL` | Model AI mặc định (VD: `google/gemini-2.0-flash-001`) |
| `GOOGLE_AI_API_KEY` | API key Google AI cho embeddings RAG (https://aistudio.google.com/apikey) |

### Phát triển (Development)

```bash
# Chỉ chạy DB
docker compose -f docker-compose.dev.yml up -d

# Chạy backend (hot reload)
cd backend && npm run dev

# Chạy frontend (hot reload)
cd frontend && npm run dev
```

---

## Background Jobs

| Job | Tần suất | Chức năng |
|-----|---------|----------|
| Appointment Reminder | Hàng ngày | Nhắc lịch hẹn qua Socket.IO |
| Zalo Health Check | Định kỳ | Kiểm tra kết nối Zalo |
| Contact Intelligence | Định kỳ | Lead scoring + auto tag + duplicate detection |
| Campaign Scheduler | Mỗi 60s | Kiểm tra và chạy campaigns đến hạn |
| Group Message Sync | Mỗi 5 phút | Polling backup tin nhắn nhóm |
| Auto-reconnect | Khi disconnect | Tự kết nối lại Zalo sau 30s |
| DB Backup | Hàng ngày | pg_dump tự động |

---

## Lịch sử phiên bản

### v2.2 (04/05/2026)
- 🧠 RAG Knowledge Base: kho tri thức đội nhóm, crawl URL/PDF, vector embeddings pgvector, semantic search
- 🤖 AI Auto-Reply: automation action AI tự động trả lời, debounce 45s, multi-message split
- 📢 Campaign Module: chiến dịch gửi tin hàng loạt, nhóm KH, scheduler, anti-spam, gộp ảnh
- 💬 Quote/Reply: trả lời tin nhắn cụ thể
- 😀 Reaction: thả cảm xúc emoji/sticker lên tin nhắn
- 🔄 Undo: thu hồi tin nhắn đã gửi
- 🎨 Sticker search: tìm kiếm và gửi sticker Zalo
- 🛡️ Circuit breaker: phát hiện disconnect liên tục, yêu cầu QR re-login
- 🔗 Backfill orphaned conversations: tự liên kết hội thoại mồ côi
- 📊 AI Usage tracking: biểu đồ 7 ngày, chi phí OpenRouter
- 🌐 18+ AI models qua OpenRouter

### v2.1 (16/04/2026)
- Tab "Khác": ẩn hội thoại không quan trọng
- Tên KH 2 lớp: CRM Name + Zalo Name
- Bộ lọc hội thoại: chưa đọc, chưa trả lời, thời gian, tags
- Template nhanh: gõ `/` để chèn mẫu tin nhắn
- Tin nhắn đặc biệt: sticker, ảnh, video, file, chuyển khoản, cuộc gọi
- Đồng bộ tin nhắn: lấy 50 tin cũ, selfListen dedup
- Fix: tên "Unknown", PWA setup

### v2.0 (31/03/2026)
- AI Assistant: gợi ý trả lời, tóm tắt, phân tích cảm xúc
- Workflow Automation: tự động gửi tin, phân loại khách
- Integration Hub: Google Sheets, Telegram, Facebook, Zapier
- Mobile PWA: offline, responsive, installable
- Contact Intelligence: gộp trùng, lead scoring, auto-tag
- Advanced Analytics: funnel, team perf, report builder
- Multi-Provider AI: hỗ trợ nhiều nhà cung cấp
- Proxy per-account: proxy riêng cho từng Zalo

### v1.0 (29/03/2026)
- MVP: Quản lý nhiều Zalo, chat, CRM, lịch hẹn, dashboard, báo cáo, API, webhook

---

## Cấu trúc dự án

```
├── docker-compose.yml          # Production (3 containers)
├── docker-compose.dev.yml      # Dev (chỉ DB)
├── docker/Dockerfile           # Multi-stage build
├── .env                        # Config
├── backend/
│   ├── src/
│   │   ├── app.ts              # Entry point (Fastify + Socket.IO)
│   │   ├── config/             # Env config
│   │   ├── shared/             # DB client, logger, utils
│   │   └── modules/
│   │       ├── auth/           # JWT, roles, teams, org
│   │       ├── zalo/           # Pool, listener, sync, rate-limiter
│   │       ├── chat/           # Messages, conversations
│   │       ├── contacts/       # CRM, appointments, intelligence
│   │       ├── ai/             # AI service, prompts, providers
│   │       ├── knowledge/      # RAG, chunking, embeddings
│   │       ├── campaign/       # Mass messaging, scheduler
│   │       ├── automation/     # Rules, actions, templates
│   │       ├── integrations/   # External services
│   │       ├── analytics/      # Reports
│   │       ├── dashboard/      # KPIs
│   │       ├── notifications/  # Alerts
│   │       ├── search/         # Global search
│   │       └── api/            # Public API + webhooks
│   └── prisma/
│       └── schema.prisma       # 23+ data models
├── frontend/
│   └── src/
│       ├── views/              # 17 page components
│       ├── components/         # Chat, AI, Campaign, Analytics UI
│       ├── composables/        # 13 composables (use-chat, use-contacts...)
│       ├── stores/             # Pinia state management
│       └── api/                # Axios HTTP client
└── backups/                    # Auto backup files
```

## Giấy phép

Phần mềm thương mại — Bản quyền thuộc về tác giả. Vui lòng liên hệ để được cấp phép sử dụng.

**GitHub:** [https://github.com/trolevan26299/Chat-mutil-crm](https://github.com/trolevan26299/Chat-mutil-crm)
