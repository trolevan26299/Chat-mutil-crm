<template>
  <div class="settings-page d-flex flex-column">
    <h1 class="text-h4 mb-4 flex-shrink-0">
      <v-icon class="mr-2" color="primary">mdi-cog-outline</v-icon>
      Cài đặt
    </h1>

    <v-tabs v-model="tab" class="mb-4 flex-shrink-0">
      <v-tab value="users">Nhân viên</v-tab>
      <v-tab value="teams">Đội nhóm</v-tab>
      <v-tab value="org">Tổ chức</v-tab>
      <v-tab v-if="authStore.aiEnabled" value="ai">
        <v-icon start>mdi-robot-outline</v-icon>
        AI
      </v-tab>
    </v-tabs>

    <v-window v-model="tab" class="flex-grow-1 d-flex flex-column overflow-hidden">
      <!-- Tab 1: User management -->
      <v-window-item value="users" class="h-100">
        <div class="users-tab-content d-flex flex-column h-100">
          <div class="d-flex align-center mb-4 flex-shrink-0">
            <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="mdi-plus" @click="openCreate">
              Thêm nhân viên
            </v-btn>
          </div>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>

        <div v-if="isMobile" class="d-flex flex-column gap-3 mb-4 flex-grow-1 overflow-y-auto pr-2">
          <v-card v-for="item in users" :key="item.id" class="pa-4" elevation="0" border>
            <div class="d-flex align-center justify-space-between mb-2">
              <div class="font-weight-bold text-truncate" style="max-width: 65%;">{{ item.fullName || 'Người dùng' }}</div>
              <v-chip :color="roleColor(item.role)" size="small" variant="flat" class="flex-shrink-0">{{ roleLabel(item.role) }}</v-chip>
            </div>
            <div class="text-caption text-grey mb-3 text-truncate">{{ item.email }}</div>
            <div class="d-flex align-center justify-space-between">
              <v-chip :color="item.isActive ? 'success' : 'default'" size="small" variant="flat">
                {{ item.isActive ? 'Hoạt động' : 'Vô hiệu' }}
              </v-chip>
              <div class="d-flex gap-2">
                <v-btn v-if="authStore.isAdmin" icon size="small" variant="tonal" color="primary" @click="openEdit(item)"><v-icon>mdi-pencil</v-icon></v-btn>
                <v-btn v-if="authStore.isAdmin" icon size="small" variant="tonal" color="warning" @click="openPassword(item)"><v-icon>mdi-lock-reset</v-icon></v-btn>
                <v-btn v-if="authStore.isOwner && item.id !== authStore.user?.id" icon size="small" variant="tonal" color="error" @click="confirmDelete(item)"><v-icon>mdi-delete</v-icon></v-btn>
              </div>
            </div>
          </v-card>
          <div v-if="!users.length" class="text-center pa-6 text-grey">Chưa có nhân viên nào</div>
        </div>

        <v-card v-else elevation="0" border class="users-card flex-grow-1 d-flex flex-column overflow-hidden">
          <v-data-table class="settings-table flex-grow-1" :headers="headers" :items="users" :loading="loading" no-data-text="Chưa có nhân viên nào" fixed-header>
            <template #item.role="{ item }">
              <v-chip :color="roleColor(item.role)" size="small" variant="flat">{{ roleLabel(item.role) }}</v-chip>
            </template>
            <template #item.isActive="{ item }">
              <v-chip :color="item.isActive ? 'success' : 'default'" size="small" variant="flat">
                {{ item.isActive ? 'Hoạt động' : 'Vô hiệu' }}
              </v-chip>
            </template>
            <template #item.actions="{ item }">
              <v-btn v-if="authStore.isAdmin" icon size="small" title="Chỉnh sửa" @click="openEdit(item)">
                <v-icon>mdi-pencil</v-icon>
              </v-btn>
              <v-btn v-if="authStore.isAdmin" icon size="small" title="Đặt lại mật khẩu" @click="openPassword(item)">
                <v-icon>mdi-lock-reset</v-icon>
              </v-btn>
              <v-btn v-if="authStore.isOwner && item.id !== authStore.user?.id" icon size="small" color="error" title="Vô hiệu hóa" @click="confirmDelete(item)">
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </template>
          </v-data-table>
        </v-card>

        <!-- Create dialog -->
        <v-dialog v-model="showCreate" max-width="440" :fullscreen="isMobile">
          <v-card>
            <v-card-title>Thêm nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên *" class="mb-2" />
              <v-text-field v-model="form.email" label="Email *" type="email" class="mb-2" />
              <v-text-field v-model="form.password" label="Mật khẩu *" type="password" class="mb-2" />
              <v-select v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showCreate = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handleCreate">Tạo</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Edit dialog -->
        <v-dialog v-model="showEdit" max-width="440" :fullscreen="isMobile">
          <v-card>
            <v-card-title>Chỉnh sửa nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên" class="mb-2" />
              <v-text-field v-model="form.email" label="Email" type="email" class="mb-2" />
              <v-select v-if="authStore.isOwner" v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showEdit = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handleUpdate">Lưu</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Reset password dialog -->
        <v-dialog v-model="showPassword" max-width="400">
          <v-card>
            <v-card-title>Đặt lại mật khẩu</v-card-title>
            <v-card-text>
              <v-text-field v-model="newPassword" label="Mật khẩu mới *" type="password" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showPassword = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handlePassword">Đặt lại</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Delete confirm dialog -->
        <v-dialog v-model="showDelete" max-width="400">
          <v-card>
            <v-card-title>Xác nhận vô hiệu hóa</v-card-title>
            <v-card-text>Bạn có chắc muốn vô hiệu hóa nhân viên "{{ selectedUser?.fullName }}"?</v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showDelete = false">Hủy</v-btn>
              <v-btn color="error" :loading="saving" @click="handleDelete">Vô hiệu hóa</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        </div>
      </v-window-item>

      <!-- Tab 2: Team management -->
      <v-window-item value="teams">
        <TeamManagement />
      </v-window-item>

      <!-- Tab 3: Organization settings -->
      <v-window-item value="org">
        <OrgSettings />
      </v-window-item>

      <!-- Tab 4: AI Settings -->
      <v-window-item value="ai">
        <v-row>
          <v-col cols="12" md="7" lg="6">
            <!-- Status card -->
            <v-card class="mb-4" elevation="0" border>
              <v-card-item>
                <template #prepend>
                  <v-icon size="32" :color="aiConfig.hasKey ? 'success' : 'warning'">mdi-robot-outline</v-icon>
                </template>
                <v-card-title>OpenRouter AI</v-card-title>
                <v-card-subtitle>
                  <v-chip
                    :color="aiConfig.hasKey ? 'success' : 'warning'"
                    size="small"
                    variant="flat"
                    class="mr-2"
                  >
                    {{ aiConfig.hasKey ? 'API Key đã cấu hình' : 'Chưa có API Key' }}
                  </v-chip>
                  <v-chip
                    :color="aiConfig.enabled ? 'primary' : 'default'"
                    size="small"
                    variant="flat"
                  >
                    {{ aiConfig.enabled ? 'Đang bật' : 'Đã tắt' }}
                  </v-chip>
                </v-card-subtitle>
              </v-card-item>

              <v-card-text>
                <v-row dense class="text-center">
                  <v-col cols="4">
                    <div class="text-h5 font-weight-bold text-primary">{{ aiUsage.usedToday }}</div>
                    <div class="text-caption text-grey">Đã dùng hôm nay</div>
                  </v-col>
                  <v-col cols="4">
                    <div class="text-h5 font-weight-bold">{{ aiUsage.maxDaily }}</div>
                    <div class="text-caption text-grey">Giới hạn / ngày</div>
                  </v-col>
                  <v-col cols="4">
                    <div class="text-h5 font-weight-bold" :class="aiUsage.remaining > 0 ? 'text-success' : 'text-error'">
                      {{ aiUsage.remaining }}
                    </div>
                    <div class="text-caption text-grey">Còn lại</div>
                  </v-col>
                </v-row>

                <v-progress-linear
                  class="mt-3"
                  :model-value="aiUsage.maxDaily > 0 ? (aiUsage.usedToday / aiUsage.maxDaily) * 100 : 0"
                  color="primary"
                  bg-color="grey-lighten-3"
                  rounded
                  height="6"
                />

                <v-divider class="my-4"></v-divider>
                
                <v-row dense class="text-center mb-4">
                  <v-col cols="6">
                    <div class="text-h6 text-success">${{ Number(aiUsage.costDaily || 0).toFixed(4) }}</div>
                    <div class="text-caption text-grey">Chi phí hôm nay</div>
                  </v-col>
                  <v-col cols="6">
                    <div class="text-h6 text-primary">${{ Number(aiUsage.costMonthly || 0).toFixed(4) }}</div>
                    <div class="text-caption text-grey">Chi phí tháng này</div>
                  </v-col>
                </v-row>

                <div class="text-caption text-grey mb-2">Tần suất dùng AI (7 ngày qua)</div>
                <div style="height: 180px; width: 100%;">
                  <Bar v-if="aiChartData" :data="aiChartData" :options="aiChartOptions" />
                </div>
              </v-card-text>
            </v-card>

            <!-- Config form -->
            <v-card elevation="0" border>
              <v-card-title class="text-body-1 font-weight-bold pa-4 pb-0">Cấu hình AI</v-card-title>
              <v-card-text class="pa-4">
                <!-- Enable toggle -->
                <div class="d-flex align-center justify-space-between mb-4 pa-3 rounded" style="background: rgba(var(--v-theme-surface-variant), 0.4)">
                  <div>
                    <div class="text-body-2 font-weight-medium">Bật / Tắt AI</div>
                    <div class="text-caption text-grey">Tắt để ngưng toàn bộ tính năng AI</div>
                  </div>
                  <v-switch
                    v-model="aiForm.enabled"
                    color="primary"
                    hide-details
                    density="compact"
                  />
                </div>

                <!-- Model picker -->
                <v-select
                  v-model="aiForm.model"
                  :items="groupedModels"
                  item-title="title"
                  item-value="value"
                  label="Model AI"
                  prepend-inner-icon="mdi-brain"
                  variant="outlined"
                  density="comfortable"
                  class="mb-3"
                >
                  <template #item="{ item, props: itemProps }">
                    <v-list-item v-bind="itemProps">
                      <template #prepend>
                        <v-chip size="x-small" :color="groupColor((item as any).raw?.group)" variant="flat" class="mr-2">
                          {{ (item as any).raw?.group }}
                        </v-chip>
                      </template>
                    </v-list-item>
                  </template>
                  <template #selection>
                    <template v-if="currentModelMeta">
                      <v-chip size="small" :color="groupColor(currentModelMeta.group)" variant="flat" class="mr-2">
                        {{ currentModelMeta.group }}
                      </v-chip>
                      {{ currentModelMeta.title }}
                    </template>
                    <span v-else class="text-grey">{{ aiForm.model }}</span>
                  </template>
                </v-select>

                <!-- Daily limit -->
                <v-text-field
                  v-model.number="aiForm.maxDaily"
                  label="Giới hạn dùng / ngày"
                  type="number"
                  :min="1"
                  :max="10000"
                  prepend-inner-icon="mdi-counter"
                  variant="outlined"
                  density="comfortable"
                  hint="Số lần gọi AI tối đa trong 1 ngày"
                  persistent-hint
                  class="mb-4"
                />

                <v-alert v-if="aiSaveError" type="error" density="compact" variant="tonal" class="mb-3">
                  {{ aiSaveError }}
                </v-alert>
                <v-alert v-if="aiSaveSuccess" type="success" density="compact" variant="tonal" class="mb-3">
                  Đã lưu cấu hình AI!
                </v-alert>
              </v-card-text>

              <v-card-actions class="pa-4 pt-0">
                <v-spacer />
                <v-btn
                  color="primary"
                  variant="flat"
                  :loading="aiSaving"
                  prepend-icon="mdi-content-save-outline"
                  @click="handleSaveAi"
                >
                  Lưu cấu hình
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>

          <!-- Right: info panel -->
          <v-col cols="12" md="5" lg="6">
            <v-card elevation="0" border>
              <v-card-title class="text-body-1 font-weight-bold pa-4 pb-2">Về OpenRouter</v-card-title>
              <v-card-text class="pa-4">
                <p class="text-body-2 mb-3">
                  <strong>OpenRouter</strong> là cổng API thống nhất giúp truy cập hàng trăm model AI
                  (Claude, GPT, Gemini, Llama...) chỉ với một API key duy nhất.
                </p>
                <v-divider class="mb-3" />
                <div class="text-caption text-grey mb-1">Model đang chọn</div>
                <v-chip color="primary" variant="flat" size="small" class="mb-3">
                  {{ aiForm.model || aiConfig.model }}
                </v-chip>
                <v-divider class="mb-3" />
                <div class="text-caption text-grey mb-2">Model khả dụng ({{ (aiConfig.availableModels || []).length }})</div>
                <div class="d-flex flex-wrap gap-1">
                  <v-chip
                    v-for="m in (aiConfig.availableModels || [])"
                    :key="m.value"
                    size="x-small"
                    :color="groupColor(m.group)"
                    variant="tonal"
                    :class="{ 'opacity-100': aiForm.model === m.value, 'opacity-50': aiForm.model !== m.value }"
                    style="cursor: pointer"
                    @click="aiForm.model = m.value"
                  >
                    {{ m.title }}
                  </v-chip>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useUsers, type OrgUser } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import { useMobile } from '@/composables/use-mobile';
import { useChat } from '@/composables/use-chat';
import TeamManagement from '@/components/settings/TeamManagement.vue';
import OrgSettings from '@/components/settings/OrgSettings.vue';

import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, deleteUser } = useUsers();
const authStore = useAuthStore();
const { isMobile } = useMobile();
const { aiConfig, aiUsage, fetchAiConfig, saveAiConfig, fetchAiUsage } = useChat();

const tab = ref('users');
const showCreate = ref(false);
const showEdit = ref(false);
const showPassword = ref(false);
const showDelete = ref(false);
const saving = ref(false);
const dialogError = ref('');
const newPassword = ref('');
const selectedUser = ref<OrgUser | null>(null);

const form = ref({ fullName: '', email: '', password: '', role: 'member' });

const roleOptions = [
  { label: 'Nhân viên', value: 'member' },
  { label: 'Quản trị viên', value: 'admin' },
];

const headers = [
  { title: 'Họ tên', key: 'fullName', sortable: true },
  { title: 'Email', key: 'email' },
  { title: 'Vai trò', key: 'role', sortable: true },
  { title: 'Trạng thái', key: 'isActive', sortable: true },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

function roleColor(role: string) {
  if (role === 'owner') return 'primary';
  if (role === 'admin') return 'info';
  return 'default';
}

function roleLabel(role: string) {
  if (role === 'owner') return 'Chủ sở hữu';
  if (role === 'admin') return 'Quản trị viên';
  return 'Nhân viên';
}

function openCreate() {
  form.value = { fullName: '', email: '', password: '', role: 'member' };
  dialogError.value = '';
  showCreate.value = true;
}

function openEdit(user: OrgUser) {
  selectedUser.value = user;
  form.value = { fullName: user.fullName, email: user.email, password: '', role: user.role };
  dialogError.value = '';
  showEdit.value = true;
}

function openPassword(user: OrgUser) {
  selectedUser.value = user;
  newPassword.value = '';
  dialogError.value = '';
  showPassword.value = true;
}

function confirmDelete(user: OrgUser) {
  selectedUser.value = user;
  showDelete.value = true;
}

async function handleCreate() {
  saving.value = true;
  dialogError.value = '';
  const res = await createUser(form.value);
  saving.value = false;
  if (res.ok) { showCreate.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleUpdate() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await updateUser(selectedUser.value.id, { fullName: form.value.fullName, email: form.value.email, role: form.value.role });
  saving.value = false;
  if (res.ok) { showEdit.value = false; } else { dialogError.value = res.error || ''; }
}

async function handlePassword() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await resetPassword(selectedUser.value.id, newPassword.value);
  saving.value = false;
  if (res.ok) { showPassword.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleDelete() {
  if (!selectedUser.value) return;
  saving.value = true;
  const res = await deleteUser(selectedUser.value.id);
  saving.value = false;
  if (res.ok) { showDelete.value = false; }
}

// ---- AI tab state ----
const aiForm = ref({ model: 'google/gemini-2.0-flash-001', maxDaily: 500, enabled: true });
const aiSaving = ref(false);
const aiSaveError = ref('');
const aiSaveSuccess = ref(false);

const GROUP_COLORS: Record<string, string> = {
  Anthropic: 'deep-orange',
  Google: 'blue',
  OpenAI: 'green',
  Meta: 'purple',
  DeepSeek: 'indigo',
  Qwen: 'cyan',
  Mistral: 'teal',
};

function groupColor(group: string): string {
  return GROUP_COLORS[group] || 'grey';
}

const groupedModels = computed(() => {
  const models = aiConfig.value.availableModels || [];
  return models.map(m => ({ ...m, title: m.title, value: m.value }));
});

// Find the currently selected model's metadata for the selection slot
const currentModelMeta = computed(() =>
  groupedModels.value.find(m => m.value === aiForm.value.model) || null,
);

const aiChartData = computed(() => {
  const dataArray = aiUsage.value.chartData || [0, 0, 0, 0, 0, 0, 0];
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
  }
  return {
    labels,
    datasets: [{
      label: 'Lần dùng',
      data: dataArray,
      backgroundColor: '#1565C0',
      borderRadius: 4,
    }],
  };
});

const aiChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, ticks: { stepSize: 1 } },
  },
};

async function handleSaveAi() {
  aiSaving.value = true;
  aiSaveError.value = '';
  aiSaveSuccess.value = false;
  try {
    await saveAiConfig({ model: aiForm.value.model, maxDaily: aiForm.value.maxDaily, enabled: aiForm.value.enabled });
    aiSaveSuccess.value = true;
    setTimeout(() => { aiSaveSuccess.value = false; }, 3000);
  } catch (err: any) {
    aiSaveError.value = err?.response?.data?.error || 'Lỗi khi lưu cấu hình AI';
  } finally {
    aiSaving.value = false;
  }
}

// Sync form when config loads
watch(aiConfig, (cfg) => {
  aiForm.value.model = cfg.model;
  aiForm.value.maxDaily = cfg.maxDaily;
  aiForm.value.enabled = cfg.enabled;
}, { immediate: true });

// Load AI config+usage when AI tab opens
watch(tab, async (val) => {
  if (val === 'ai') {
    await Promise.all([fetchAiConfig(), fetchAiUsage()]);
  }
});

onMounted(fetchUsers);
</script>

<style scoped>
.settings-page {
  height: calc(100vh - 64px - 32px); /* 64px appbar + 32px container padding */
  overflow: hidden;
}

:deep(.v-window) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.v-window__container) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.v-window-item) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto; /* Cho phép các tab khác scroll bình thường */
}

/* Riêng tab Users sẽ flex để table fill full */
.users-tab-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.users-card {
  overflow: hidden;
}

:deep(.settings-table .v-table__wrapper) {
  flex: 1 1 auto;
  overflow-y: auto;
}

:deep(.settings-table) {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
