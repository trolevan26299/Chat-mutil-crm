<template>
  <div class="zalo-accounts-page d-flex flex-column">
    <div class="d-flex align-center mb-4 flex-shrink-0">
      <h1 class="text-h4">Tài khoản Zalo</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="showAddDialog = true">Thêm Zalo</v-btn>
    </div>

    <div v-if="isMobile" class="d-flex flex-column gap-3 mb-4 flex-grow-1 overflow-y-auto pr-2">
      <v-card v-for="item in accounts" :key="item.id" class="pa-4" elevation="0" border>
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="font-weight-bold text-body-1 text-truncate" style="max-width: 60%">{{ item.displayName || item.id }}</div>
          <v-chip :color="statusColor(item.liveStatus || item.status)" size="small" variant="flat" class="flex-shrink-0">
            {{ statusText(item.liveStatus || item.status) }}
          </v-chip>
        </div>
        <div class="d-flex align-center justify-space-between mt-3">
          <span class="text-caption text-grey text-truncate d-inline-block mr-2" style="max-width: 100px;">UID: {{ item.zaloUid || '-' }}</span>
          <div class="d-flex gap-1" style="flex-wrap: wrap; justify-content: flex-end;">
            <v-btn v-if="authStore.isAdmin" icon size="small" color="primary" variant="tonal" @click="openAccess(item)"><v-icon>mdi-shield-account</v-icon></v-btn>
            <v-btn icon size="small" color="success" variant="tonal" @click="syncContacts(item.id)" :loading="syncing === item.id"><v-icon>mdi-account-sync</v-icon></v-btn>
            <v-btn v-if="item.liveStatus !== 'connected'" icon size="small" color="primary" variant="tonal" @click="loginAccount(item.id)"><v-icon>mdi-qrcode</v-icon></v-btn>
            <v-btn v-if="item.liveStatus === 'disconnected' && item.sessionData" icon size="small" color="info" variant="tonal" @click="reconnectAccount(item.id)"><v-icon>mdi-refresh</v-icon></v-btn>
            <v-btn icon size="small" color="error" variant="tonal" @click="confirmDelete(item)"><v-icon>mdi-delete</v-icon></v-btn>
          </div>
        </div>
      </v-card>
      <div v-if="!accounts.length" class="text-center pa-6 text-grey">Chưa có tài khoản Zalo nào</div>
    </div>

    <v-card v-else class="flex-grow-1 d-flex flex-column overflow-hidden">
      <v-data-table class="accounts-table flex-grow-1" :headers="headers" :items="accounts" :loading="loading" no-data-text="Chưa có tài khoản Zalo nào" fixed-header>
        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.liveStatus || item.status)" size="small" variant="flat">
            {{ statusText(item.liveStatus || item.status) }}
          </v-chip>
        </template>
        <template #item.proxy="{ item }">
          <v-chip v-if="item.proxyUrl" color="teal" size="small" variant="tonal" prepend-icon="mdi-shield-lock">
            {{ item.proxyUrl }}
          </v-chip>
          <span v-else class="text-grey text-caption">—</span>
        </template>
        <template #item.actions="{ item }">
          <v-btn v-if="authStore.isAdmin" icon size="small" color="primary" title="Phân quyền truy cập" @click="openAccess(item)">
            <v-icon>mdi-shield-account</v-icon>
          </v-btn>
          <v-btn icon size="small" color="teal" title="Cấu hình Proxy" @click="openProxy(item)">
            <v-icon>mdi-shield-lock</v-icon>
          </v-btn>
          <v-btn icon size="small" color="success" @click="syncContacts(item.id)" title="Đồng bộ danh bạ Zalo" :loading="syncing === item.id">
            <v-icon>mdi-account-sync</v-icon>
          </v-btn>
          <!-- QR login: only when no session at all -->
          <v-btn v-if="item.liveStatus === 'qr_pending' || (!item.sessionData && item.liveStatus !== 'connected')" icon size="small" color="primary" @click="loginAccount(item.id)" title="Đăng nhập QR">
            <v-icon>mdi-qrcode</v-icon>
          </v-btn>
          <!-- Reconnect: when disconnected or has session -->
          <v-btn v-if="(item.liveStatus === 'disconnected' || item.liveStatus === 'connecting') && item.sessionData" icon size="small" color="info" @click="reconnectAccount(item.id)" title="Kết nối lại">
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
          <v-btn icon size="small" color="error" @click="confirmDelete(item)" title="Xóa">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Add account dialog -->
    <v-dialog v-model="showAddDialog" max-width="400" :fullscreen="isMobile">
      <v-card>
        <v-card-title>Thêm tài khoản Zalo</v-card-title>
        <v-card-text>
          <v-text-field v-model="newAccountName" label="Tên hiển thị (VD: Zalo Sale Hương)" />
          <v-text-field
            v-model="newAccountProxy"
            label="Proxy URL (tùy chọn)"
            placeholder="http://user:pass@1.2.3.4:8080 hoặc socks5://..."
            hint="Hỗ trợ HTTP, HTTPS, SOCKS5. Để trống nếu không cần proxy."
            persistent-hint
            clearable
            prepend-inner-icon="mdi-shield-lock"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showAddDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="adding" @click="handleAddAccount">Thêm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- QR Code dialog -->
    <v-dialog v-model="showQRDialog" max-width="400" persistent>
      <v-card class="text-center pa-4">
        <v-card-title>Quét QR để đăng nhập Zalo</v-card-title>
        <v-card-text>
          <div v-if="qrImage" class="mb-4">
            <img :src="'data:image/png;base64,' + qrImage" alt="QR Code" style="max-width: 280px;" />
          </div>
          <div v-else-if="qrScanned" class="mb-4">
            <v-icon icon="mdi-check-circle" size="64" color="success" />
            <p class="text-h6 mt-2">Đã quét! Xác nhận trên điện thoại...</p>
            <p v-if="scannedName" class="text-body-2">{{ scannedName }}</p>
          </div>
          <div v-else class="mb-4">
            <v-progress-circular indeterminate color="primary" size="64" />
            <p class="mt-2">Đang tạo QR code...</p>
          </div>
          <v-alert v-if="qrError" type="error" density="compact" class="mt-2">{{ qrError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="cancelQR">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete confirm dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title>Xác nhận xóa</v-card-title>
        <v-card-text>Bạn có chắc muốn xóa tài khoản "{{ deleteTarget?.displayName || deleteTarget?.id }}"?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDeleteDialog = false">Hủy</v-btn>
          <v-btn color="error" :loading="deleting" @click="handleDeleteAccount">Xóa</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Access control dialog -->
    <ZaloAccessDialog
      v-model="showAccessDialog"
      :account-id="accessTarget?.id ?? ''"
      :account-name="accessTarget?.displayName ?? accessTarget?.id ?? ''"
      :fullscreen="isMobile"
    />

    <!-- Proxy configuration dialog -->
    <v-dialog v-model="showProxyDialog" max-width="480">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="teal" class="mr-2">mdi-shield-lock</v-icon>
          Cấu hình Proxy — {{ proxyTarget?.displayName || proxyTarget?.id }}
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="proxyUrl"
            label="Proxy URL"
            placeholder="http://user:pass@1.2.3.4:8080 hoặc socks5://..."
            hint="Hỗ trợ HTTP, HTTPS, SOCKS5. Xóa trống để tắt proxy."
            persistent-hint
            clearable
            prepend-inner-icon="mdi-earth"
          />
          <v-alert type="success" density="compact" class="mt-3" variant="tonal">
            Bấm <strong>Lưu &amp; Reconnect</strong> — hệ thống sẽ tự động lưu proxy và kết nối lại ngay.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showProxyDialog = false">Hủy</v-btn>
          <v-btn color="error" variant="text" :loading="savingProxy" @click="handleClearProxy">Xóa Proxy</v-btn>
          <v-btn color="teal" variant="flat" :loading="savingProxy" @click="handleSaveProxy">Lưu &amp; Reconnect</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useZaloAccounts, type ZaloAccount } from '@/composables/use-zalo-accounts';
import { useAuthStore } from '@/stores/auth';
import { useMobile } from '@/composables/use-mobile';
import ZaloAccessDialog from '@/components/settings/ZaloAccessDialog.vue';
import { api } from '@/api/index';

const {
  accounts, loading, adding, deleting,
  showQRDialog, qrImage, qrScanned, scannedName, qrError,
  statusColor, statusText,
  fetchAccounts, addAccount, loginAccount, reconnectAccount, deleteAccount,
  cancelQR, setupSocket,
} = useZaloAccounts();

const authStore = useAuthStore();
const { isMobile } = useMobile();

const showAddDialog = ref(false);
const syncing = ref<string | null>(null);
const showDeleteDialog = ref(false);
const showAccessDialog = ref(false);
const showProxyDialog = ref(false);
const newAccountName = ref('');
const newAccountProxy = ref('');
const deleteTarget = ref<ZaloAccount | null>(null);
const accessTarget = ref<ZaloAccount | null>(null);
const proxyTarget = ref<ZaloAccount | null>(null);
const proxyUrl = ref('');
const savingProxy = ref(false);

const headers = [
  { title: 'Tên', key: 'displayName', sortable: true },
  { title: 'Zalo UID', key: 'zaloUid' },
  { title: 'SĐT', key: 'phone' },
  { title: 'Proxy', key: 'proxy' },
  { title: 'Trạng thái', key: 'status', sortable: true },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

async function syncContacts(accountId: string) {
  syncing.value = accountId;
  try {
    const res = await api.post(`/zalo-accounts/${accountId}/sync-contacts`);
    alert(`Đồng bộ thành công: ${res.data.created} mới, ${res.data.updated} cập nhật`);
  } catch (err: any) {
    alert('Đồng bộ thất bại: ' + (err.response?.data?.error || err.message));
  } finally {
    syncing.value = null;
  }
}

async function handleAddAccount() {
  const ok = await addAccount(newAccountName.value, newAccountProxy.value || undefined);
  if (ok) {
    showAddDialog.value = false;
    newAccountName.value = '';
    newAccountProxy.value = '';
  }
}

function confirmDelete(account: ZaloAccount) {
  deleteTarget.value = account;
  showDeleteDialog.value = true;
}

function openAccess(account: ZaloAccount) {
  accessTarget.value = account;
  showAccessDialog.value = true;
}

function openProxy(account: ZaloAccount) {
  proxyTarget.value = account;
  proxyUrl.value = (account as any).proxyUrlRaw || '';
  showProxyDialog.value = true;
}

async function handleSaveProxy() {
  if (!proxyTarget.value) return;
  savingProxy.value = true;
  const accountId = proxyTarget.value.id;
  const liveStatus = proxyTarget.value.liveStatus || proxyTarget.value.status;
  try {
    // 1. Save proxy
    await api.patch(`/zalo-accounts/${accountId}/proxy`, { proxyUrl: proxyUrl.value || null });
    showProxyDialog.value = false;

    // 2. If account has a session (disconnected or connected), auto-reconnect with new proxy
    const account = accounts.value.find(a => a.id === accountId);
    if (account?.sessionData || liveStatus === 'connected' || liveStatus === 'disconnected') {
      await api.post(`/zalo-accounts/${accountId}/reconnect`);
    }

    await fetchAccounts();
  } catch (err: any) {
    alert('Lỗi: ' + (err.response?.data?.error || err.message));
  } finally {
    savingProxy.value = false;
  }
}

async function handleClearProxy() {
  if (!proxyTarget.value) return;
  savingProxy.value = true;
  try {
    await api.patch(`/zalo-accounts/${proxyTarget.value.id}/proxy`, { proxyUrl: null });
    showProxyDialog.value = false;
    await fetchAccounts();
  } catch (err: any) {
    alert('Lỗi: ' + (err.response?.data?.error || err.message));
  } finally {
    savingProxy.value = false;
  }
}

async function handleDeleteAccount() {
  if (!deleteTarget.value) return;
  const ok = await deleteAccount(deleteTarget.value);
  if (ok) {
    showDeleteDialog.value = false;
    deleteTarget.value = null;
  }
}

onMounted(() => {
  fetchAccounts();
  setupSocket();
});
</script>

<style scoped>
.zalo-accounts-page {
  height: calc(100vh - 64px - 32px); /* 64px appbar + 32px container padding */
  overflow: hidden;
}

.zalo-accounts-page > .v-card {
  overflow: hidden;
}

:deep(.accounts-table .v-table__wrapper) {
  flex: 1 1 auto;
  overflow-y: auto;
}

:deep(.accounts-table) {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
