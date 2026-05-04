<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="6" md="4" lg="3">
        <v-card class="pa-8" rounded="xl" elevation="8" color="surface">
          <div class="text-center mb-6">
            <v-icon size="48" color="primary" class="mb-3">mdi-shield-crown</v-icon>
            <h2 class="text-h5 font-weight-bold">Platform Admin</h2>
            <p class="text-body-2 text-medium-emphasis">ChatCRM Management Console</p>
          </div>

          <v-form @submit.prevent="handleLogin">
            <v-text-field v-model="email" label="Email" type="email" prepend-inner-icon="mdi-email-outline" variant="outlined" density="comfortable" class="mb-3" />
            <v-text-field v-model="password" label="Mật khẩu" type="password" prepend-inner-icon="mdi-lock-outline" variant="outlined" density="comfortable" class="mb-4" />
            <v-btn type="submit" color="primary" block size="large" :loading="loading" rounded="lg">
              <v-icon start>mdi-login</v-icon>Đăng nhập
            </v-btn>
          </v-form>

          <v-alert v-if="error" type="error" class="mt-4" density="compact" variant="tonal" closable>{{ error }}</v-alert>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/stores/admin';

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const router = useRouter();
const adminStore = useAdminStore();

onMounted(async () => {
  try {
    const needs = await adminStore.checkSetup();
    if (needs) router.replace('/setup');
  } catch {}
});

async function handleLogin() {
  loading.value = true;
  error.value = '';
  try {
    await adminStore.login(email.value, password.value);
    router.push('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Đăng nhập thất bại';
  } finally {
    loading.value = false;
  }
}
</script>
