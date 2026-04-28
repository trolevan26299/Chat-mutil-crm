<template>
  <MobileContactView v-if="isMobile" />
  <div v-else class="contacts-page d-flex flex-column">
    <!-- Toolbar -->
    <div class="d-flex align-center mb-3 flex-wrap gap-2 flex-shrink-0">
      <h1 class="text-h5 mr-4">Khách hàng</h1>
      <v-spacer />
      <v-btn
        variant="outlined"
        prepend-icon="mdi-content-duplicate"
        class="mr-2"
        @click="showDuplicateDialog = true"
      >
        Trùng lặp
        <v-badge
          v-if="duplicateTotal > 0"
          :content="duplicateTotal"
          color="error"
          inline
        />
      </v-btn>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Thêm KH</v-btn>
    </div>

    <!-- Filters -->
    <div class="flex-shrink-0">
      <ContactFilters :filters="filters" @search="onFilterChange" />
    </div>

    <!-- Data table fills remaining height, scrolls internally -->
    <v-card class="flex-grow-1 d-flex flex-column overflow-hidden mt-3">
      <v-data-table-server
        :headers="headers"
        :items="contacts"
        :loading="loading"
        :items-per-page="pagination.limit"
        :items-length="total"
        item-value="id"
        fixed-header
        class="contacts-table flex-grow-1"
        hover
        @click:row="onRowClick"
        @update:page="onPageChange"
        @update:items-per-page="onItemsPerPageChange"
      >
        <!-- Avatar -->
        <template #item.avatarUrl="{ item }">
          <v-avatar size="32" color="grey-lighten-2">
            <v-img v-if="item.avatarUrl" :src="item.avatarUrl" />
            <v-icon v-else size="18">mdi-account</v-icon>
          </v-avatar>
        </template>

        <!-- Source chip -->
        <template #item.source="{ item }">
          <v-chip v-if="item.source" size="small" variant="tonal">
            {{ sourceLabel(item.source) }}
          </v-chip>
          <span v-else class="text-grey">—</span>
        </template>

        <!-- Email -->
        <template #item.email="{ item }">
          <span v-if="item.email" class="text-body-2">{{ item.email }}</span>
          <span v-else class="text-grey">—</span>
        </template>

        <!-- Status chip -->
        <template #item.status="{ item }">
          <v-chip
            v-if="item.status"
            :color="statusColor(item.status)"
            size="small"
            variant="tonal"
          >
            {{ statusLabel(item.status) }}
          </v-chip>
          <span v-else class="text-grey">—</span>
        </template>

        <!-- Next appointment date -->
        <template #item.nextAppointment="{ item }">
          <span v-if="item.nextAppointment" class="text-body-2">
            {{ formatDate(item.nextAppointment) }}
          </span>
          <span v-else class="text-grey">—</span>
        </template>

        <!-- First contact date -->
        <template #item.firstContactDate="{ item }">
          {{ item.firstContactDate ? new Date(item.firstContactDate).toLocaleDateString('vi-VN') : '—' }}
        </template>

        <!-- Assigned user -->
        <template #item.assignedUser="{ item }">
          <span class="text-body-2">{{ item.assignedUser?.fullName ?? '—' }}</span>
        </template>

        <!-- Lead score -->
        <template #item.leadScore="{ item }">
          <v-chip
            :color="scoreColor(item.leadScore)"
            size="small"
            variant="tonal"
          >
            {{ item.leadScore ?? 0 }}
          </v-chip>
        </template>

        <!-- Last activity -->
        <template #item.lastActivity="{ item }">
          <span v-if="item.lastActivity" class="text-body-2">{{ relativeTime(item.lastActivity) }}</span>
          <span v-else class="text-grey">—</span>
        </template>

        <!-- AI Auto-Reply toggle -->
        <template #item.aiAutoReply="{ item }">
          <div @click.stop>
            <v-switch
              :model-value="getAiAutoReply(item)"
              :loading="togglingId === item.id"
              color="primary"
              hide-details
              density="compact"
              inset
              style="display:inline-flex"
              @update:model-value="toggleAiAutoReply(item, $event)"
            />
          </div>
        </template>
      </v-data-table-server>
    </v-card>

    <!-- Contact detail/edit dialog -->
    <ContactDetailDialog
      v-model="showDialog"
      :contact="selectedContact"
      @saved="onSaved"
      @deleted="onDeleted"
    />

    <DuplicateReviewDialog
      v-model="showDuplicateDialog"
      @merged="onDuplicateMerged"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import ContactFilters from '@/components/contacts/ContactFilters.vue';
import ContactDetailDialog from '@/components/contacts/ContactDetailDialog.vue';
import DuplicateReviewDialog from '@/components/contacts/DuplicateReviewDialog.vue';
import { useContacts, useContactIntelligence, SOURCE_OPTIONS, STATUS_OPTIONS } from '@/composables/use-contacts';
import type { Contact } from '@/composables/use-contacts';
import MobileContactView from '@/views/MobileContactView.vue';
import { useMobile } from '@/composables/use-mobile';
import { api } from '@/api/index';

const { isMobile } = useMobile();

const { contacts, total, loading, filters, pagination, fetchContacts } = useContacts();
const { duplicateTotal, fetchDuplicateGroups } = useContactIntelligence();

const showDialog = ref(false);
const showDuplicateDialog = ref(false);
const selectedContact = ref<Contact | null>(null);

const headers = [
  { title: '', key: 'avatarUrl', sortable: false, width: '48px' },
  { title: 'Tên Zalo', key: 'fullName', sortable: true },
  { title: 'Tên CRM', key: 'crmName', sortable: true },
  { title: 'SĐT', key: 'phone', sortable: false },
  { title: 'Email', key: 'email', sortable: false },
  { title: 'Nguồn', key: 'source', sortable: false },
  { title: 'Trạng thái', key: 'status', sortable: false },
  { title: 'Tái khám', key: 'nextAppointment', sortable: true },
  { title: 'Ngày tiếp nhận', key: 'firstContactDate', sortable: true },
  { title: 'Sale', key: 'assignedUser', sortable: false },
  { title: 'Điểm', key: 'leadScore', sortable: true, width: '80px' },
  { title: 'Hoạt động', key: 'lastActivity', sortable: true },
  { title: 'AUTO-REPLY', key: 'aiAutoReply', sortable: false, width: '130px' },
];

function sourceLabel(value: string) {
  return SOURCE_OPTIONS.find(o => o.value === value)?.text ?? value;
}

function statusLabel(value: string) {
  return STATUS_OPTIONS.find(o => o.value === value)?.text ?? value;
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    new: 'grey',
    contacted: 'blue',
    interested: 'orange',
    converted: 'success',
    lost: 'error',
  };
  return map[status] ?? 'grey';
}

function formatDate(date: string) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('vi-VN');
}

function scoreColor(score: number) {
  if (score >= 70) return 'success';
  if (score >= 40) return 'orange';
  return 'error';
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  return `${days} ngày trước`;
}

function onFilterChange() {
  pagination.page = 1;
  fetchContacts();
}

function onPageChange(page: number) {
  pagination.page = page;
  fetchContacts();
}

function onItemsPerPageChange(val: number) {
  pagination.limit = val;
  pagination.page = 1;
  fetchContacts();
}

function openCreate() {
  selectedContact.value = null;
  showDialog.value = true;
}

function onRowClick(_event: Event, row: { item: Contact }) {
  selectedContact.value = row.item;
  showDialog.value = true;
}

function onSaved() {
  fetchContacts();
}

function onDeleted() {
  fetchContacts();
}

const togglingId = ref<string | null>(null);

function getAiAutoReply(contact: Contact): boolean {
  return (contact.metadata?.aiAutoReply as boolean | undefined) === true;
}

async function toggleAiAutoReply(contact: Contact, value: boolean | null) {
  togglingId.value = contact.id;
  try {
    await api.patch(`/contacts/${contact.id}/ai-auto-reply`, { enabled: !!value });
    // Update local state inline without refetch
    if (contact.metadata) {
      contact.metadata.aiAutoReply = !!value;
    } else {
      (contact as any).metadata = { aiAutoReply: !!value };
    }
  } catch (e) {
    console.error('Toggle AI auto-reply failed', e);
  } finally {
    togglingId.value = null;
  }
}

function onDuplicateMerged() {
  fetchContacts();
  fetchDuplicateGroups();
}

onMounted(() => {
  fetchContacts();
  fetchDuplicateGroups();
});
</script>

<style scoped>
/* Fill the entire available v-main height, no outer scrollbar */
.contacts-page {
  height: calc(100vh - 64px - 32px); /* 64px appbar + 32px container padding */
  overflow: hidden;
}

/* Table card grows to fill remaining space */
.contacts-page .v-card {
  overflow: hidden;
}

/* Make the table body scroll internally */
:deep(.contacts-table .v-table__wrapper) {
  flex: 1 1 auto;
  overflow-y: auto;
}

:deep(.contacts-table) {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
