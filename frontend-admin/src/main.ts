import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';

import App from './App.vue';
import { router } from './router/index';

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          background: '#0F172A',
          surface: '#1E293B',
          'surface-variant': '#334155',
          'surface-light': '#273548',
          primary: '#3B82F6',
          'primary-darken-1': '#2563EB',
          secondary: '#6366F1',
          accent: '#059669',
          error: '#EF4444',
          warning: '#F59E0B',
          success: '#10B981',
          info: '#38BDF8',
          'on-background': '#F1F5F9',
          'on-surface': '#E2E8F0',
          'on-primary': '#FFFFFF',
          'on-secondary': '#FFFFFF',
          'on-accent': '#FFFFFF',
        },
      },
    },
  },
  defaults: {
    VBtn: { variant: 'flat', rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VSelect: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VCard: { rounded: 'xl', variant: 'flat' },
    VChip: { rounded: 'lg', size: 'small' },
    VDialog: { maxWidth: 480 },
  },
});

const app = createApp(App);
app.use(createPinia());
app.use(vuetify);
app.use(router);
app.mount('#app');
