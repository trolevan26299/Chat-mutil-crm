<template>
  <v-row>
    <v-col v-for="card in cards" :key="card.title" cols="6" sm="4" md="2">
      <v-card class="kpi-card" elevation="0" style="border: 1px solid var(--border-color); border-radius: 16px; background: var(--bg-surface); transition: all 0.3s ease;">
        <v-card-text class="text-left pa-5">
          <div class="d-flex align-center justify-space-between mb-3">
            <v-icon :icon="card.icon" :color="card.color" size="32" />
          </div>
          <div class="text-h4 font-weight-black" style="color: var(--text-primary); line-height: 1.2;">{{ card.value }}</div>
          <div class="text-caption text-uppercase font-weight-bold mt-1" style="color: var(--text-secondary); letter-spacing: 0.03em;">{{ card.title }}</div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface KpiData {
  messagesToday: number;
  messagesUnreplied: number;
  messagesUnread: number;
  appointmentsToday: number;
  newContactsThisWeek: number;
  totalContacts: number;
}

const props = defineProps<{
  kpi: KpiData | null;
}>();

const cards = computed(() => [
  { title: 'Tin nhắn hôm nay', value: props.kpi?.messagesToday ?? '—', icon: 'mdi-chat', color: 'primary' },
  { title: 'Chưa trả lời', value: props.kpi?.messagesUnreplied ?? '—', icon: 'mdi-chat-alert', color: 'warning' },
  { title: 'Chưa đọc', value: props.kpi?.messagesUnread ?? '—', icon: 'mdi-email-outline', color: 'orange' },
  { title: 'Lịch hẹn hôm nay', value: props.kpi?.appointmentsToday ?? '—', icon: 'mdi-calendar-today', color: 'success' },
  { title: 'KH mới tuần này', value: props.kpi?.newContactsThisWeek ?? '—', icon: 'mdi-account-plus', color: 'info' },
  { title: 'Tổng khách hàng', value: props.kpi?.totalContacts ?? '—', icon: 'mdi-account-group', color: 'secondary' },
]);
</script>
