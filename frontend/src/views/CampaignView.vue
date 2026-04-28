<template>
  <div class="campaign-view">
    <!-- Page Header -->
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap gap-3">
      <div class="d-flex align-center gap-3">
        <div class="header-icon">
          <v-icon size="22" color="white">mdi-bullhorn-outline</v-icon>
        </div>
        <div>
          <h1 class="text-h5 font-weight-bold mb-0">Chiến dịch</h1>
          <p class="text-caption text-medium-emphasis mb-0">Quản lý nhóm khách hàng & chiến dịch gửi tin hàng loạt</p>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <v-tabs v-model="activeTab" color="primary" class="mb-0" density="comfortable">
      <v-tab value="groups">
        <v-icon start size="16">mdi-account-group-outline</v-icon>
        Nhóm khách hàng
        <v-chip size="x-small" class="ml-2" color="primary" variant="tonal">{{ groups.length }}</v-chip>
      </v-tab>
      <v-tab value="campaigns">
        <v-icon start size="16">mdi-bullhorn-outline</v-icon>
        Chiến dịch
        <v-chip size="x-small" class="ml-2" color="secondary" variant="tonal">{{ campaigns.length }}</v-chip>
      </v-tab>
    </v-tabs>
    <v-divider />

    <v-window v-model="activeTab">

      <!-- ───────────── TAB 1: NHÓM KH ───────────── -->
      <v-window-item value="groups">
        <!-- Actions bar -->
        <div class="d-flex align-center justify-space-between py-3 px-1">
          <span class="text-caption text-medium-emphasis">{{ groups.length }} nhóm</span>
          <v-btn color="primary" size="small" prepend-icon="mdi-plus" @click="openGroupDialog()">Tạo nhóm mới</v-btn>
        </div>

        <!-- Table -->
        <v-card elevation="0" border rounded="xl" class="overflow-hidden">
          <v-table density="comfortable" class="campaign-table">
            <thead>
              <tr>
                <th>Tên nhóm</th>
                <th class="text-center" style="width:110px;">Chế độ</th>
                <th class="text-center" style="width:110px;">Khách hàng</th>
                <th class="text-center" style="width:110px;">Chiến dịch</th>
                <th class="text-center" style="width:120px;">Ngày tạo</th>
                <th class="text-center" style="width:120px;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!groups.length">
                <td colspan="6" class="text-center pa-8 text-medium-emphasis">
                  <v-icon size="40" class="mb-2 d-block">mdi-account-group-outline</v-icon>
                  Chưa có nhóm nào — <span class="text-primary cursor-pointer" @click="openGroupDialog()">tạo ngay</span>
                </td>
              </tr>
              <tr v-for="g in groups" :key="g.id" class="table-row">
                <td>
                  <div class="d-flex align-center gap-3 py-1">
                    <div class="group-icon" :class="`bg-${modeColor(g.mode)}-lighten`">
                      <v-icon size="16" :color="modeColor(g.mode)">{{ modeIcon(g.mode) }}</v-icon>
                    </div>
                    <div>
                      <div class="text-body-2 font-weight-semibold">{{ g.name }}</div>
                      <div v-if="g.description" class="text-caption text-medium-emphasis text-truncate" style="max-width:260px;">{{ g.description }}</div>
                    </div>
                  </div>
                </td>
                <td class="text-center">
                  <v-chip size="x-small" :color="modeColor(g.mode)" variant="tonal">{{ modeLabel(g.mode) }}</v-chip>
                </td>
                <td class="text-center">
                  <span v-if="groupContactCounts[g.id] !== undefined" class="text-body-2 font-weight-medium">{{ groupContactCounts[g.id] }}</span>
                  <v-progress-circular v-else indeterminate size="16" width="2" color="primary" />
                </td>
                <td class="text-center">
                  <span class="text-body-2">{{ g._count?.campaigns || 0 }}</span>
                </td>
                <td class="text-center text-caption text-medium-emphasis">
                  {{ formatDate(g.createdAt) }}
                </td>
                <td class="text-center">
                  <div class="d-flex align-center justify-center gap-1">
                    <v-btn icon size="x-small" variant="text" color="info" @click="viewGroupContacts(g)">
                      <v-icon size="15">mdi-eye</v-icon>
                      <v-tooltip activator="parent" location="top">Xem KH</v-tooltip>
                    </v-btn>
                    <v-btn icon size="x-small" variant="text" @click="openGroupDialog(g)">
                      <v-icon size="15">mdi-pencil</v-icon>
                      <v-tooltip activator="parent" location="top">Sửa</v-tooltip>
                    </v-btn>
                    <v-btn icon size="x-small" variant="text" color="error" @click="deleteGroup(g.id)">
                      <v-icon size="15">mdi-delete</v-icon>
                      <v-tooltip activator="parent" location="top">Xóa</v-tooltip>
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- ───────────── TAB 2: CHIẾN DỊCH ───────────── -->
      <v-window-item value="campaigns">
        <!-- Actions bar -->
        <div class="d-flex align-center justify-space-between py-3 px-1 flex-wrap gap-2">
          <div class="d-flex align-center gap-2 flex-wrap">
            <v-chip
              v-for="s in statusFilters" :key="s.value"
              :color="filters.status === s.value ? 'primary' : undefined"
              :variant="filters.status === s.value ? 'flat' : 'outlined'"
              size="small"
              class="cursor-pointer"
              @click="filters.status = filters.status === s.value ? '' : s.value"
            >
              <v-icon start size="12">{{ statusIcon(s.value) }}</v-icon>
              {{ s.label }}
              <span class="ml-1 opacity-70">({{ statusCount(s.value) }})</span>
            </v-chip>
          </div>
          <v-alert v-if="!groups.length" type="info" variant="tonal" density="compact" class="text-caption pa-2" rounded="lg" style="max-width:320px;">
            Cần tạo <strong>Nhóm khách hàng</strong> trước
          </v-alert>
          <div v-else class="d-flex align-center gap-2">
            <v-btn icon size="small" variant="tonal" color="primary" @click="fetchCampaigns()">
              <v-icon>mdi-refresh</v-icon>
            </v-btn>
            <v-btn color="primary" size="small" prepend-icon="mdi-plus" @click="openCampaignDialog()">Tạo chiến dịch</v-btn>
          </div>
        </div>

        <!-- Table -->
        <v-card elevation="0" border rounded="xl" class="overflow-hidden">
          <v-table density="comfortable" class="campaign-table">
            <thead>
              <tr>
                <th>Chiến dịch</th>
                <th class="text-center" style="width:100px;">Trạng thái</th>
                <th class="text-center" style="width:100px;">Lịch</th>
                <th class="text-center" style="width:80px;">Đã gửi</th>
                <th class="text-center" style="width:80px;">Chờ gửi</th>
                <th class="text-center" style="width:70px;">Lỗi</th>
                <th class="text-center" style="width:150px;">Lần gửi tiếp</th>
                <th class="text-center" style="width:160px;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!filteredCampaigns.length">
                <td colspan="8" class="text-center pa-8 text-medium-emphasis">
                  <v-icon size="40" class="mb-2 d-block">mdi-bullhorn-outline</v-icon>
                  <span v-if="!filters.status">Chưa có chiến dịch — <span class="text-primary cursor-pointer" @click="openCampaignDialog()">tạo ngay</span></span>
                  <span v-else>Không có chiến dịch nào với trạng thái này</span>
                </td>
              </tr>
              <tr v-for="c in filteredCampaigns" :key="c.id" class="table-row">
                <td style="min-width:220px;">
                  <div class="py-1">
                    <div class="text-body-2 font-weight-semibold mb-0.5">{{ c.title }}</div>
                    <div class="d-flex align-center gap-1 text-caption text-medium-emphasis">
                      <v-icon size="12">mdi-account-group-outline</v-icon>
                      {{ c.group?.name || '—' }}
                    </div>
                  </div>
                </td>
                <td class="text-center">
                  <v-chip size="x-small" :color="statusColor(c.status)" variant="flat">
                    <v-icon start size="10">{{ statusIcon(c.status) }}</v-icon>
                    {{ statusLabel(c.status) }}
                  </v-chip>
                </td>
                <td class="text-center">
                  <v-chip size="x-small" color="grey" variant="tonal">{{ scheduleLabel(c.scheduleType) }}</v-chip>
                </td>
                <td class="text-center">
                  <span class="text-body-2 font-weight-bold text-success">{{ getQueueStat(c, 'sent') }}</span>
                </td>
                <td class="text-center">
                  <span class="text-body-2 font-weight-bold" :class="(getQueueStat(c,'pending') + getQueueStat(c,'sending')) > 0 ? 'text-warning' : 'text-medium-emphasis'">
                    {{ getQueueStat(c, 'pending') + getQueueStat(c, 'sending') }}
                  </span>
                </td>
                <td class="text-center">
                  <span class="text-body-2 font-weight-bold" :class="getQueueStat(c,'failed') > 0 ? 'text-error' : 'text-medium-emphasis'">
                    {{ getQueueStat(c, 'failed') }}
                  </span>
                </td>
                <td class="text-center text-caption text-medium-emphasis">
                  {{ c.nextRunAt ? formatDatetime(c.nextRunAt) : '—' }}
                </td>
                <td class="text-center">
                  <div class="d-flex align-center justify-center gap-1">
                    <!-- Activate / Pause -->
                    <v-btn v-if="c.status !== 'active'" icon size="x-small" variant="tonal" color="success" @click="activateCampaign(c)">
                      <v-icon size="14">mdi-play</v-icon>
                      <v-tooltip activator="parent" location="top">Kích hoạt</v-tooltip>
                    </v-btn>
                    <v-btn v-else icon size="x-small" variant="tonal" color="warning" @click="pauseCampaign(c)">
                      <v-icon size="14">mdi-pause</v-icon>
                      <v-tooltip activator="parent" location="top">Tạm dừng</v-tooltip>
                    </v-btn>
                    <!-- Run now -->
                    <v-btn icon size="x-small" variant="tonal" color="info" @click="runNow(c)" :loading="runningId === c.id">
                      <v-icon size="14">mdi-send</v-icon>
                      <v-tooltip activator="parent" location="top">Gửi ngay</v-tooltip>
                    </v-btn>
                    <!-- Queue -->
                    <v-btn icon size="x-small" variant="text" @click="openQueuePreview(c)">
                      <v-icon size="14">mdi-format-list-bulleted</v-icon>
                      <v-tooltip activator="parent" location="top">Hàng đợi</v-tooltip>
                    </v-btn>
                    <!-- Edit -->
                    <v-btn icon size="x-small" variant="text" @click="openCampaignDialog(c)">
                      <v-icon size="14">mdi-pencil</v-icon>
                      <v-tooltip activator="parent" location="top">Sửa</v-tooltip>
                    </v-btn>
                    <!-- Delete -->
                    <v-btn icon size="x-small" variant="text" color="error" @click="deleteCampaign(c.id)">
                      <v-icon size="14">mdi-delete</v-icon>
                      <v-tooltip activator="parent" location="top">Xóa</v-tooltip>
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- ── DIALOGS ──────────────────────────────────────────────────────── -->
    <CampaignGroupDialog
      v-model="groupDialog.open"
      :group="groupDialog.data"
      :org-contacts="allContacts"
      :loading-contacts="loadingContacts"
      @saved="onGroupSaved"
    />
    <CampaignDialog
      v-model="campaignDialog.open"
      :campaign="campaignDialog.data"
      :groups="groups"
      @saved="onCampaignSaved"
    />
    <CampaignQueuePreview
      v-model="queuePreview.open"
      :campaign="queuePreview.campaign"
    />

    <!-- Group contacts viewer -->
    <v-dialog v-model="contactsViewer.open" max-width="560" scrollable>
      <v-card rounded="xl">
        <v-card-title class="pa-5 pb-3 d-flex align-center gap-2">
          <v-icon color="primary">mdi-account-group-outline</v-icon>
          {{ contactsViewer.group?.name }}
          <v-chip size="small" color="primary" variant="tonal" class="ml-2">{{ contactsViewer.contacts.length }} KH</v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-0" style="max-height: 55vh;">
          <v-list density="compact">
            <v-list-item v-for="c in contactsViewer.contacts" :key="c.id" class="px-5">
              <template #prepend>
                <v-avatar size="30" color="primary" variant="tonal">
                  <v-img v-if="c.avatarUrl" :src="c.avatarUrl" />
                  <v-icon v-else size="16">mdi-account</v-icon>
                </v-avatar>
              </template>
              <v-list-item-title class="text-body-2">{{ c.fullName || c.phone }}</v-list-item-title>
              <v-list-item-subtitle>{{ c.phone }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer /><v-btn variant="tonal" @click="contactsViewer.open = false">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snack.show" :color="snack.color" location="bottom right" rounded="xl" :timeout="3000">
      {{ snack.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { api } from '@/api/index';
import CampaignGroupDialog from '@/components/campaign/CampaignGroupDialog.vue';
import CampaignDialog from '@/components/campaign/CampaignDialog.vue';
import CampaignQueuePreview from '@/components/campaign/CampaignQueuePreview.vue';

// ── State ─────────────────────────────────────────────────────────────────
const activeTab = ref('groups');
const groups = ref<any[]>([]);
const campaigns = ref<any[]>([]);
const allContacts = ref<any[]>([]);
const loadingContacts = ref(false);
const groupContactCounts = ref<Record<string, number>>({});
const runningId = ref<string | null>(null);

const filters = reactive({ status: '' });
const statusFilters = [
  { value: 'draft', label: 'Nháp' },
  { value: 'active', label: 'Đang chạy' },
  { value: 'paused', label: 'Tạm dừng' },
  { value: 'completed', label: 'Hoàn thành' },
];

const snack = reactive({ show: false, text: '', color: 'success' });
const groupDialog = reactive<{ open: boolean; data: any }>({ open: false, data: null });
const campaignDialog = reactive<{ open: boolean; data: any }>({ open: false, data: null });
const queuePreview = reactive<{ open: boolean; campaign: any }>({ open: false, campaign: null });
const contactsViewer = reactive<{ open: boolean; group: any; contacts: any[] }>({ open: false, group: null, contacts: [] });

// ── Computed ──────────────────────────────────────────────────────────────
const filteredCampaigns = computed(() => {
  if (!filters.status) return campaigns.value;
  return campaigns.value.filter(c => c.status === filters.status);
});

const statusCount = (status: string) => campaigns.value.filter(c => c.status === status).length;

// ── Data fetching ─────────────────────────────────────────────────────────
async function fetchGroups() {
  try {
    const res = await api.get('/campaign-groups');
    groups.value = res.data;
    for (const g of groups.value) {
      api.get(`/campaign-groups/${g.id}/contacts`).then(r => {
        groupContactCounts.value[g.id] = r.data.total;
      }).catch(() => { groupContactCounts.value[g.id] = 0; });
    }
  } catch { /* silently */ }
}

async function fetchCampaigns() {
  try {
    const res = await api.get('/campaigns');
    campaigns.value = res.data;
  } catch { /* silently */ }
}

async function fetchAllContacts() {
  loadingContacts.value = true;
  try {
    const res = await api.get('/contacts', { params: { limit: 1000 } });
    allContacts.value = res.data.contacts || res.data.items || res.data;
  } catch { /* silently */ } finally { loadingContacts.value = false; }
}

onMounted(() => {
  fetchGroups();
  fetchCampaigns();
  fetchAllContacts();
});

// ── Group actions ─────────────────────────────────────────────────────────
function openGroupDialog(g?: any) { groupDialog.data = g || null; groupDialog.open = true; }

async function onGroupSaved() { await fetchGroups(); showSnack('Nhóm đã được lưu!', 'success'); }

async function deleteGroup(id: string) {
  if (!confirm('Xóa nhóm này? Tất cả chiến dịch liên quan cũng bị xóa.')) return;
  try { await api.delete(`/campaign-groups/${id}`); await fetchGroups(); showSnack('Đã xóa nhóm', 'info'); }
  catch { showSnack('Lỗi khi xóa', 'error'); }
}

async function viewGroupContacts(g: any) {
  contactsViewer.group = g;
  contactsViewer.contacts = [];
  contactsViewer.open = true;
  try {
    const res = await api.get(`/campaign-groups/${g.id}/contacts`);
    contactsViewer.contacts = res.data.contacts || [];
  } catch { /* ignore */ }
}

// ── Campaign actions ──────────────────────────────────────────────────────
function openCampaignDialog(c?: any) { campaignDialog.data = c || null; campaignDialog.open = true; }

async function onCampaignSaved() { await fetchCampaigns(); showSnack('Chiến dịch đã được lưu!', 'success'); }

async function deleteCampaign(id: string) {
  if (!confirm('Xóa chiến dịch này?')) return;
  try { await api.delete(`/campaigns/${id}`); await fetchCampaigns(); showSnack('Đã xóa chiến dịch', 'info'); }
  catch { showSnack('Lỗi khi xóa', 'error'); }
}

async function activateCampaign(c: any) {
  try { await api.post(`/campaigns/${c.id}/activate`); await fetchCampaigns(); showSnack('Đã kích hoạt!', 'success'); }
  catch { showSnack('Lỗi', 'error'); }
}

async function pauseCampaign(c: any) {
  try { await api.post(`/campaigns/${c.id}/pause`); await fetchCampaigns(); showSnack('Đã tạm dừng', 'warning'); }
  catch { showSnack('Lỗi', 'error'); }
}

async function runNow(c: any) {
  runningId.value = c.id;
  try {
    // Auto-activate + run
    if (c.status === 'draft') {
      await api.post(`/campaigns/${c.id}/activate`);
    }
    await api.post(`/campaigns/${c.id}/run`);
    showSnack('Đang gửi... hàng đợi đã được tạo!', 'success');
    // Refresh several times to catch the live update
    await fetchCampaigns();
    setTimeout(fetchCampaigns, 3000);
    setTimeout(fetchCampaigns, 8000);
    setTimeout(fetchCampaigns, 15000);
  } catch { showSnack('Lỗi khi gửi', 'error'); } finally { runningId.value = null; }
}

function openQueuePreview(c: any) { queuePreview.campaign = c; queuePreview.open = true; }

// ── Helpers ───────────────────────────────────────────────────────────────
function modeIcon(mode: string) { return { all: 'mdi-earth', exclude: 'mdi-account-minus', manual: 'mdi-account-check' }[mode] || 'mdi-account-check'; }
function modeColor(mode: string) { return { all: 'success', exclude: 'warning', manual: 'primary' }[mode] || 'primary'; }
function modeLabel(mode: string) { return { all: 'Tất cả', exclude: 'Loại trừ', manual: 'Chọn tay' }[mode] || mode; }

function statusColor(status: string) { return { draft:'grey', active:'success', paused:'warning', completed:'info' }[status] || 'grey'; }
function statusIcon(status: string) { return { draft:'mdi-pencil', active:'mdi-play-circle', paused:'mdi-pause-circle', completed:'mdi-check-circle' }[status] || 'mdi-circle'; }
function statusLabel(status: string) { return { draft:'Nháp', active:'Đang chạy', paused:'Tạm dừng', completed:'Hoàn thành' }[status] || status; }
function scheduleLabel(type: string) { return { once:'Một lần', daily:'Hằng ngày', weekly:'Hằng tuần', monthly:'Hằng tháng' }[type] || type; }

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}
function formatDatetime(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function getQueueStat(campaign: any, status: string) {
  const stats = campaign.queueStats || [];
  const found = stats.find((s: any) => s.status === status);
  return found?._count?.status || 0;
}
function showSnack(text: string, color: string) { snack.text = text; snack.color = color; snack.show = true; }
</script>

<style scoped>
.campaign-view { max-width: 1400px; margin: 0 auto; }

.header-icon {
  width: 40px; height: 40px; border-radius: 12px;
  background: linear-gradient(135deg, #3B82F6, #8B5CF6);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

/* ── Table ── */
.campaign-table :deep(table) {
  background: transparent !important;
}
.campaign-table :deep(th) {
  font-size: 11px !important;
  font-weight: 700 !important;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.5) !important;
  background: rgba(var(--v-theme-on-surface), 0.03) !important;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
  white-space: nowrap;
  padding: 10px 14px !important;
}
.campaign-table :deep(td) {
  padding: 10px 14px !important;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
  vertical-align: middle;
  color: rgb(var(--v-theme-on-surface)) !important;
  background: transparent !important;
}
.table-row {
  transition: background 0.12s;
}
.table-row:hover :deep(td) {
  background: rgba(var(--v-theme-primary), 0.04) !important;
}
.table-row:last-child :deep(td) { border-bottom: none !important; }

.group-icon {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.bg-success-lighten { background: rgba(var(--v-theme-success), 0.12) !important; }
.bg-warning-lighten { background: rgba(var(--v-theme-warning), 0.12) !important; }
.bg-primary-lighten { background: rgba(var(--v-theme-primary), 0.12) !important; }

.cursor-pointer { cursor: pointer; }
</style>
