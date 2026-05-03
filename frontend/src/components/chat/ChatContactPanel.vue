<template>
  <div
    class="chat-contact-panel d-flex flex-column"
    style="width: 320px; border-left: 1px solid rgba(0,0,0,0.12); height: 100%; overflow-y: auto; flex-shrink: 0;"
  >
    <div class="pa-3 d-flex align-center" style="border-bottom: 1px solid rgba(0,0,0,0.12);">
      <v-icon icon="mdi-account-details" class="mr-2" />
      <span class="font-weight-medium">Thông tin khách hàng</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="$emit('close')">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>

    <div class="pa-3">
      <!-- Lead score + last activity display -->
      <div v-if="props.contact" class="d-flex align-center mb-3 ga-2">
        <v-chip
          :color="scoreColor(props.contact.leadScore)"
          size="small"
          variant="tonal"
          prepend-icon="mdi-star"
        >
          {{ props.contact.leadScore ?? 0 }} điểm
        </v-chip>
        <span v-if="props.contact.lastActivity" class="text-caption text-grey">
          {{ relativeTime(props.contact.lastActivity) }}
        </span>
      </div>

      <v-text-field v-model="form.crmName" label="Tên CRM (tên thật)" density="compact" variant="outlined" class="mb-2" hide-details
        hint="Tên chuẩn hóa dùng cho automation, VD: Nguyễn Văn Hải" persistent-hint />
      <v-text-field v-model="form.fullName" label="Tên hiển thị Zalo" density="compact" variant="outlined" class="mb-2" hide-details
        hint="Tên gợi nhớ trên Zalo, VD: Hải - Quan tâm 2PN" persistent-hint />
      <v-text-field v-model="form.phone" label="Số điện thoại" density="compact" variant="outlined" class="mb-2" hide-details />
      <v-text-field v-model="form.email" label="Email" type="email" density="compact" variant="outlined" class="mb-2" hide-details />

      <v-select v-model="form.source" label="Nguồn" :items="SOURCE_OPTIONS" item-title="text" item-value="value"
        density="compact" variant="outlined" clearable class="mb-2" hide-details />

      <v-select v-model="form.status" label="Trạng thái" :items="STATUS_OPTIONS" item-title="text" item-value="value"
        density="compact" variant="outlined" clearable class="mb-2" hide-details />

      <v-text-field v-model="form.firstContactDate" label="Ngày tiếp nhận" type="date"
        density="compact" variant="outlined" class="mb-2" hide-details />

      <v-text-field v-model="form.nextAppointmentDate" label="Hẹn tái khám" type="date"
        density="compact" variant="outlined" class="mb-2" hide-details />

      <v-combobox v-model="form.tags" label="Tags" multiple chips closable-chips
        density="compact" variant="outlined" class="mb-2" hide-details />

      <v-textarea v-model="form.notes" label="Ghi chú" rows="2" auto-grow
        density="compact" variant="outlined" class="mb-3" hide-details />

      <v-btn color="primary" block :loading="saving" @click="saveContact">Lưu thông tin</v-btn>

      <v-alert v-if="saveSuccess" type="success" density="compact" class="mt-2" closable @click:close="saveSuccess = false">
        Đã lưu thành công!
      </v-alert>
      <v-alert v-if="saveError" type="error" density="compact" class="mt-2" closable @click:close="saveError = false">
        Lưu thất bại, thử lại!
      </v-alert>

      <!-- AI Auto-Reply Toggle -->
      <v-card variant="outlined" class="mb-3">
        <v-card-text class="d-flex align-center py-2">
          <v-icon class="mr-2" :color="aiAutoReplyEnabled ? 'primary' : 'grey'">mdi-robot</v-icon>
          <div class="flex-grow-1">
            <div class="text-body-2 font-weight-medium">AI Tự Động Trả Lời</div>
            <div class="text-caption text-grey">AI sẽ tự động rep tin nhắn đến</div>
          </div>
          <v-switch
            v-model="aiAutoReplyEnabled"
            :loading="aiAutoReplyLoading"
            color="primary"
            hide-details
            inset
            @update:model-value="toggleAiAutoReply"
          />
        </v-card-text>
      </v-card>

      <AiSummaryCard :summary="aiSummary" :loading="aiSummaryLoading" @refresh="$emit('refresh-ai-summary')" />

      <v-card variant="outlined" class="mb-3 overflow-hidden">
        <div class="d-flex align-center px-3 pt-3 pb-1" style="gap: 8px; flex-wrap: nowrap;">
          <v-icon size="18" color="secondary">mdi-chart-bell-curve-cumulative</v-icon>
          <span class="text-body-2 font-weight-bold" style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Cảm xúc khách hàng</span>
          <v-btn
            size="small"
            variant="tonal"
            color="secondary"
            density="compact"
            :loading="aiSentimentLoading"
            prepend-icon="mdi-emoticon-outline"
            style="flex-shrink: 0; font-size: 11px;"
            @click="$emit('refresh-ai-sentiment')"
          >Phân tích</v-btn>
        </div>
        <v-card-text class="pt-1">
          <AiSentimentBadge :sentiment="aiSentiment" />
          <div v-if="aiSentiment?.reason" class="text-body-2 mt-2" style="line-height: 1.6;">{{ aiSentiment.reason }}</div>
          <div v-else-if="!aiSentiment" class="text-body-2 text-grey font-italic">Chưa phân tích.</div>
        </v-card-text>
      </v-card>

      <ChatAppointments
        v-if="props.contactId"
        :contact-id="props.contactId"
        :appointments="contactAppointments"
        @refresh="reloadAppointments"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { SOURCE_OPTIONS, STATUS_OPTIONS } from '@/composables/use-contacts';
import type { Contact } from '@/composables/use-contacts';
import type { AiSentiment } from '@/composables/use-chat';
import { useChatContactPanel } from '@/composables/use-chat-contact-panel';
import ChatAppointments from './ChatAppointments.vue';
import AiSummaryCard from '@/components/ai/ai-summary-card.vue';
import AiSentimentBadge from '@/components/ai/ai-sentiment-badge.vue';
import { ref, watch } from 'vue';
import { api } from '@/api/index';

const props = defineProps<{
  contactId: string | null;
  contact: Contact | null;
  aiSummary: string;
  aiSummaryLoading: boolean;
  aiSentiment: AiSentiment | null;
  aiSentimentLoading: boolean;
}>();

const emit = defineEmits<{ close: []; saved: []; 'refresh-ai-summary': []; 'refresh-ai-sentiment': [] }>();

const {
  form, saving, saveSuccess, saveError,
  contactAppointments,
  saveContact, reloadAppointments,
} = useChatContactPanel(
  () => props.contactId,
  () => props.contact,
  () => emit('saved'),
);

const aiAutoReplyEnabled = ref(false);
const aiAutoReplyLoading = ref(false);

// Only sync from server when switching to a DIFFERENT contact (id changes)
// This prevents parent refresh from resetting the toggle after the user just set it
watch(
  () => props.contact?.id,
  (_newId, oldId) => {
    if (_newId !== oldId) {
      const meta = (props.contact?.metadata as Record<string, unknown> | null | undefined) ?? {};
      aiAutoReplyEnabled.value = meta.aiAutoReply === true;
    }
  },
  { immediate: true },
);

// Also sync when same contact is reloaded AND it has fresh metadata (e.g. first load)
watch(
  () => props.contact?.metadata,
  (meta) => {
    // Only update if we are NOT in the middle of a toggle action
    if (!aiAutoReplyLoading.value) {
      const m = (meta as Record<string, unknown> | null | undefined) ?? {};
      aiAutoReplyEnabled.value = m.aiAutoReply === true;
    }
  },
);

async function toggleAiAutoReply(value: boolean | null) {
  if (!props.contactId) return;
  aiAutoReplyLoading.value = true;
  // Optimistic update: set immediately so UI doesn't flicker
  aiAutoReplyEnabled.value = !!value;
  try {
    await api.patch(`/contacts/${props.contactId}/ai-auto-reply`, { enabled: !!value });
  } catch (e) {
    // revert on error
    aiAutoReplyEnabled.value = !value;
  } finally {
    aiAutoReplyLoading.value = false;
  }
}

function scoreColor(score: number) {
  if (score >= 70) return 'success';
  if (score >= 40) return 'orange';
  return 'error';
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  return `${days} ngày trước`;
}
</script>
