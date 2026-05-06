# Phase 9 — Production Deployment Plan
## Phần 3: CI/CD với GitHub Actions

---

## 1. Tổng quan Workflow

```
Push to main
     │
     ▼
┌─────────────────┐
│  Job: test      │  ← Chạy lint + type-check
└────────┬────────┘
         │ passed
         ▼
┌─────────────────┐
│  Job: migrate   │  ← Chạy prisma migrate deploy (ECS one-off task)
└────────┬────────┘
         │ done
         ▼
┌──────────────────────────────────────────────┐
│  Jobs: build (parallel)                       │
│   build-backend ──┐                           │
│   build-frontend ─┼─→ Push to ECR             │
│   build-admin ────┘                           │
└────────┬─────────────────────────────────────┘
         │ all images pushed
         ▼
┌──────────────────────────────────────────────┐
│  Jobs: deploy (sequential)                    │
│   deploy-backend → deploy-frontend            │
│                  → deploy-admin               │
└──────────────────────────────────────────────┘
```

---

## 2. Cấu hình GitHub Secrets cần thiết

Vào **GitHub Repo → Settings → Secrets and variables → Actions** và thêm:

```
AWS_ACCESS_KEY_ID          = <IAM user key cho CI/CD>
AWS_SECRET_ACCESS_KEY      = <IAM user secret>
AWS_REGION                 = ap-southeast-1
AWS_ACCOUNT_ID             = 123456789012

ECR_REPO_BACKEND           = chatcrm-backend
ECR_REPO_FRONTEND          = chatcrm-frontend
ECR_REPO_ADMIN             = chatcrm-admin

ECS_CLUSTER                = chatcrm-cluster
ECS_SERVICE_BACKEND        = chatcrm-backend-service
ECS_SERVICE_FRONTEND       = chatcrm-frontend-service
ECS_SERVICE_ADMIN          = chatcrm-admin-service

VITE_API_URL               = https://api.chatcrm.org
VITE_WS_URL                = wss://api.chatcrm.org
```

### IAM Policy cho CI/CD user (tối thiểu quyền cần thiết)
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
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:RunTask",
        "ecs:DescribeTasks"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": [
        "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
        "arn:aws:iam::ACCOUNT:role/ecsTaskRole"
      ]
    }
  ]
}
```

---

## 3. Main Deploy Workflow

```yaml
# .github/workflows/deploy.yml
name: 🚀 Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:   # cho phép trigger thủ công

concurrency:
  group: production-deploy
  cancel-in-progress: false  # KHÔNG cancel deploy đang chạy

env:
  AWS_REGION: ${{ secrets.AWS_REGION }}
  ECR_REGISTRY: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com

jobs:
  # ─────────────────────────────────────────────
  # JOB 1: Kiểm tra code chất lượng
  # ─────────────────────────────────────────────
  test:
    name: 🧪 Test & Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install backend deps
        run: npm ci
        working-directory: backend

      - name: TypeScript type check
        run: npx tsc --noEmit
        working-directory: backend

      - name: Lint
        run: npm run lint --if-present
        working-directory: backend

  # ─────────────────────────────────────────────
  # JOB 2: Build & Push Docker Images (parallel)
  # ─────────────────────────────────────────────
  build-backend:
    name: 🔨 Build Backend Image
    runs-on: ubuntu-latest
    needs: test
    outputs:
      image: ${{ steps.build.outputs.image }}
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag & push backend image
        id: build
        env:
          IMAGE_TAG: ${{ github.sha }}
          REPO: ${{ secrets.ECR_REPO_BACKEND }}
        run: |
          docker build \
            -f docker/Dockerfile.backend \
            -t $ECR_REGISTRY/$REPO:$IMAGE_TAG \
            -t $ECR_REGISTRY/$REPO:latest \
            .
          docker push $ECR_REGISTRY/$REPO:$IMAGE_TAG
          docker push $ECR_REGISTRY/$REPO:latest
          echo "image=$ECR_REGISTRY/$REPO:$IMAGE_TAG" >> $GITHUB_OUTPUT

  build-frontend:
    name: 🔨 Build Frontend Image
    runs-on: ubuntu-latest
    needs: test
    outputs:
      image: ${{ steps.build.outputs.image }}
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag & push frontend image
        id: build
        env:
          IMAGE_TAG: ${{ github.sha }}
          REPO: ${{ secrets.ECR_REPO_FRONTEND }}
        run: |
          docker build \
            -f docker/Dockerfile.frontend \
            --build-arg VITE_API_URL=${{ secrets.VITE_API_URL }} \
            --build-arg VITE_WS_URL=${{ secrets.VITE_WS_URL }} \
            -t $ECR_REGISTRY/$REPO:$IMAGE_TAG \
            -t $ECR_REGISTRY/$REPO:latest \
            .
          docker push $ECR_REGISTRY/$REPO:$IMAGE_TAG
          docker push $ECR_REGISTRY/$REPO:latest
          echo "image=$ECR_REGISTRY/$REPO:$IMAGE_TAG" >> $GITHUB_OUTPUT

  build-admin:
    name: 🔨 Build Admin Image
    runs-on: ubuntu-latest
    needs: test
    outputs:
      image: ${{ steps.build.outputs.image }}
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag & push admin image
        id: build
        env:
          IMAGE_TAG: ${{ github.sha }}
          REPO: ${{ secrets.ECR_REPO_ADMIN }}
        run: |
          docker build \
            -f docker/Dockerfile.frontend-admin \
            --build-arg VITE_API_URL=${{ secrets.VITE_API_URL }} \
            -t $ECR_REGISTRY/$REPO:$IMAGE_TAG \
            -t $ECR_REGISTRY/$REPO:latest \
            .
          docker push $ECR_REGISTRY/$REPO:$IMAGE_TAG
          docker push $ECR_REGISTRY/$REPO:latest
          echo "image=$ECR_REGISTRY/$REPO:$IMAGE_TAG" >> $GITHUB_OUTPUT

  # ─────────────────────────────────────────────
  # JOB 3: Chạy DB Migration trước khi deploy
  # ─────────────────────────────────────────────
  migrate:
    name: 🗄️ Run DB Migration
    runs-on: ubuntu-latest
    needs: build-backend
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Run Prisma migrate via ECS one-off task
        run: |
          TASK_ARN=$(aws ecs run-task \
            --cluster ${{ secrets.ECS_CLUSTER }} \
            --task-definition chatcrm-backend \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[subnet-XXXX,subnet-YYYY],securityGroups=[sg-XXXX],assignPublicIp=DISABLED}" \
            --overrides '{
              "containerOverrides": [{
                "name": "chatcrm-backend",
                "command": ["npx", "prisma", "migrate", "deploy"]
              }]
            }' \
            --query 'tasks[0].taskArn' \
            --output text)
          
          echo "Migration task ARN: $TASK_ARN"
          
          # Chờ migration hoàn thành
          aws ecs wait tasks-stopped \
            --cluster ${{ secrets.ECS_CLUSTER }} \
            --tasks $TASK_ARN
          
          # Kiểm tra exit code
          EXIT_CODE=$(aws ecs describe-tasks \
            --cluster ${{ secrets.ECS_CLUSTER }} \
            --tasks $TASK_ARN \
            --query 'tasks[0].containers[0].exitCode' \
            --output text)
          
          if [ "$EXIT_CODE" != "0" ]; then
            echo "❌ Migration failed with exit code $EXIT_CODE"
            exit 1
          fi
          echo "✅ Migration completed successfully"

  # ─────────────────────────────────────────────
  # JOB 4: Deploy Backend
  # ─────────────────────────────────────────────
  deploy-backend:
    name: 🚀 Deploy Backend
    runs-on: ubuntu-latest
    needs: [build-backend, migrate]
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Download current task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition chatcrm-backend \
            --query taskDefinition > .aws/task-def-backend.json

      - name: Update image in task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: .aws/task-def-backend.json
          container-name: chatcrm-backend
          image: ${{ needs.build-backend.outputs.image }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ secrets.ECS_SERVICE_BACKEND }}
          cluster: ${{ secrets.ECS_CLUSTER }}
          wait-for-service-stability: true
          wait-for-minutes: 10

  # ─────────────────────────────────────────────
  # JOB 5: Deploy Frontend & Admin (sau backend)
  # ─────────────────────────────────────────────
  deploy-frontend:
    name: 🚀 Deploy Frontend
    runs-on: ubuntu-latest
    needs: [build-frontend, deploy-backend]
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Download current task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition chatcrm-frontend \
            --query taskDefinition > .aws/task-def-frontend.json

      - name: Update image in task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: .aws/task-def-frontend.json
          container-name: chatcrm-frontend
          image: ${{ needs.build-frontend.outputs.image }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ secrets.ECS_SERVICE_FRONTEND }}
          cluster: ${{ secrets.ECS_CLUSTER }}
          wait-for-service-stability: true

  deploy-admin:
    name: 🚀 Deploy Admin
    runs-on: ubuntu-latest
    needs: [build-admin, deploy-backend]
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Download current task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition chatcrm-admin \
            --query taskDefinition > .aws/task-def-admin.json

      - name: Update image in task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: .aws/task-def-admin.json
          container-name: chatcrm-admin
          image: ${{ needs.build-admin.outputs.image }}

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ secrets.ECS_SERVICE_ADMIN }}
          cluster: ${{ secrets.ECS_CLUSTER }}
          wait-for-service-stability: true

  # ─────────────────────────────────────────────
  # JOB 6: Notify kết quả deploy
  # ─────────────────────────────────────────────
  notify:
    name: 📢 Notify Deploy Result
    runs-on: ubuntu-latest
    needs: [deploy-backend, deploy-frontend, deploy-admin]
    if: always()
    steps:
      - name: Notify Telegram
        uses: appleboy/telegram-action@master
        with:
          to: ${{ secrets.TELEGRAM_CHAT_ID }}
          token: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          message: |
            ${{ needs.deploy-backend.result == 'success' && '✅' || '❌' }} Deploy to Production
            
            📦 Commit: ${{ github.sha }}
            👤 By: ${{ github.actor }}
            📝 Message: ${{ github.event.head_commit.message }}
            
            Backend: ${{ needs.deploy-backend.result }}
            Frontend: ${{ needs.deploy-frontend.result }}
            Admin: ${{ needs.deploy-admin.result }}
            
            🔗 https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

---

## 4. Workflow Rollback thủ công

```yaml
# .github/workflows/rollback.yml
name: 🔄 Rollback Production

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Docker image tag to rollback to (commit SHA)'
        required: true
      service:
        description: 'Service to rollback (backend/frontend/admin/all)'
        required: true
        default: 'all'

jobs:
  rollback:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Rollback Backend
        if: inputs.service == 'backend' || inputs.service == 'all'
        run: |
          IMAGE="$ECR_REGISTRY/${{ secrets.ECR_REPO_BACKEND }}:${{ inputs.image_tag }}"
          # Tìm task definition revision dùng image này
          TASK_DEF=$(aws ecs describe-task-definition \
            --task-definition chatcrm-backend --query 'taskDefinition' | \
            jq ".containerDefinitions[0].image = \"$IMAGE\"" | \
            aws ecs register-task-definition --cli-input-json file:///dev/stdin \
            --query 'taskDefinition.taskDefinitionArn' --output text)
          
          aws ecs update-service \
            --cluster ${{ secrets.ECS_CLUSTER }} \
            --service ${{ secrets.ECS_SERVICE_BACKEND }} \
            --task-definition $TASK_DEF
          echo "✅ Backend rolled back to ${{ inputs.image_tag }}"
        env:
          ECR_REGISTRY: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ secrets.AWS_REGION }}.amazonaws.com
```

---

## 5. ECR Lifecycle Policy (Dọn dẹp images cũ, tiết kiệm storage)

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Giữ 10 images mới nhất theo tag",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["sha-"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Xóa untagged images sau 7 ngày",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    }
  ]
}
```

---

**File tiếp theo:** [PHASE9-PART4-CLOUDFLARE.md] — Cloudflare WAF, rules, caching chi tiết
