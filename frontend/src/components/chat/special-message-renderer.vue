<template>
  <div class="special-message">
    <!-- Bank Transfer -->
    <v-card v-if="type === 'bank_transfer'" variant="tonal" color="success" class="pa-3" rounded="lg">
      <div class="d-flex align-center">
        <v-icon icon="mdi-bank-transfer" size="28" class="mr-3" />
        <div>
          <div class="font-weight-bold">{{ bankName || 'Chuyển khoản' }}</div>
          <div v-if="amount" class="text-h6">{{ formatAmount(amount) }}</div>
          <div v-if="description" class="text-caption text-medium-emphasis">{{ description }}</div>
        </div>
      </div>
    </v-card>

    <!-- Call (voice or video) -->
    <v-chip
      v-else-if="type === 'call' || isZaloCallEvent"
      variant="tonal"
      :color="isSelf ? 'white' : (isMissed ? 'error' : 'primary')"
      label
    >
      <v-icon :icon="isVideo ? 'mdi-video' : 'mdi-phone'" class="mr-1" />
      {{ callLabel }}
    </v-chip>

    <!-- Contact Card (Business card) -->
    <v-card v-else-if="type === 'contact_card'" variant="outlined" class="pa-3" rounded="lg">
      <div class="d-flex align-center">
        <v-avatar size="40" class="mr-3" color="grey-lighten-2">
          <v-img v-if="content?.thumb" :src="content.thumb" />
          <v-icon v-else>mdi-account</v-icon>
        </v-avatar>
        <div>
          <div class="font-weight-bold">{{ content?.title || 'Danh thiếp' }}</div>
          <div class="text-caption text-medium-emphasis">{{ contactDescription }}</div>
        </div>
      </div>
    </v-card>

    <!-- QR Code -->
    <v-card v-else-if="type === 'qr_code'" variant="outlined" class="pa-3 text-center" rounded="lg" style="max-width: 140px;">
      <v-icon icon="mdi-qrcode" size="48" color="primary" />
      <div class="text-caption mt-1">Mã QR</div>
    </v-card>

    <!-- Reminder / Calendar -->
    <v-card v-else-if="type === 'reminder'" variant="tonal" color="warning" class="pa-3" rounded="lg">
      <div class="d-flex align-center">
        <v-icon icon="mdi-calendar-clock" class="mr-2" />
        <span>{{ title || 'Nhắc hẹn' }}</span>
      </div>
    </v-card>

    <!-- Poll / Vote -->
    <v-card v-else-if="type === 'poll'" variant="tonal" color="info" class="pa-3" rounded="lg">
      <div class="d-flex align-center">
        <v-icon icon="mdi-poll" class="mr-2" />
        <span>{{ title || 'Bình chọn' }}</span>
      </div>
    </v-card>

    <!-- Note -->
    <v-card v-else-if="type === 'note'" variant="tonal" color="secondary" class="pa-3" rounded="lg">
      <div class="d-flex align-center">
        <v-icon icon="mdi-note-text" class="mr-2" />
        <span>{{ title || 'Ghi chú' }}</span>
      </div>
    </v-card>

    <!-- Forwarded -->
    <v-chip v-else-if="type === 'forwarded'" variant="tonal" color="purple" label>
      <v-icon icon="mdi-share" class="mr-1" />
      Tin nhắn chuyển tiếp
    </v-chip>

    <!-- Generic rich / unknown fallback -->
    <v-chip v-else variant="tonal" color="grey" label>
      <v-icon icon="mdi-message-text" class="mr-1" />
      Tin nhắn đặc biệt
    </v-chip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  isSelf?: boolean;
}>();

// Bank transfer helpers
const bankName = computed<string>(() => props.content?.bankName || props.content?.bankCode || '');
const amount = computed<number | null>(() => {
  const v = props.content?.amount ?? props.content?.transferAmount;
  return v != null ? Number(v) : null;
});
const description = computed<string>(() => props.content?.description || props.content?.content || '');

// Contact Card helpers
const contactDescription = computed<string>(() => {
  const desc = props.content?.description;
  if (!desc) return 'Danh thiếp Zalo';
  if (typeof desc === 'string' && desc.startsWith('{')) {
    try {
      const parsed = JSON.parse(desc);
      if (parsed.phone) return `SĐT: ${parsed.phone}`;
      return 'Danh thiếp Zalo';
    } catch {
      return desc;
    }
  }
  return desc;
});

function formatAmount(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

// Call helpers
const isZaloCallEvent = computed<boolean>(() => {
  return props.type === 'contact_card' && props.content?.title === 'sendBubbleMessage';
});

const callParams = computed(() => {
  if (isZaloCallEvent.value && props.content?.params) {
    try {
      return typeof props.content.params === 'string' ? JSON.parse(props.content.params) : props.content.params;
    } catch { return {}; }
  }
  return null;
});

const isMissed = computed<boolean>(() => {
  if (callParams.value) {
    return props.content?.action?.includes('misscall') || callParams.value.duration === 0;
  }
  const t = (props.content?.callType || '').toLowerCase();
  return t.includes('miss') || props.content?.duration === 0;
});

const isVideo = computed<boolean>(() => {
  if (callParams.value) {
    return callParams.value.calltype === 1; // 1=video, 0=audio based on observed Zalo payloads
  }
  const t = (props.content?.callType || '').toLowerCase();
  return t.includes('video');
});

const callLabel = computed<string>(() => {
  let isOutgoing = false;
  if (callParams.value) {
    isOutgoing = callParams.value.isCaller === 1;
  }

  // Direction prefix
  let prefix = isVideo.value ? 'Cuộc gọi video' : 'Cuộc gọi';
  if (isMissed.value) {
    prefix = isOutgoing ? (isVideo.value ? 'Cuộc gọi video nhỡ' : 'Cuộc gọi nhỡ') : prefix + ' nhỡ';
  } else if (isOutgoing) {
    prefix = 'Gọi đi';
  } else {
    prefix = 'Cuộc gọi đến';
  }

  const dur = callParams.value ? (callParams.value.duration || 0) : (props.content?.callDuration ?? props.content?.duration);
  if (dur && dur > 0) {
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    const label = mins > 0 ? `${mins} phút ${secs} giây` : `${secs} giây`;
    return `${prefix} (${label})`;
  }
  return prefix;
});

// Generic title for reminder/poll/note
const title = computed<string>(() => props.content?.title || props.content?.name || '');
</script>

<style scoped>
.special-message {
  display: inline-block;
  max-width: 100%;
}
</style>
