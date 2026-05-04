# Hướng dẫn Triển khai Production (Phase 9)

Tài liệu này hướng dẫn chi tiết cách triển khai hệ thống Chat Multi CRM lên môi trường Production với kiến trúc chịu tải cao (High Availability), Auto-scaling, bảo vệ bằng Cloudflare và tích hợp tự động hóa CI/CD qua GitHub Actions.

---

## 1. Kiến trúc Hệ thống Tổng thể

Kiến trúc được thiết kế cho hệ thống Multi-tenant SaaS, yêu cầu tính khả dụng cao và khả năng mở rộng ngang (Horizontal Scaling):

*   **DNS & Security:** Cloudflare (WAF, DDoS Protection, CDN).
*   **Load Balancing:** AWS Application Load Balancer (ALB).
*   **Compute:** AWS ECS (Elastic Container Service) chạy trên Fargate (Serverless compute).
*   **Database:** Amazon RDS for PostgreSQL (Multi-AZ, pgvector, RDS Proxy).
*   **Cache & Messaging:** Amazon ElastiCache for Redis (Socket.IO Adapter, BullMQ).
*   **Storage:** Amazon S3 (Lưu trữ ảnh Zalo, file đính kèm, attachments).
*   **CI/CD:** GitHub Actions.

---

## 2. Cấu hình CI/CD với GitHub Actions

Mục tiêu: Tự động hóa quá trình Kiểm thử, Build Docker Image và Deploy lên AWS ECS mỗi khi code được push vào nhánh `main`.

### Luồng hoạt động (Workflow)
1. Developer push code lên branch `main`.
2. GitHub Actions trigger workflow.
3. Chạy Unit Tests và Linter.
4. Đăng nhập vào AWS ECR (Elastic Container Registry).
5. Build Docker Image (gộp chung cả Backend và Frontend Frontend-Admin) và tag với mã Commit SHA.
6. Push Image lên AWS ECR.
7. Cập nhật ECS Task Definition với Image mới.
8. Trigger AWS ECS update service để rolling update (không downtime).

### File `.github/workflows/deploy.yml` mẫu:
```yaml
name: Deploy to Amazon ECS

on:
  push:
    branches: [ "main" ]

env:
  AWS_REGION: ap-southeast-1
  ECR_REPOSITORY: chatcrm-app
  ECS_SERVICE: chatcrm-service
  ECS_CLUSTER: chatcrm-cluster
  ECS_TASK_DEFINITION: .aws/task-def.json
  CONTAINER_NAME: chatcrm-container

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    environment: production

    steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: ${{ env.AWS_REGION }}

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v2

    - name: Build, tag, and push image to Amazon ECR
      id: build-image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG -f docker/Dockerfile .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

    - name: Fill in the new image ID in the Amazon ECS task definition
      id: task-def
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: ${{ env.ECS_TASK_DEFINITION }}
        container-name: ${{ env.CONTAINER_NAME }}
        image: ${{ steps.build-image.outputs.image }}

    - name: Deploy Amazon ECS task definition
      uses: aws-actions/amazon-ecs-deploy-task-definition@v1
      with:
        task-definition: ${{ steps.task-def.outputs.task-definition }}
        service: ${{ env.ECS_SERVICE }}
        cluster: ${{ env.ECS_CLUSTER }}
        wait-for-service-stability: true
```

---

## 3. Cấu hình Database & Redis chịu tải cao

Vì hệ thống có rất nhiều tiến trình chạy ngầm (AI, Zalo sync, cron jobs), Database là nút thắt cổ chai lớn nhất.

### Amazon RDS (PostgreSQL 16)
1. **Multi-AZ Deployment:** Bật tính năng Multi-AZ để AWS tạo một bản sao dự phòng ở Data Center khác. Khi server chính lỗi, hệ thống tự động failover sang server phụ mà không thay đổi endpoint.
2. **Instance Class:** Dùng ít nhất `db.m6g.large` (ARM-based Graviton2 để tiết kiệm chi phí và hiệu năng cao).
3. **Storage:** Sử dụng ổ io1/io2 (Provisioned IOPS) để xử lý lượng Read/Write lớn từ tin nhắn Zalo.
4. **AWS RDS Proxy (Quan trọng):** Node.js có nhược điểm về connection pool. Sử dụng AWS RDS Proxy đứng trước PostgreSQL để giữ và tái sử dụng các kết nối (Connection Multiplexing). File `.env` của App sẽ trỏ `DATABASE_URL` vào endpoint của RDS Proxy thay vì RDS gốc.
5. **pgvector:** Cần SSH/connect vào RDS chạy lệnh `CREATE EXTENSION vector;` để bật tính năng lưu trữ AI Embeddings.

### Amazon ElastiCache (Redis)
1. **Dùng làm Message Broker:** Phục vụ cho BullMQ (hàng đợi gửi tin nhắn campaign, đồng bộ Zalo).
2. **Socket.IO Pub/Sub:** Đảm bảo khi App scale ra nhiều instance (vd: 5 container ECS), tin nhắn WebSocket vẫn được gửi tới đúng thiết bị của user.
3. **Cấu hình:** Cluster Mode Disabled (vì không lưu dữ liệu quá lớn, chủ yếu là realtime messages/queues), dùng `cache.m6g.large` với Multi-AZ.

---

## 4. Cấu hình Cloudflare (Bảo mật & Tốc độ)

Cloudflare là lá chắn bảo vệ hệ thống khỏi DDoS và tối ưu hóa tốc độ tải trang.

1. **DNS & Proxy:**
   - Trỏ `A Record` (hoặc `CNAME`) `chatcrm.org` và `*.chatcrm.org` (Wildcard) về DNS của AWS Application Load Balancer.
   - Bật cờ "Cam" (Proxied) trên Cloudflare để ẩn IP thật của AWS.
2. **SSL/TLS:**
   - Chế độ: **Full (Strict)**.
   - Bạn cần tạo Origin Certificate trên Cloudflare và import vào AWS ACM để đảm bảo mã hóa đầu cuối 100%.
3. **Web Application Firewall (WAF) & Security:**
   - Security Level: **Medium** hoặc **High**.
   - Bật Bot Fight Mode.
   - Tạo WAF Rule: Chặn (Block) các IP từ các quốc gia không có nhu cầu sử dụng (ví dụ: Nga, Trung Quốc) nếu tệp khách hàng chỉ ở Việt Nam. Rate limit các endpoint nhạy cảm (như `/api/login` giới hạn 5 requests / 1 phút / IP).
4. **Caching & Page Rules:**
   - Cấu hình Cache Rule để bỏ qua (Bypass Cache) tất cả các request chứa `/api/*` và socket `/socket.io/*`.
   - Cấu hình Edge Cache TTL cho các assets tĩnh (`/assets/*`) lên 1 tháng để giảm tải cho AWS.

---

## 5. Chiến lược Auto Scaling (ECS Fargate)

Để chịu tải cho hàng chục ngàn người dùng và tin nhắn Zalo bắn liên tục, hệ thống cần tự động sinh thêm Server lúc cao điểm.

### Cấu hình AWS Application Auto Scaling (Target Tracking)
1. **CPU Tracking:** Tạo chính sách tự động tăng số lượng Task (Container) nếu trung bình CPU của Service vượt qua 70% trong 3 phút.
2. **Memory Tracking:** Tăng container nếu RAM vượt 75%.
3. **Scale Out (Tăng):** Thêm 2 instances mỗi lần alarm kích hoạt.
4. **Scale In (Giảm):** Giảm từ từ 1 instance khi CPU xuống dưới 40% trong 15 phút (tránh scale in quá nhanh gây gián đoạn).

### Quản lý Trạng thái (Stateless Architecture)
Để Auto-scale hoạt động trơn tru, Container phải hoàn toàn **Stateless** (Không lưu trạng thái nội bộ):
- **Sessions/Auth:** Dùng JWT (đã có sẵn trong code).
- **WebSockets:** Dùng Redis Adapter (đã cấu hình chuẩn).
- **Files/Uploads:** KHÔNG lưu trong thư mục container. Tất cả code upload file cần đẩy thẳng lên Amazon S3. Bạn cần cung cấp IAM Role cho ECS Task để có quyền `s3:PutObject` vào Bucket.

---

## 6. Sơ đồ Triển khai Cuối Cùng

```text
Người Dùng (Admin/Client)
       │
       ▼
[ Cloudflare (WAF/CDN/SSL) ]
       │
       ▼
[ AWS Application Load Balancer ]
       │
       ├──► [ ECS Fargate Task 1 (App Container) ]
       ├──► [ ECS Fargate Task 2 (App Container) ]
       └──► [ ECS Fargate Task N (Auto Scaled) ]
                     │
                     ├─► [ Amazon S3 ] (Lưu trữ ảnh/file Zalo)
                     │
                     ├─► [ ElastiCache Redis ] (BullMQ, Socket.io)
                     │
                     └─► [ RDS Proxy ] ──► [ Amazon RDS PostgreSQL 16 ]
```

### Các bước vận hành hàng ngày (Day-2 Operations)
- **Monitoring:** Sử dụng AWS CloudWatch để xem logs của ECS (Log group `/ecs/chatcrm`). Set alarm báo về Slack/Telegram nếu HTTP 500 xuất hiện quá 10 lần/phút.
- **Backups:** AWS RDS tự động backup (Point-in-time recovery). Cấu hình giữ backup 30 ngày.
- **Rollback:** Nếu deploy phiên bản mới qua GitHub Actions bị lỗi gây crash, AWS ECS sẽ tự động rollback về bản Image cũ nhờ tính năng `wait-for-service-stability` trong CI/CD.
