import axios from 'axios';
import { router } from '@/router/index';

const api = axios.create({
  baseURL: '/api/platform',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('platform_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('platform_token');
      const currentPath = router.currentRoute.value.path;
      if (currentPath !== '/login') {
        router.replace('/login');
      }
    }
    return Promise.reject(error);
  },
);

export { api };
