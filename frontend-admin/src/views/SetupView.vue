<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="6" md="4" lg="3">
        <v-card class="pa-8" rounded="xl" elevation="8" color="surface">
          <div class="text-center mb-6">
            <v-icon size="48" color="success" class="mb-3">mdi-rocket-launch</v-icon>
            <h2 class="text-h5 font-weight-bold">Thiết lập ban đầu</h2>
            <p class="text-body-2 text-medium-emphasis">Tạo tài khoản Super Admin</p>
          </div>

          <v-form @submit.prevent="handleSetup">
            <v-text-field v-model="fullName" label="Họ tên" prepend-inner-icon="mdi-account" variant="outlined" density="comfortable" class="mb-3" />
            <v-text-field v-model="email" label="Email" type="email" prepend-inner-icon="mdi-email-outline" variant="outlined" density="comfortable" class="mb-3" />
            <v-text-field v-model="password" label="Mật khẩu" type="password" prepend-inner-icon="mdi-lock-outline" variant="outlined" density="comfortable" class="mb-4" />
            <v-btn type="submit" color="success" block size="large" :loading="loading" rounded="lg">
              <v-icon start>mdi-check</v-icon>Tạo Super Admin
            </v-btn>
          </v-form>

          <v-alert v-if="error" type="error" class="mt-4" density="compact" variant="tonal" closable>{{ error }}</v-alert>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminStore } from '@/stores/admin';

const fullName = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const router = useRouter();
const adminStore = useAdminStore();

async function handleSetup() {
  loading.value = true;
  error.value = '';
  try {
    await adminStore.setup({ email: email.value, password: password.value, fullName: fullName.value });
    router.push('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Setup thất bại';
  } finally {
    loading.value = false;
  }
}
</script>
