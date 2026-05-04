import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api/index';

interface OrgInfo {
  id: string;
  name: string;
  slug?: string;
  plan?: string;
  status?: string;
  aiEnabled?: boolean;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  orgId: string;
  orgName: string;
  org?: OrgInfo;
}

interface TenantInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  status: string;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref(localStorage.getItem('token') || '');
  const needsSetup = ref(false);
  const tenantInfo = ref<TenantInfo | null>(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isOwner = computed(() => user.value?.role === 'owner');
  const isAdmin = computed(() => ['owner', 'admin'].includes(user.value?.role || ''));
  const aiEnabled = computed(() => user.value?.org?.aiEnabled ?? false);
  const orgPlan = computed(() => user.value?.org?.plan ?? 'trial');

  async function checkSetup() {
    const res = await api.get('/setup/status');
    needsSetup.value = res.data.needsSetup;
    return res.data.needsSetup;
  }

  async function setup(data: { orgName: string; fullName: string; email: string; password: string }) {
    const res = await api.post('/setup', data);
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('token', res.data.token);
  }

  async function login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    token.value = res.data.token;
    user.value = res.data.user;
    localStorage.setItem('token', res.data.token);
  }

  async function fetchProfile() {
    try {
      const res = await api.get('/profile');
      user.value = res.data;
    } catch {
      logout();
    }
  }

  /** Fetch tenant branding info (public, no auth needed) for login page */
  async function fetchTenantInfo() {
    try {
      const res = await api.get('/tenant/info');
      tenantInfo.value = res.data.tenant;
    } catch {
      tenantInfo.value = null;
    }
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
  }

  async function init() {
    if (token.value) {
      await fetchProfile();
    }
  }

  return {
    user, token, needsSetup, tenantInfo,
    isAuthenticated, isOwner, isAdmin, aiEnabled, orgPlan,
    checkSetup, setup, login, fetchProfile, fetchTenantInfo, logout, init,
  };
});
