<template>
  <v-card class="login-card pa-10" elevation="0">

    <!-- Logo + Brand -->
    <div class="text-center mb-8">
      <div class="logo-wrap mx-auto mb-5">
        <div class="logo-ring" />
        <div class="logo-orb d-flex align-center justify-center">
          <v-icon size="28" color="white">mdi-message-text</v-icon>
        </div>
      </div>

      <h1 class="brand-name mb-1">
        Zalo<span class="brand-accent">CRM</span>
      </h1>
      <p class="text-caption brand-sub">
        Multi-Account Zalo Management Platform
      </p>
    </div>

    <!-- Form -->
    <v-form @submit.prevent="handleLogin" class="d-flex flex-column gap-3">
      <v-text-field
        v-model="email"
        label="Email"
        type="email"
        prepend-inner-icon="mdi-email-outline"
        required
        variant="outlined"
        hide-details="auto"
        rounded="lg"
      />
      <v-text-field
        v-model="password"
        label="Mật khẩu"
        type="password"
        prepend-inner-icon="mdi-lock-outline"
        required
        variant="outlined"
        hide-details="auto"
        rounded="lg"
        class="mb-4"
      />

      <v-btn
        type="submit"
        color="primary"
        block
        size="large"
        :loading="loading"
        rounded="lg"
        class="login-btn"
      >
        <v-icon start size="18">mdi-login</v-icon>
        Đăng nhập
      </v-btn>
    </v-form>

    <v-alert
      v-if="error"
      type="error"
      class="mt-4"
      density="compact"
      closable
      variant="tonal"
      rounded="lg"
    >
      {{ error }}
    </v-alert>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  try {
    const needs = await authStore.checkSetup();
    if (needs) router.replace('/setup');
  } catch {}
});

async function handleLogin() {
  loading.value = true;
  error.value = '';
  try {
    await authStore.login(email.value, password.value);
    router.push('/');
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Đăng nhập thất bại';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-card {
  background: rgba(30, 41, 59, 0.75) !important;
  backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(59, 130, 246, 0.15) !important;
  border-radius: 24px !important;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.15) !important;
}

.v-theme--light .login-card {
  background: rgba(255, 255, 255, 0.85) !important;
  border: 1px solid rgba(37, 99, 235, 0.12) !important;
  box-shadow: 0 24px 48px rgba(37, 99, 235, 0.08) !important;
}

/* Logo ring animation */
.logo-wrap {
  position: relative;
  width: 72px;
  height: 72px;
}

.logo-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, #3B82F6, #6366F1, #059669, #3B82F6);
  animation: spin 4s linear infinite;
  padding: 2px;
}

.logo-ring::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  background: #0F172A;
}

.v-theme--light .logo-ring::after {
  background: #F8FAFC;
}

.logo-orb {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3B82F6, #6366F1);
  z-index: 1;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Brand text */
.brand-name {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #F1F5F9;
}
.v-theme--light .brand-name {
  color: #0F172A;
}

.brand-accent {
  background: linear-gradient(90deg, #3B82F6, #6366F1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-sub {
  color: #64748B;
  letter-spacing: 0.3px;
  font-size: 14px !important;
}
.login-btn {
  height: 52px !important;
  font-size: 16px !important;
  font-weight: 600 !important;
  letter-spacing: 0.02em;
}

/* Login button */
.login-btn {
  font-weight: 600 !important;
  letter-spacing: 0.01em !important;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.35) !important;
  transition: all 200ms ease !important;
}
.login-btn:hover {
  box-shadow: 0 6px 28px rgba(59, 130, 246, 0.5) !important;
  transform: translateY(-1px);
}
</style>
