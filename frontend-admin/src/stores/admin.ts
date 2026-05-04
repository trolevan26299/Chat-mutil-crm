import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/index';

interface PlatformUser {
  id: string;
  email: string;
  role: string;
  isPlatformAdmin: boolean;
}

export const useAdminStore = defineStore('admin', () => {
  const user = ref<PlatformUser | null>(null);
  const token = ref(localStorage.getItem('platform_token') || '');
  const needsSetup = ref(false);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  async function checkSetup() {
    const res = await api.get('/setup/status');
    needsSetup.value = res.data.needsSetup;
    return res.data.needsSetup;
  }

  async function setup(data: { email: string; password: string; fullName: string }) {
    const res = await api.post('/setup', data);
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('platform_token', res.data.token);
  }

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('platform_token', res.data.token);
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('platform_token');
  }

  return { user, token, needsSetup, isAuthenticated, checkSetup, setup, login, logout };
});
