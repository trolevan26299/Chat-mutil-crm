<template>
  <v-app>
    <OfflineIndicator />

    <!-- Slim mobile app bar -->
    <v-app-bar density="compact" flat>
      <v-app-bar-nav-icon variant="text" @click="drawer = !drawer" />
      <div class="d-flex align-center ml-1" style="gap: 8px;">
        <div class="d-flex align-center justify-center" style="width: 28px; height: 28px; background: linear-gradient(135deg, var(--color-primary), #1E40AF); border-radius: 8px;">
          <v-icon size="16" color="white">mdi-robot</v-icon>
        </div>
        <span class="font-weight-bold text-body-1">Zalo<span style="color: var(--color-primary);">CRM</span></span>
      </div>

      <v-spacer />

      <NotificationBell />
      <v-btn icon size="small" variant="text" @click="toggleTheme">
        <v-icon size="20">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      </v-btn>
      <v-btn icon size="small" variant="text" @click="logout">
        <v-icon size="20">mdi-logout</v-icon>
      </v-btn>
    </v-app-bar>

    <!-- Mobile Navigation Drawer -->
    <v-navigation-drawer v-model="drawer" temporary>
      <div class="pa-4 d-flex align-center" style="gap: 12px; border-bottom: 1px solid var(--border-color);">
        <v-avatar size="40" color="primary">
          {{ authStore.user?.fullName?.charAt(0).toUpperCase() || 'U' }}
        </v-avatar>
        <div>
          <div class="font-weight-bold">{{ authStore.user?.fullName || 'Người dùng' }}</div>
          <div class="text-caption text-grey">{{ authStore.user?.email || '' }}</div>
        </div>
      </div>
      <v-list nav>
        <v-list-item v-for="item in menuItems" :key="item.path" :prepend-icon="item.icon" :title="item.title" :to="item.path" exact color="primary" />
      </v-list>
    </v-navigation-drawer>

    <!-- Main content with padding for bottom nav -->
    <v-main>
      <div 
        :class="[{ 'pa-3': needsPadding }, { 'd-flex flex-column overflow-hidden': isChat }]"
        :style="isChat ? 'height: calc(100dvh - 104px);' : ''"
      >
        <slot />
      </div>
    </v-main>

    <BottomNav />
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRouter, useRoute } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import BottomNav from '@/components/BottomNav.vue';
import OfflineIndicator from '@/components/OfflineIndicator.vue';

const theme = useTheme();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const isDark = ref(localStorage.getItem('theme') !== 'light');
const drawer = ref(false);

const isChat = computed(() => {
  return route.path.startsWith('/chat');
});

const needsPadding = computed(() => {
  return !isChat.value;
});

const menuItems = [
  { title: 'Dashboard',      icon: 'mdi-view-dashboard-outline',            path: '/' },
  { title: 'Tin nhắn',       icon: 'mdi-message-text-outline',              path: '/chat' },
  { title: 'Khách hàng',     icon: 'mdi-account-group-outline',             path: '/contacts' },
  { title: 'Chiến dịch',     icon: 'mdi-bullhorn-outline',                  path: '/campaigns' },
  { title: 'Tài khoản Zalo', icon: 'mdi-cellphone-link',                    path: '/zalo-accounts' },
  { title: 'Lịch hẹn',       icon: 'mdi-calendar-clock-outline',            path: '/appointments' },
  { title: 'Báo cáo',        icon: 'mdi-chart-arc',                         path: '/reports' },
  { title: 'Phân tích',      icon: 'mdi-chart-timeline-variant-shimmer',    path: '/analytics' },
  { title: 'Cài đặt',        icon: 'mdi-cog-outline',                       path: '/settings' },
  { title: 'API & Webhook',  icon: 'mdi-api',                               path: '/api-settings' },
  { title: 'Tích hợp',       icon: 'mdi-connection',                        path: '/integrations' },
  { title: 'Automation',     icon: 'mdi-robot-outline',                     path: '/automation' },
];

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
});

function toggleTheme() {
  isDark.value = !isDark.value;
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>
