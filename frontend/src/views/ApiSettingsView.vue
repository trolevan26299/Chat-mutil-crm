<template>
  <div style="max-width: 700px;">
    <div class="d-flex align-center justify-space-between mb-4">
      <h1 class="text-h5">
        <v-icon class="mr-2" color="primary">mdi-api</v-icon>
        API & Webhook
      </h1>
      <v-btn color="primary" variant="outlined" prepend-icon="mdi-book-open-page-variant" @click="showApiDocs = true">
        Tài liệu API
      </v-btn>
    </div>

    <!-- API Key section -->
    <v-card class="mb-6" elevation="0" border>
      <v-card-title class="text-h6 px-6 pt-6 pb-2">API Key</v-card-title>
      <v-card-text class="px-6 pb-6">
        <v-text-field
          v-model="apiKey"
          label="API Key"
          readonly
          append-inner-icon="mdi-content-copy"
          @click:append-inner="copyKey"
        />
        <v-btn
          color="primary"
          variant="outlined"
          prepend-icon="mdi-refresh"
          :loading="generatingKey"
          @click="generateKey"
        >
          Tạo key mới
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- Webhook section -->
    <v-card class="mb-6" elevation="0" border>
      <v-card-title class="text-h6 px-6 pt-6 pb-2">Webhook</v-card-title>
      <v-card-text class="px-6 pb-6">
        <v-text-field
          v-model="webhookUrl"
          label="Webhook URL"
          placeholder="https://your-server.com/webhook"
          class="mb-2"
        />
        <v-text-field
          v-model="webhookSecret"
          label="Secret (HMAC)"
          type="password"
          class="mb-3"
        />
        <div class="d-flex gap-2">
          <v-btn color="primary" :loading="saving" @click="saveWebhook">Lưu</v-btn>
          <v-btn variant="outlined" :loading="testing" @click="testWebhook">Test Webhook</v-btn>
        </div>
      </v-card-text>
    </v-card>



    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="3000">
      {{ snack.text }}
    </v-snackbar>

    <!-- API Documentation Dialog -->
    <v-dialog v-model="showApiDocs" max-width="900" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between pa-4 bg-primary text-white">
          <div class="text-h6"><v-icon class="mr-2">mdi-book-open-variant</v-icon>Tài liệu tích hợp API & Webhook</div>
          <v-btn icon="mdi-close" variant="text" @click="showApiDocs = false"></v-btn>
        </v-card-title>
        
        <v-tabs v-model="tab" bg-color="primary" align-tabs="center">
          <v-tab value="api">API Endpoints</v-tab>
          <v-tab value="webhook">Webhook Events</v-tab>
        </v-tabs>
        
        <v-card-text class="pa-0" style="max-height: 70vh;">
          <v-window v-model="tab">
            <!-- TAB 1: API Endpoints -->
            <v-window-item value="api" class="pa-6">
              <div class="mb-6">
                <h3 class="text-h6 mb-2 text-primary">1. Xác thực API (Authentication)</h3>
                <p class="text-body-2 mb-2">Để gọi các API bên dưới, bạn cần truyền API Key vào Header của HTTP Request:</p>
                <v-sheet class="pa-3 bg-grey-darken-4 rounded text-monospace text-body-2">
                  Header: <span class="text-green-lighten-2">X-API-Key: your-api-key</span>
                </v-sheet>
              </div>

              <div class="mb-2">
                <h3 class="text-h6 mb-3 text-primary">2. Danh sách API Endpoints</h3>
                <v-table density="comfortable" class="border rounded">
                  <thead>
                    <tr>
                      <th class="font-weight-bold" style="width: 100px;">Method</th>
                      <th class="font-weight-bold" style="width: 250px;">Endpoint</th>
                      <th class="font-weight-bold">Chức năng</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><v-chip color="success" size="small" label>GET</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/contacts</td>
                      <td class="text-body-2">Lấy danh sách khách hàng trong CRM.</td>
                    </tr>
                    <tr>
                      <td><v-chip color="success" size="small" label>GET</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/contacts/:id</td>
                      <td class="text-body-2">Lấy thông tin chi tiết của 1 khách hàng cụ thể.</td>
                    </tr>
                    <tr>
                      <td><v-chip color="warning" size="small" label>POST</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/contacts</td>
                      <td class="text-body-2">Tạo mới khách hàng (vd: đẩy dữ liệu từ form đăng ký trên website về CRM).</td>
                    </tr>
                    <tr>
                      <td><v-chip color="info" size="small" label>PUT</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/contacts/:id</td>
                      <td class="text-body-2">Cập nhật thông tin khách hàng hiện có.</td>
                    </tr>
                    <tr>
                      <td><v-chip color="success" size="small" label>GET</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/conversations</td>
                      <td class="text-body-2">Lấy danh sách các cuộc hội thoại Zalo.</td>
                    </tr>
                    <tr>
                      <td><v-chip color="success" size="small" label>GET</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/conversations/:id/messages</td>
                      <td class="text-body-2">Lấy lịch sử tin nhắn của 1 cuộc hội thoại Zalo cụ thể.</td>
                    </tr>
                    <tr>
                      <td><v-chip color="warning" size="small" label>POST</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/messages/send</td>
                      <td class="text-body-2">Gửi tin nhắn Zalo tự động tới khách hàng (cần body truyền zaloAccountId, threadId, content).</td>
                    </tr>
                    <tr>
                      <td><v-chip color="success" size="small" label>GET</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/appointments</td>
                      <td class="text-body-2">Lấy danh sách lịch hẹn sắp tới.</td>
                    </tr>
                    <tr>
                      <td><v-chip color="warning" size="small" label>POST</v-chip></td>
                      <td class="text-monospace text-caption">/api/public/appointments</td>
                      <td class="text-body-2">Tạo lịch hẹn mới tự động qua API.</td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
            </v-window-item>

            <!-- TAB 2: Webhook Events -->
            <v-window-item value="webhook" class="pa-6">
              <div>
                <h3 class="text-h6 mb-3 text-primary">Danh sách Webhook Events</h3>
                <p class="text-body-2 mb-3">ZaloCRM sẽ gửi một HTTP POST request (chứa JSON data) tới Webhook URL của bạn khi các sự kiện này xảy ra.</p>
                <v-table density="comfortable" class="border rounded">
                  <thead>
                    <tr>
                      <th class="font-weight-bold" style="width: 200px;">Tên sự kiện (Event)</th>
                      <th class="font-weight-bold">Giải thích ý nghĩa</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="text-monospace text-caption font-weight-bold">webhook.test</td>
                      <td class="text-body-2">Sự kiện gửi thử nghiệm khi bạn bấm nút "Test Webhook" trong cài đặt.</td>
                    </tr>
                    <tr>
                      <td class="text-monospace text-caption font-weight-bold">message.received</td>
                      <td class="text-body-2">Có tin nhắn mới từ khách hàng gửi tới Zalo của bạn. Thường dùng để lưu tin nhắn về hệ thống ERP nội bộ hoặc kích hoạt auto-reply trên máy chủ riêng.</td>
                    </tr>
                    <tr>
                      <td class="text-monospace text-caption font-weight-bold">message.sent</td>
                      <td class="text-body-2">Nhân viên (hoặc AI) vừa gửi một tin nhắn đi từ giao diện ZaloCRM.</td>
                    </tr>
                    <tr>
                      <td class="text-monospace text-caption font-weight-bold">contact.created</td>
                      <td class="text-body-2">Một hồ sơ khách hàng mới vừa được tạo mới (hoặc đồng bộ tự động từ Zalo sang CRM).</td>
                    </tr>
                    <tr>
                      <td class="text-monospace text-caption font-weight-bold">zalo.connected</td>
                      <td class="text-body-2">Một tài khoản Zalo vừa được quét mã QR và kết nối thành công vào hệ thống.</td>
                    </tr>
                    <tr>
                      <td class="text-monospace text-caption font-weight-bold">zalo.disconnected</td>
                      <td class="text-body-2">Tài khoản Zalo bị mất kết nối (có thể do nhân viên đổi mật khẩu hoặc Zalo thu hồi phiên đăng nhập). Dùng Webhook này để gửi cảnh báo tự động về nhóm Telegram của công ty.</td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
            </v-window-item>
          </v-window>
        </v-card-text>
        
        <v-divider></v-divider>
        <v-card-actions class="pa-4 bg-grey-lighten-4">
          <v-spacer></v-spacer>
          <v-btn color="primary" variant="elevated" @click="showApiDocs = false">Đã hiểu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api';

const apiKey = ref('');
const generatingKey = ref(false);
const webhookUrl = ref('');
const webhookSecret = ref('');
const saving = ref(false);
const testing = ref(false);
const showApiDocs = ref(false);
const tab = ref('api');
const snack = ref({ show: false, text: '', color: 'success' });

function showSnack(text: string, color = 'success') {
  snack.value = { show: true, text, color };
}

async function loadApiKey() {
  try {
    const res = await api.get('/settings/api-key');
    apiKey.value = res.data.key ?? '';
  } catch {
    apiKey.value = '';
  }
}

async function loadWebhook() {
  try {
    const res = await api.get('/settings/webhook');
    webhookUrl.value = res.data.webhookUrl ?? '';
    webhookSecret.value = res.data.webhookSecret ?? '';
  } catch {
    webhookUrl.value = '';
    webhookSecret.value = '';
  }
}

async function generateKey() {
  generatingKey.value = true;
  try {
    const res = await api.post('/settings/api-key/generate');
    apiKey.value = res.data.key ?? '';
    showSnack('API key mới đã được tạo');
  } catch {
    showSnack('Tạo key thất bại', 'error');
  } finally {
    generatingKey.value = false;
  }
}

async function copyKey() {
  if (!apiKey.value) return;
  await navigator.clipboard.writeText(apiKey.value);
  showSnack('Đã sao chép API key');
}

async function saveWebhook() {
  saving.value = true;
  try {
    await api.put('/settings/webhook', {
      webhookUrl: webhookUrl.value,
      webhookSecret: webhookSecret.value,
    });
    showSnack('Đã lưu cấu hình webhook');
  } catch {
    showSnack('Lưu thất bại', 'error');
  } finally {
    saving.value = false;
  }
}

async function testWebhook() {
  testing.value = true;
  try {
    await api.post('/settings/webhook/test');
    showSnack('Gửi test webhook thành công');
  } catch {
    showSnack('Test webhook thất bại', 'error');
  } finally {
    testing.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadApiKey(), loadWebhook()]);
});
</script>
