<template>
  <v-layout>
    <v-navigation-drawer v-model="drawer" width="260" color="surface">
      <v-list density="compact" nav>
        <v-list-item prepend-icon="mdi-view-dashboard" title="Dashboard" to="/" exact active-color="primary" />
        <v-list-item prepend-icon="mdi-domain" title="Tenants" to="/tenants" active-color="primary" />
      </v-list>
      <template #append>
        <v-list density="compact" nav>
          <v-list-item
            prepend-icon="mdi-logout"
            title="Đăng xuất"
            @click="handleLogout"
            color="error"
          />
        </v-list>
      </template>
    </v-navigation-drawer>

    <v-app-bar flat density="compact" color="surface" class="border-b">
      <v-app-bar-nav-icon @click="drawer = !drawer" color="primary"></v-app-bar-nav-icon>
      <v-app-bar-title class="text-body-1 font-weight-bold">
        <v-icon class="mr-2" color="primary">mdi-shield-crown</v-icon>
        <span class="text-primary font-weight-bold">ChatCRM</span> — Platform Admin
      </v-app-bar-title>
      <template #append>
        <v-chip size="small" color="primary" variant="tonal" class="mr-3">
          <v-icon start size="14">mdi-account</v-icon>
          {{ adminStore.user?.email }}
        </v-chip>
      </template>
    </v-app-bar>

    <v-main>
      <v-container fluid class="pa-6">
        <router-view />
      </v-container>
    </v-main>
  </v-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/stores/admin';

const drawer = ref(true);
const adminStore = useAdminStore();
const router = useRouter();

function handleLogout() {
  adminStore.logout();
  router.push('/login');
}
</script>
