<template>
  <v-bottom-navigation 
    app 
    grow 
    color="primary"
    elevation="4"
    :model-value="activeTab" 
    @update:model-value="navigate" 
    style="padding-bottom: env(safe-area-inset-bottom); border-top: 1px solid var(--border-color);"
  >
    <v-btn v-for="tab in tabs" :key="tab.path" :value="tab.path" :ripple="false">
      <v-icon size="24" class="mb-1">{{ activeTab === tab.path ? tab.activeIcon : tab.icon }}</v-icon>
      <span class="text-caption font-weight-medium" :style="{ opacity: activeTab === tab.path ? 1 : 0.7 }">{{ tab.title }}</span>
    </v-btn>
  </v-bottom-navigation>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const tabs = [
  { title: 'Chat', icon: 'mdi-message-text-outline', activeIcon: 'mdi-message-text', path: '/chat' },
  { title: 'Khách hàng', icon: 'mdi-account-group-outline', activeIcon: 'mdi-account-group', path: '/contacts' },
  { title: 'Lịch hẹn', icon: 'mdi-calendar-clock-outline', activeIcon: 'mdi-calendar-clock', path: '/appointments' },
  { title: 'Tổng quan', icon: 'mdi-view-dashboard-outline', activeIcon: 'mdi-view-dashboard', path: '/' },
];

const activeTab = computed(() => {
  return tabs.find(t => t.path === route.path)?.path || undefined;
});

function navigate(path: string) {
  router.push(path);
}
</script>
