<template>
  <v-dialog v-model="model" max-width="680" :fullscreen="isMobile" scrollable>
    <v-card rounded="xl">
      <v-card-title class="pa-5 pb-4 d-flex align-center gap-2">
        <v-icon color="primary" size="20">mdi-format-list-bulleted</v-icon>
        Hàng đợi gửi tin — {{ props.campaign?.title }}
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="model = false"><v-icon>mdi-close</v-icon></v-btn>
      </v-card-title>
      <v-divider />

      <!-- Stats bar -->
      <div class="stats-bar d-flex gap-0 px-5 py-3">
        <div v-for="s in statList" :key="s.status" class="stat-item flex-grow-1 text-center">
          <div class="text-h6 font-weight-bold" :class="`text-${s.color}`">{{ s.count }}</div>
          <div class="text-caption text-medium-emphasis">{{ s.label }}</div>
        </div>
      </div>
      <v-divider />

      <v-card-text class="pa-0" style="max-height: 70vh; overflow-y: auto;">
        <div v-if="loading" class="d-flex justify-center align-center pa-8">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <div v-else-if="!queueByChunk.length" class="d-flex flex-column align-center justify-center pa-8 text-medium-emphasis">
          <v-icon size="48" class="mb-3">mdi-tray-remove</v-icon>
          <div>Chưa có hàng đợi nào</div>
        </div>

        <div v-else class="pa-4">
          <!-- Chunk timeline -->
          <div v-for="(chunk, ci) in queueByChunk" :key="ci" class="chunk-block mb-4">
            <!-- Chunk header -->
            <div class="d-flex align-center gap-2 mb-2">
              <div class="chunk-badge">Chunk {{ ci + 1 }}</div>
              <v-chip size="x-small" :color="chunkStatusColor(chunk)" variant="flat">
                {{ chunkStatusLabel(chunk) }}
              </v-chip>
              <div class="flex-grow-1 chunk-line" />
              <div class="text-caption text-medium-emphasis">{{ chunk.length }} liên hệ</div>
            </div>

            <!-- Items in chunk -->
            <div class="chunk-items pl-4" style="border-left: 2px solid rgba(var(--v-border-color), 0.3);">
              <div v-for="(item, ii) in chunk" :key="item.id" class="queue-item d-flex align-center gap-3 py-2"
                :class="{ 'item-separator': ii < chunk.length - 1 }">
                <!-- Status icon -->
                <div class="status-indicator" :class="`bg-${statusColor(item.status)}`">
                  <v-icon size="12" color="white">{{ statusIcon(item.status) }}</v-icon>
                </div>

                <!-- Avatar -->
                <v-avatar size="28" color="primary" variant="tonal">
                  <v-img v-if="item.contact?.avatarUrl" :src="item.contact.avatarUrl" />
                  <v-icon v-else size="16">mdi-account</v-icon>
                </v-avatar>

                <!-- Info -->
                <div class="flex-grow-1 min-width-0">
                  <div class="text-body-2 font-weight-medium text-truncate">
                    {{ item.contact?.fullName || item.contact?.phone || 'Khách hàng' }}
                  </div>
                  <div class="text-caption text-medium-emphasis d-flex align-center gap-1">
                    <v-icon size="11">mdi-cellphone-link</v-icon>
                    {{ item.zaloAccount?.displayName || item.zaloAccountId }}
                  </div>
                </div>

                <!-- Send time / error -->
                <div class="text-right">
                  <v-chip size="x-small" :color="statusColor(item.status)" variant="flat">
                    {{ statusLabel(item.status) }}
                  </v-chip>
                  <div v-if="item.sentAt" class="text-caption text-medium-emphasis mt-1">
                    {{ formatTime(item.sentAt) }}
                  </div>
                  <div v-if="item.error" class="text-caption text-error mt-1" style="max-width:140px;" :title="item.error">
                    {{ truncate(item.error, 30) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Inter-chunk delay indicator (not last) -->
            <div v-if="ci < queueByChunk.length - 1" class="delay-indicator d-flex align-center gap-2 mt-2 pl-4">
              <v-icon size="14" color="warning">mdi-timer-sand</v-icon>
              <span class="text-caption text-warning">Delay 5–10s ngẫu nhiên</span>
            </div>
          </div>

          <!-- Load more -->
          <div v-if="hasMore" class="d-flex justify-center mt-2">
            <v-btn variant="tonal" size="small" :loading="loadingMore" @click="loadMore">Tải thêm</v-btn>
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-btn variant="text" prepend-icon="mdi-refresh" @click="fetchQueue" :loading="loading">Làm mới</v-btn>
        <v-spacer />
        <v-btn variant="tonal" @click="model = false">Đóng</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { api } from '@/api/index';

const props = defineProps<{
  modelValue: boolean;
  campaign?: any;
}>();
const emit = defineEmits(['update:modelValue']);

const { mobile } = useDisplay();
const isMobile = computed(() => mobile.value);
const model = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) });

const loading = ref(false);
const loadingMore = ref(false);
const items = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const LIMIT = 60;

const hasMore = computed(() => items.value.length < total.value);

const queueByChunk = computed(() => {
  const byChunk: Record<number, any[]> = {};
  for (const item of items.value) {
    const ci = item.chunkIndex ?? 0;
    if (!byChunk[ci]) byChunk[ci] = [];
    byChunk[ci].push(item);
  }
  return Object.values(byChunk);
});

const statList = computed(() => {
  const counts: Record<string, number> = { pending: 0, sending: 0, sent: 0, failed: 0 };
  for (const item of items.value) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }
  return [
    { status: 'pending', label: 'Chờ', color: 'grey', count: counts.pending },
    { status: 'sending', label: 'Đang gửi', color: 'info', count: counts.sending },
    { status: 'sent', label: 'Đã gửi', color: 'success', count: counts.sent },
    { status: 'failed', label: 'Lỗi', color: 'error', count: counts.failed },
  ];
});

watch(() => props.modelValue, open => {
  if (open && props.campaign?.id) {
    page.value = 1;
    items.value = [];
    fetchQueue();
  }
});

async function fetchQueue() {
  if (!props.campaign?.id) return;
  loading.value = true;
  try {
    const res = await api.get(`/campaigns/${props.campaign.id}/queue`, { params: { page: 1, limit: LIMIT } });
    items.value = res.data.items || [];
    total.value = res.data.total || 0;
    page.value = 1;
  } catch { /* ignore */ } finally { loading.value = false; }
}

async function loadMore() {
  loadingMore.value = true;
  try {
    const nextPage = page.value + 1;
    const res = await api.get(`/campaigns/${props.campaign.id}/queue`, { params: { page: nextPage, limit: LIMIT } });
    items.value.push(...(res.data.items || []));
    page.value = nextPage;
  } catch { /* ignore */ } finally { loadingMore.value = false; }
}

function chunkStatusColor(chunk: any[]) {
  if (chunk.every(i => i.status === 'sent')) return 'success';
  if (chunk.some(i => i.status === 'failed')) return 'error';
  if (chunk.some(i => i.status === 'sending')) return 'info';
  return 'grey';
}
function chunkStatusLabel(chunk: any[]) {
  const c = chunkStatusColor(chunk);
  return { success: 'Gửi xong', error: 'Có lỗi', info: 'Đang gửi', grey: 'Chờ' }[c] || '';
}
function statusColor(s: string) {
  return { pending: 'grey', sending: 'info', sent: 'success', failed: 'error' }[s] || 'grey';
}
function statusIcon(s: string) {
  return { pending: 'mdi-clock', sending: 'mdi-loading', sent: 'mdi-check', failed: 'mdi-close' }[s] || 'mdi-circle';
}
function statusLabel(s: string) {
  return { pending: 'Chờ', sending: 'Đang gửi', sent: 'Đã gửi', failed: 'Lỗi' }[s] || s;
}
function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function truncate(s: string, len: number) {
  return s?.length > len ? s.slice(0, len) + '…' : s;
}
</script>

<style scoped>
.stats-bar {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.chunk-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 20px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  letter-spacing: 0.5px;
}
.chunk-line {
  height: 1px;
  background: rgba(var(--v-border-color), 0.3);
}
.status-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.item-separator {
  border-bottom: 1px dashed rgba(var(--v-border-color), 0.3);
}
.delay-indicator {
  opacity: 0.6;
}
.queue-item {
  transition: background 0.1s;
}
.queue-item:hover {
  background: rgba(var(--v-theme-primary), 0.03);
  border-radius: 8px;
}
</style>
