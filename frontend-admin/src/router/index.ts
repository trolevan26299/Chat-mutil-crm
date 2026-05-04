import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/LoginView.vue') },
  { path: '/setup', name: 'Setup', component: () => import('@/views/SetupView.vue') },
  {
    path: '/',
    component: () => import('@/views/LayoutView.vue'),
    children: [
      { path: '', name: 'Dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'tenants', name: 'Tenants', component: () => import('@/views/TenantsView.vue') },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const token = localStorage.getItem('platform_token');
  if (!token && to.name !== 'Login' && to.name !== 'Setup') {
    return { name: 'Login' };
  }
});
