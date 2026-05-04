<template>
  <div>
    <div class="d-flex align-center mb-6">
      <h1 class="text-h4 font-weight-bold">
        <v-icon class="mr-2" color="primary">mdi-domain</v-icon>Quản lý Tenants
      </h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreateDialog = true" rounded="lg">Tạo Tenant</v-btn>
    </div>

    <!-- Filters -->
    <v-row class="mb-4">
      <v-col cols="12" md="4">
        <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Tìm kiếm..." variant="outlined" density="compact" clearable hide-details @update:model-value="fetchTenants" />
      </v-col>
      <v-col cols="6" md="2">
        <v-select v-model="filterStatus" :items="statusOptions" item-title="title" item-value="value" label="Trạng thái" variant="outlined" density="compact" hide-details @update:model-value="fetchTenants" />
      </v-col>
      <v-col cols="6" md="2">
        <v-select v-model="filterPlan" :items="planOptions" item-title="title" item-value="value" label="Gói cước" variant="outlined" density="compact" hide-details @update:model-value="fetchTenants" />
      </v-col>
    </v-row>

    <!-- Table -->
    <v-card rounded="xl" color="surface" elevation="2">
      <v-table density="comfortable" hover>
        <thead>
          <tr>
            <th>Tên công ty</th>
            <th>Subdomain</th>
            <th>Plan</th>
            <th>Status</th>
            <th>AI</th>
            <th>Users</th>
            <th>Zalo</th>
            <th>Contacts</th>
            <th>Hết hạn</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tenants" :key="t.id">
            <td class="font-weight-medium">{{ t.name }}</td>
            <td><code class="text-primary">{{ t.slug }}</code></td>
            <td><v-chip size="x-small" :color="planColor(t.plan)" variant="tonal">{{ t.plan }}</v-chip></td>
            <td><v-chip size="x-small" :color="statusColor(t.status)" variant="flat">{{ t.status }}</v-chip></td>
            <td><v-icon :color="t.aiEnabled ? 'success' : 'grey'" size="18">{{ t.aiEnabled ? 'mdi-check-circle' : 'mdi-close-circle' }}</v-icon></td>
            <td>{{ t._count?.users ?? 0 }}</td>
            <td>{{ t._count?.zaloAccounts ?? 0 }} / {{ t.maxZalo }}</td>
            <td>{{ t._count?.contacts ?? 0 }}</td>
            <td>{{ t.expiresAt ? new Date(t.expiresAt).toLocaleDateString('vi') : '∞' }}</td>
            <td>
              <v-btn icon size="x-small" variant="text" color="info" @click="openTenantDetail(t.id)"><v-icon size="16">mdi-eye</v-icon></v-btn>
              <v-btn v-if="t.status === 'active'" icon size="x-small" variant="text" color="error" @click="suspendTenant(t)"><v-icon size="16">mdi-pause-circle</v-icon></v-btn>
              <v-btn v-else icon size="x-small" variant="text" color="success" @click="activateTenant(t)"><v-icon size="16">mdi-play-circle</v-icon></v-btn>
            </td>
          </tr>
          <tr v-if="!tenants.length">
            <td colspan="10" class="text-center text-medium-emphasis py-8">Không có tenant nào</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Create Tenant Dialog -->
    <v-dialog v-model="showCreateDialog" max-width="80vw">
      <v-card rounded="xl" color="surface" elevation="2" class="pa-4">
        <v-card-title class="d-flex align-center font-weight-bold text-h5 mb-4">
          Tạo Tenant mới
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showCreateDialog = false" />
        </v-card-title>
        <v-card-text>
          <v-form @submit.prevent="handleCreate">
            <h3 class="text-subtitle-1 font-weight-bold mb-3"><v-icon class="mr-1" color="primary">mdi-domain</v-icon>Thông tin công ty</h3>
            <v-text-field v-model="form.name" label="Tên công ty *" prepend-inner-icon="mdi-office-building" variant="outlined" density="comfortable" class="mb-2" :rules="[v => !!v || 'Bắt buộc']" />
            <v-text-field v-model="form.slug" label="Subdomain (slug) *" prepend-inner-icon="mdi-web" variant="outlined" density="comfortable" class="mb-1" hint="VD: abc → abc.chatcrm.org" persistent-hint :rules="[v => !!v || 'Bắt buộc', v => /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(v) || '3-50 ký tự, a-z, 0-9, dấu gạch ngang']" />
            <v-select v-model="form.plan" :items="plans" label="Gói cước *" prepend-inner-icon="mdi-package-variant" variant="outlined" density="comfortable" class="mb-2 mt-4" />
            <v-text-field v-model="form.expiresAt" label="Ngày hết hạn (để trống = vĩnh viễn)" type="date" prepend-inner-icon="mdi-calendar" variant="outlined" density="comfortable" class="mb-4" clearable />

            <v-divider class="my-4" />

            <h3 class="text-subtitle-1 font-weight-bold mb-3"><v-icon class="mr-1" color="success">mdi-account-key</v-icon>Tài khoản Admin (cho khách)</h3>
            <v-text-field v-model="form.adminFullName" label="Họ tên admin *" prepend-inner-icon="mdi-account" variant="outlined" density="comfortable" class="mb-2" />
            <v-text-field v-model="form.adminEmail" label="Email admin *" type="email" prepend-inner-icon="mdi-email-outline" variant="outlined" density="comfortable" class="mb-2" />
            <v-text-field v-model="form.adminPassword" label="Mật khẩu admin *" type="password" prepend-inner-icon="mdi-lock-outline" variant="outlined" density="comfortable" class="mb-4" />

            <v-btn type="submit" color="primary" size="large" block :loading="creating" rounded="lg">
              <v-icon start>mdi-plus</v-icon>Tạo Tenant
            </v-btn>
          </v-form>

          <v-alert v-if="createError" type="error" class="mt-4" density="compact" variant="tonal" closable>{{ createError }}</v-alert>
          <v-alert v-if="createSuccess" type="success" class="mt-4" density="compact" variant="tonal">
            {{ createSuccess }}
          </v-alert>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Detail/Edit Tenant Dialog -->
    <v-dialog v-model="showDetailDialog" max-width="80vw" scrollable>
      <v-card rounded="xl" color="surface" elevation="2">
        <v-card-title class="d-flex align-center font-weight-bold text-h5 px-6 pt-6 pb-2 border-b">
          Chi tiết Tenant: <span class="text-primary ml-2">{{ selectedTenant?.name }}</span>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailDialog = false" />
        </v-card-title>
        
        <v-card-text class="pa-6" style="max-height: 80vh">
          <div v-if="selectedTenant">
            <!-- Info Cards -->
            <v-row class="mb-6">
              <v-col cols="6" md="3">
                <v-card rounded="lg" class="pa-4 text-center" color="surface-light" elevation="0">
                  <p class="text-h4 font-weight-bold text-info">{{ selectedTenant.users?.length ?? 0 }}</p>
                  <p class="text-body-2 text-medium-emphasis">Users</p>
                </v-card>
              </v-col>
              <v-col cols="6" md="3">
                <v-card rounded="lg" class="pa-4 text-center" color="surface-light" elevation="0">
                  <p class="text-h4 font-weight-bold text-warning">{{ selectedTenant.zaloAccounts?.length ?? 0 }} / {{ selectedTenant.maxZalo }}</p>
                  <p class="text-body-2 text-medium-emphasis">Zalo Accounts</p>
                </v-card>
              </v-col>
              <v-col cols="6" md="3">
                <v-card rounded="lg" class="pa-4 text-center" color="surface-light" elevation="0">
                  <p class="text-h4 font-weight-bold text-success">{{ selectedTenant._count?.contacts ?? 0 }}</p>
                  <p class="text-body-2 text-medium-emphasis">Contacts</p>
                </v-card>
              </v-col>
              <v-col cols="6" md="3">
                <v-card rounded="lg" class="pa-4 text-center" color="surface-light" elevation="0">
                  <p class="text-h4 font-weight-bold" :class="selectedTenant.aiEnabled ? 'text-success' : 'text-grey'">{{ selectedTenant.aiEnabled ? 'ON' : 'OFF' }}</p>
                  <p class="text-body-2 text-medium-emphasis">AI</p>
                </v-card>
              </v-col>
            </v-row>

            <!-- Edit Form & Lists -->
            <v-row>
              <v-col cols="12" md="6">
                <v-card rounded="lg" color="surface-light" elevation="0" class="pa-5 h-100">
                  <h3 class="text-h6 mb-4"><v-icon class="mr-1" color="primary">mdi-cog</v-icon>Cấu hình</h3>
                  <v-select v-model="editPlan" :items="plans" label="Plan" variant="outlined" density="comfortable" class="mb-3" bg-color="surface" />
                  <v-select v-model="editStatus" :items="['active', 'suspended', 'expired']" label="Status" variant="outlined" density="comfortable" class="mb-3" bg-color="surface" />
                  <v-text-field v-model="editMaxZalo" label="Max Zalo" type="number" variant="outlined" density="comfortable" class="mb-3" bg-color="surface" />
                  <v-switch v-model="editAiEnabled" label="AI Enabled" color="primary" class="mb-3" />
                  <v-text-field v-model="editExpiresAt" label="Hết hạn" type="date" variant="outlined" density="comfortable" class="mb-3" clearable bg-color="surface" />
                  
                  <v-divider class="my-4 border-opacity-25"></v-divider>
                  <h3 class="text-subtitle-1 mb-3 text-info"><v-icon size="small" class="mr-1">mdi-account-details</v-icon>Thông tin liên hệ</h3>
                  
                  <v-row>
                    <v-col cols="12" sm="6" class="py-0">
                      <v-text-field v-model="editContactName" label="Tên người liên hệ" prepend-inner-icon="mdi-account" variant="outlined" density="comfortable" class="mb-3" bg-color="surface" />
                    </v-col>
                    <v-col cols="12" sm="6" class="py-0">
                      <v-text-field v-model="editContactPhone" label="Số điện thoại" prepend-inner-icon="mdi-phone" variant="outlined" density="comfortable" class="mb-3" bg-color="surface" />
                    </v-col>
                  </v-row>
                  <v-textarea v-model="editNotes" label="Ghi chú khách hàng" prepend-inner-icon="mdi-note-text-outline" variant="outlined" density="comfortable" rows="2" auto-grow class="mb-4" bg-color="surface" />

                  <v-btn color="primary" block rounded="xl" size="large" :loading="saving" @click="saveChanges" class="mt-2 font-weight-bold">
                    <v-icon start>mdi-content-save</v-icon>Lưu thay đổi
                  </v-btn>
                  <v-alert v-if="saveMsg" :type="saveMsgType" class="mt-4" density="compact" variant="tonal" rounded="lg">{{ saveMsg }}</v-alert>
                </v-card>
              </v-col>

              <v-col cols="12" md="6">
                <!-- Users -->
                <v-card rounded="lg" color="surface-light" elevation="0" class="pa-5 mb-4">
                  <h3 class="text-h6 mb-4"><v-icon class="mr-1" color="info">mdi-account-group</v-icon>Users</h3>
                  <v-table density="compact" class="bg-surface-light">
                    <thead><tr><th>Họ tên</th><th>Email</th><th>Role</th><th>Active</th></tr></thead>
                    <tbody>
                      <tr v-for="u in selectedTenant.users" :key="u.id">
                        <td>{{ u.fullName }}</td>
                        <td><code>{{ u.email }}</code></td>
                        <td><v-chip size="x-small" :color="u.role === 'owner' ? 'warning' : u.role === 'admin' ? 'info' : 'default'" variant="tonal">{{ u.role }}</v-chip></td>
                        <td><v-icon :color="u.isActive ? 'success' : 'error'" size="16">{{ u.isActive ? 'mdi-check' : 'mdi-close' }}</v-icon></td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-card>

                <!-- Subscription Log -->
                <v-card rounded="lg" color="surface-light" elevation="0" class="pa-5">
                  <h3 class="text-h6 mb-4"><v-icon class="mr-1" color="warning">mdi-history</v-icon>Lịch sử</h3>
                  <v-timeline density="compact" side="end" truncate-line="both">
                    <v-timeline-item v-for="log in selectedTenant.subscriptionLogs" :key="log.id" size="x-small" :dot-color="logColor(log.action)">
                      <div>
                        <p class="text-body-2 font-weight-medium">{{ log.action }} → {{ log.plan }}</p>
                        <p class="text-caption text-medium-emphasis">{{ new Date(log.createdAt).toLocaleString('vi') }}</p>
                        <p v-if="log.note" class="text-caption">{{ log.note }}</p>
                      </div>
                    </v-timeline-item>
                  </v-timeline>
                  <p v-if="!selectedTenant.subscriptionLogs?.length" class="text-body-2 text-medium-emphasis text-center py-4">Chưa có lịch sử</p>
                </v-card>
              </v-col>
            </v-row>
          </div>
          <div v-else class="d-flex justify-center align-center py-10">
            <v-progress-circular indeterminate color="primary" />
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/index';

const route = useRoute();
const router = useRouter();

const tenants = ref<any[]>([]);
const search = ref('');
const filterStatus = ref('');
const filterPlan = ref('');

const statusOptions = [
  { title: 'Tất cả', value: '' },
  { title: 'Đang hoạt động (active)', value: 'active' },
  { title: 'Tạm ngưng (suspended)', value: 'suspended' },
  { title: 'Hết hạn (expired)', value: 'expired' },
];

const planOptions = [
  { title: 'Tất cả', value: '' },
  { title: 'Trial', value: 'trial' },
  { title: 'Basic 10', value: 'basic_10' },
  { title: 'Basic 10 AI', value: 'basic_10_ai' },
  { title: 'Pro 30', value: 'pro_30' },
  { title: 'Pro 30 AI', value: 'pro_30_ai' },
  { title: 'Enterprise', value: 'enterprise' },
  { title: 'Enterprise AI', value: 'enterprise_ai' },
];

async function fetchTenants() {
  try {
    const params: any = {};
    if (search.value) params.search = search.value;
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterPlan.value) params.plan = filterPlan.value;
    const res = await api.get('/tenants', { params });
    tenants.value = res.data.tenants || [];
  } catch {}
}

// Dialog logic
const showCreateDialog = ref(false);
const plans = ['trial', 'basic_10', 'basic_10_ai', 'pro_30', 'pro_30_ai', 'enterprise', 'enterprise_ai'];
const form = ref({
  name: '', slug: '', plan: 'trial', expiresAt: '',
  adminFullName: '', adminEmail: '', adminPassword: '',
});
const creating = ref(false);
const createError = ref('');
const createSuccess = ref('');

watch(() => form.value.name, (name) => {
  if (!form.value.slug || form.value.slug === slugify(form.value.name.slice(0, -1))) {
    form.value.slug = slugify(name);
  }
});

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

async function handleCreate() {
  creating.value = true;
  createError.value = '';
  createSuccess.value = '';
  try {
    const res = await api.post('/tenants', form.value);
    createSuccess.value = `Tenant "${res.data.tenant.name}" đã được tạo! Subdomain: ${res.data.tenant.slug}.chatcrm.org — Admin: ${res.data.admin.email}`;
    form.value = { name: '', slug: '', plan: 'trial', expiresAt: '', adminFullName: '', adminEmail: '', adminPassword: '' };
    await fetchTenants(); // Refresh table
  } catch (err: any) {
    createError.value = err.response?.data?.error || 'Tạo tenant thất bại';
  } finally {
    creating.value = false;
  }
}


async function suspendTenant(t: any) {
  if (!confirm(`Tạm ngưng tenant "${t.name}"?`)) return;
  try {
    await api.post(`/tenants/${t.id}/suspend`, { note: 'Suspended from admin panel' });
    await fetchTenants();
  } catch {}
}

async function activateTenant(t: any) {
  try {
    await api.post(`/tenants/${t.id}/activate`);
    await fetchTenants();
  } catch {}
}

function planColor(plan: string) {
  if (plan.includes('enterprise')) return 'purple';
  if (plan.includes('pro')) return 'info';
  if (plan.includes('basic')) return 'success';
  return 'grey';
}
function statusColor(status: string) {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'error';
  return 'warning';
}

// Detail & Edit Logic
const showDetailDialog = ref(false);
const selectedTenant = ref<any>(null);

const editPlan = ref('');
const editStatus = ref('');
const editMaxZalo = ref(0);
const editAiEnabled = ref(false);
const editExpiresAt = ref('');
const editContactName = ref('');
const editContactPhone = ref('');
const editNotes = ref('');
const saving = ref(false);
const saveMsg = ref('');
const saveMsgType = ref<'success' | 'error'>('success');

const planLimitsMap: Record<string, { maxZalo: number, aiEnabled: boolean }> = {
  trial: { maxZalo: 2, aiEnabled: false },
  basic_10: { maxZalo: 10, aiEnabled: false },
  basic_10_ai: { maxZalo: 10, aiEnabled: true },
  pro_30: { maxZalo: 30, aiEnabled: false },
  pro_30_ai: { maxZalo: 30, aiEnabled: true },
  enterprise: { maxZalo: 999, aiEnabled: false },
  enterprise_ai: { maxZalo: 999, aiEnabled: true },
};

watch(editPlan, (newPlan, oldPlan) => {
  if (oldPlan && oldPlan !== newPlan && planLimitsMap[newPlan]) {
    editMaxZalo.value = planLimitsMap[newPlan].maxZalo;
    editAiEnabled.value = planLimitsMap[newPlan].aiEnabled;
  }
});

async function openTenantDetail(id: string) {
  selectedTenant.value = null;
  showDetailDialog.value = true;
  saveMsg.value = '';
  try {
    const res = await api.get(`/tenants/${id}`);
    selectedTenant.value = res.data;
    editPlan.value = res.data.plan;
    editStatus.value = res.data.status;
    editMaxZalo.value = res.data.maxZalo;
    editAiEnabled.value = res.data.aiEnabled;
    editExpiresAt.value = res.data.expiresAt ? res.data.expiresAt.slice(0, 10) : '';
    editContactName.value = res.data.contactName || '';
    editContactPhone.value = res.data.contactPhone || '';
    editNotes.value = res.data.notes || '';
  } catch {}
}

async function saveChanges() {
  if (!selectedTenant.value) return;
  saving.value = true;
  saveMsg.value = '';
  try {
    await api.put(`/tenants/${selectedTenant.value.id}`, {
      plan: editPlan.value,
      status: editStatus.value,
      maxZalo: Number(editMaxZalo.value),
      aiEnabled: editAiEnabled.value,
      expiresAt: editExpiresAt.value || null,
      contactName: editContactName.value,
      contactPhone: editContactPhone.value,
      notes: editNotes.value,
    });
    saveMsg.value = 'Đã lưu thay đổi!';
    saveMsgType.value = 'success';
    await fetchTenants(); // Refresh main table
    // Reload selected tenant
    const res = await api.get(`/tenants/${selectedTenant.value.id}`);
    selectedTenant.value = res.data;
  } catch (err: any) {
    saveMsg.value = err.response?.data?.error || 'Lưu thất bại';
    saveMsgType.value = 'error';
  } finally {
    saving.value = false;
  }
}

function logColor(action: string) {
  if (action === 'created' || action === 'activated') return 'success';
  if (action === 'suspended' || action === 'expired') return 'error';
  if (action === 'upgraded') return 'info';
  return 'grey';
}

onMounted(async () => {
  await fetchTenants();
  
  if (route.query.open) {
    const tenantId = route.query.open as string;
    openTenantDetail(tenantId);
    // Remove query param without reloading so it doesn't reopen on refresh
    router.replace({ query: {} });
  }
});
</script>

