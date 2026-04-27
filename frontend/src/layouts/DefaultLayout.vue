<template>
  <v-app>
    <!-- ── Top Bar ──────────────────────────────────────────────────────── -->
    <v-app-bar density="comfortable" flat :style="appBarStyle">
      <v-app-bar-nav-icon
        variant="text"
        :ripple="false"
        class="nav-icon-btn"
        @click="drawer = !drawer"
      />

      <!-- Logo -->
      <div class="d-flex align-center ml-1" style="gap: 10px;">
        <div
          class="logo-orb d-flex align-center justify-center"
          style="width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg, #3B82F6, #6366F1); flex-shrink: 0;"
        >
          <v-icon size="16" color="white">mdi-message-text</v-icon>
        </div>
        <v-app-bar-title class="font-weight-bold" style="font-size: 16px; letter-spacing: -0.3px;">
          Zalo<span style="color: var(--color-primary);">CRM</span>
        </v-app-bar-title>
      </div>

      <!-- Global search -->
      <GlobalSearch class="mx-3" />

      <v-spacer />

      <!-- Online status -->
      <div class="d-flex align-center mr-3 px-3 py-1 rounded-pill status-pill">
        <span class="online-dot mr-2" />
        <span class="text-caption font-weight-bold" style="color: var(--color-online); letter-spacing: 0.8px;">ONLINE</span>
      </div>

      <span class="text-body-2 mr-2 text-medium-emphasis" v-if="authStore.user">
        {{ authStore.user.fullName }}
      </span>

      <NotificationBell />

      <!-- Theme toggle -->
      <v-btn
        icon
        variant="text"
        size="small"
        class="mx-1 topbar-icon-btn"
        @click="toggleTheme"
      >
        <v-icon size="18">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
        <v-tooltip activator="parent" location="bottom" open-delay="300" content-class="custom-tooltip">
          {{ isDark ? 'Light Mode' : 'Dark Mode' }}
        </v-tooltip>
      </v-btn>

      <!-- Logout -->
      <v-btn
        icon
        variant="text"
        size="small"
        class="mr-2 topbar-icon-btn"
        @click="logout"
      >
        <v-icon size="18">mdi-logout</v-icon>
        <v-tooltip activator="parent" location="bottom" open-delay="300" content-class="custom-tooltip">Đăng xuất</v-tooltip>
      </v-btn>
    </v-app-bar>

    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <v-navigation-drawer v-model="drawer" :rail="rail" permanent @click="rail = false">
      <v-list density="compact" nav class="mt-2 px-1">
        <v-list-item
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          :prepend-icon="item.icon"
          :title="item.title"
          :value="item.path"
          rounded="lg"
          class="mb-1 nav-item"
        />
      </v-list>

      <template #append>
        <v-divider class="mx-3 mb-2" />
        <v-list density="compact" nav class="px-1 pb-2">
          <v-list-item
            :prepend-icon="rail ? 'mdi-chevron-right' : 'mdi-chevron-left'"
            title="Thu gọn"
            rounded="lg"
            class="nav-item"
            @click.stop="rail = !rail"
          />
        </v-list>
      </template>
    </v-navigation-drawer>

    <!-- ── Main ────────────────────────────────────────────────────────── -->
    <v-main>
      <v-container fluid class="pa-4">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';

const theme = useTheme();
const authStore = useAuthStore();
const router = useRouter();

const drawer = ref(true);
const rail = ref(false);
const isDark = ref(localStorage.getItem('theme') !== 'light');

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
});

const appBarStyle = computed(() => ({
  background: isDark.value ? '#0F172A' : '#FFFFFF',
  borderBottom: `1px solid ${isDark.value ? '#334155' : '#E2E8F0'}`,
}));

const menuItems = [
  { title: 'Dashboard',      icon: 'mdi-view-dashboard-outline',            path: '/' },
  { title: 'Tin nhắn',       icon: 'mdi-message-text-outline',              path: '/chat' },
  { title: 'Khách hàng',     icon: 'mdi-account-group-outline',             path: '/contacts' },
  { title: 'Tài khoản Zalo', icon: 'mdi-cellphone-link',                    path: '/zalo-accounts' },
  { title: 'Lịch hẹn',       icon: 'mdi-calendar-clock-outline',            path: '/appointments' },
  { title: 'Báo cáo',        icon: 'mdi-chart-arc',                         path: '/reports' },
  { title: 'Phân tích',      icon: 'mdi-chart-timeline-variant-shimmer',    path: '/analytics' },
  { title: 'Cài đặt',        icon: 'mdi-cog-outline',                       path: '/settings' },
  { title: 'API & Webhook',  icon: 'mdi-api',                               path: '/api-settings' },
  { title: 'Tích hợp',       icon: 'mdi-connection',                        path: '/integrations' },
  { title: 'Automation',     icon: 'mdi-robot-outline',                     path: '/automation' },
];

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

<style scoped>
/* ─── Appbar icon buttons ──────────────────────────────────────────────── */
.nav-icon-btn,
.topbar-icon-btn {
  border-radius: 8px !important;
  transition: background 150ms ease, color 150ms ease !important;
}
.nav-icon-btn:hover,
.topbar-icon-btn:hover {
  background: var(--bg-hover) !important;
}

/* ─── Online status pill ───────────────────────────────────────────────── */
.status-pill {
  border: 1px solid rgba(34, 197, 94, 0.25);
  background: rgba(34, 197, 94, 0.06);
}

/* ─── Nav item ─────────────────────────────────────────────────────────── */
.nav-item.v-list-item--active {
  background: rgba(59, 130, 246, 0.1) !important;
  color: var(--color-primary) !important;
  border-left: 3px solid var(--color-primary);
}
.v-theme--light .nav-item.v-list-item--active {
  background: rgba(37, 99, 235, 0.08) !important;
  color: #2563EB !important;
  border-left: 3px solid #2563EB;
}
.nav-item:hover:not(.v-list-item--active) {
  background: var(--bg-hover) !important;
}
</style>
