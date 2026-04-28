<template>
  <div style="width: 280px;">
    <v-text-field
      v-model="query"
      placeholder="Tìm kiếm..."
      prepend-inner-icon="mdi-magnify"
      variant="solo-filled"
      density="compact"
      hide-details
      rounded="xl"
      clearable
      @update:model-value="debouncedSearch"
      @focus="onFocus"
      @click:clear="onClear"
    />
    <v-menu
      v-model="showResults"
      activator="parent"
      :close-on-content-click="true"
      max-height="400"
      max-width="380"
      offset-y
      location="bottom"
      origin="top center"
      transition="scale-transition"
      class="mt-1"
    >
      <v-card v-if="hasResults" elevation="8" rounded="lg" border>
        <v-list class="pa-0 py-2">
          <!-- Contacts -->
          <template v-if="results.contacts.length">
            <v-list-subheader class="px-4 text-caption font-weight-bold">KHÁCH HÀNG TRÊN HỆ THỐNG</v-list-subheader>
            <v-list-item
              v-for="c in results.contacts"
              :key="c.id"
              @click="goToChatForContact(c)"
              density="compact"
              class="px-4"
            >
              <template #prepend>
                <v-avatar size="28" class="mr-3" color="primary" variant="tonal">
                  <v-img v-if="c.avatarUrl" :src="c.avatarUrl" />
                  <v-icon v-else size="16">mdi-account</v-icon>
                </v-avatar>
              </template>
            <v-list-item-title class="font-weight-medium">{{ c.fullName || c.phone }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              <span v-if="c.sourceAccountName">
                Qua Zalo: {{ c.sourceAccountName }}
              </span>
              <span v-else-if="c.conversations?.[0]?.zaloAccount?.displayName">
                Qua Zalo: {{ c.conversations[0].zaloAccount.displayName }}
              </span>
              <span v-else class="text-disabled">Khách chưa nhắn tin</span>
            </v-list-item-subtitle>
          </v-list-item>
          </template>
          <!-- Messages -->
          <template v-if="results.messages.length">
            <v-divider class="my-2" />
            <v-list-subheader class="px-4 text-caption font-weight-bold">TIN NHẮN</v-list-subheader>
            <v-list-item
              v-for="m in results.messages"
              :key="m.id"
              @click="goTo('/chat', m.conversation?.id)"
              density="compact"
              class="px-4"
            >
              <template #prepend><v-icon size="20" color="info" class="mr-3">mdi-chat-processing-outline</v-icon></template>
              <v-list-item-title class="text-truncate font-weight-medium" style="max-width: 300px;">
                {{ truncate(m.content, 60) }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ m.senderName }} · {{ formatDate(m.sentAt) }}</v-list-item-subtitle>
            </v-list-item>
          </template>
          <!-- Appointments -->
          <template v-if="results.appointments.length">
            <v-divider class="my-2" />
            <v-list-subheader class="px-4 text-caption font-weight-bold">LỊCH HẸN</v-list-subheader>
            <v-list-item
              v-for="a in results.appointments"
              :key="a.id"
              @click="goTo('/appointments')"
              density="compact"
              class="px-4"
            >
              <template #prepend><v-icon size="20" color="warning" class="mr-3">mdi-calendar</v-icon></template>
              <v-list-item-title class="font-weight-medium">{{ a.contact?.fullName }} · {{ formatDate(a.appointmentDate) }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ a.notes }}</v-list-item-subtitle>
            </v-list-item>
          </template>
        </v-list>
      </v-card>
      <v-card
        v-else-if="query && !loading"
        class="pa-4 text-center text-caption text-grey"
      >
        Không tìm thấy kết quả
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';

interface ContactResult {
  id: string;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  sourceAccountName?: string | null;
  conversations?: {
    id: string;
    zaloAccount?: { displayName: string | null };
  }[];
}

interface MessageResult {
  id: string;
  content: string | null;
  senderName: string | null;
  sentAt: string;
  conversation?: { id: string; contact?: { fullName: string | null } } | null;
}

interface AppointmentResult {
  id: string;
  appointmentDate: string;
  appointmentTime: string | null;
  notes: string | null;
  contact?: { fullName: string | null } | null;
}

interface SearchResults {
  contacts: ContactResult[];
  messages: MessageResult[];
  appointments: AppointmentResult[];
}

const query = ref('');
const loading = ref(false);
const showResults = ref(false);
const results = ref<SearchResults>({ contacts: [], messages: [], appointments: [] });
const router = useRouter();

const hasResults = computed(
  () => results.value.contacts.length + results.value.messages.length + results.value.appointments.length > 0
);

function onFocus() {
  if (query.value && query.value.length >= 2 && hasResults.value) {
    showResults.value = true;
  }
}

function onClear() {
  query.value = '';
  showResults.value = false;
  results.value = { contacts: [], messages: [], appointments: [] };
}

let timeout: ReturnType<typeof setTimeout>;

function debouncedSearch(val: string | null) {
  clearTimeout(timeout);
  if (!val || val.length < 2) {
    showResults.value = false;
    results.value = { contacts: [], messages: [], appointments: [] };
    return;
  }
  timeout = setTimeout(async () => {
    loading.value = true;
    try {
      const res = await api.get('/search', { params: { q: val } });
      results.value = res.data;
      showResults.value = true;
    } catch {
      // silently ignore search errors
    } finally {
      loading.value = false;
    }
  }, 300);
}

function goTo(path: string, _id?: string) {
  showResults.value = false;
  query.value = '';
  router.push(path);
}

async function goToChatForContact(c: ContactResult) {
  showResults.value = false;
  query.value = '';
  
  let convId = c.conversations?.[0]?.id;
  
  if (!convId) {
    try {
      const res = await api.post('/conversations/init', { contactId: c.id });
      convId = res.data.conversationId;
    } catch (err: any) {
      alert(err.response?.data?.error || 'Không thể tạo cuộc trò chuyện Zalo với khách hàng này.');
      return;
    }
  }

  if (convId) {
    router.push({ path: '/chat', query: { convId } });
  }
}

function truncate(s: string | null, len: number): string {
  return s && s.length > len ? s.slice(0, len) + '...' : s || '';
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}
</script>
