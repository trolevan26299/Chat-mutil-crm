import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

export const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: localStorage.getItem('theme') || 'dark',
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
      light: {
        dark: false,
        colors: {
          background: '#F8FAFC',
          surface: '#FFFFFF',
          'surface-variant': '#F1F5F9',
          'surface-light': '#E2E8F0',
          primary: '#2563EB',
          'primary-darken-1': '#1D4ED8',
          secondary: '#6366F1',
          accent: '#059669',
          error: '#DC2626',
          warning: '#D97706',
          success: '#059669',
          info: '#0284C7',
          'on-background': '#0F172A',
          'on-surface': '#0F172A',
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
    VAutocomplete: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VTextarea: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VCard: { rounded: 'xl', variant: 'flat' },
    VChip: { rounded: 'lg', size: 'small' },
    VDialog: { maxWidth: 480 },
  },
});
