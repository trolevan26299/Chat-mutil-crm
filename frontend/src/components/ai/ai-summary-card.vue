<template>
  <v-card variant="outlined" class="mb-3 overflow-hidden">
    <div class="d-flex align-center px-3 pt-3 pb-1" style="gap: 8px; flex-wrap: nowrap;">
      <v-icon size="18" color="primary">mdi-text-box-search-outline</v-icon>
      <span class="text-body-2 font-weight-bold" style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Tóm tắt AI</span>
      <v-btn
        size="small"
        variant="tonal"
        color="primary"
        density="compact"
        :loading="loading"
        prepend-icon="mdi-refresh"
        style="flex-shrink: 0; font-size: 11px;"
        @click="$emit('refresh')"
      >Tóm tắt</v-btn>
    </div>
    <v-card-text class="pt-1">
      <div v-if="summary" class="text-body-2" style="white-space: pre-wrap; line-height: 1.6;">{{ summary }}</div>
      <div v-else class="text-body-2 text-grey font-italic">Chưa có tóm tắt.</div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{ summary: string; loading: boolean }>();
defineEmits<{ refresh: [] }>();
</script>
