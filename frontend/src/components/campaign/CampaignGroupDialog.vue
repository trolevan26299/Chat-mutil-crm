<template>
  <v-dialog v-model="model" :max-width="isMobile ? 'calc(100vw - 32px)' : 700" scrollable>
    <v-card rounded="xl">
      <!-- Header -->
      <v-card-title class="d-flex align-center gap-3" :class="isMobile ? 'pa-4 pb-3 text-subtitle-1 font-weight-bold' : 'pa-5 pb-4 text-h6'">
        <v-icon :color="isEdit ? 'primary' : 'success'" :size="isMobile ? 20 : 22">
          {{ isEdit ? 'mdi-pencil' : 'mdi-plus' }}
        </v-icon>
        {{ isEdit ? 'Chỉnh sửa nhóm' : 'Tạo nhóm khách hàng mới' }}
      </v-card-title>
      <v-divider />

      <v-card-text :class="isMobile ? 'pa-4' : 'pa-5'">
        <!-- Name + Description -->
        <v-text-field
          v-model="form.name"
          label="Tên nhóm *"
          placeholder="VD: Chiến dịch sale chữ ký số"
          variant="outlined"
          density="comfortable"
          :rules="[v => !!v || 'Vui lòng nhập tên nhóm']"
          class="mb-3"
        />
        <v-text-field
          v-model="form.description"
          label="Mô tả (tuỳ chọn)"
          placeholder="VD: Khách hàng quan tâm sản phẩm chữ ký số..."
          variant="outlined"
          density="comfortable"
          class="mb-4"
        />

        <!-- Mode selector -->
        <div class="text-subtitle-2 font-weight-semibold mb-3">Chọn đối tượng khách hàng</div>
        <v-row class="mb-4" no-gutters>
          <v-col v-for="m in modes" :key="m.value" cols="12" sm="4" class="pa-1">
            <div
              class="mode-card pa-4 rounded-xl cursor-pointer"
              :class="{ 'mode-card--active': form.mode === m.value }"
              @click="form.mode = m.value"
            >
              <v-icon :color="form.mode === m.value ? m.color : 'grey'" size="24" class="mb-2">{{ m.icon }}</v-icon>
              <div class="text-subtitle-2 font-weight-semibold">{{ m.label }}</div>
            </div>
          </v-col>
        </v-row>

        <!-- Mode-specific content -->

        <!-- ALL: nothing more needed -->
        <v-alert v-if="form.mode === 'all'" type="success" variant="tonal" rounded="lg" density="compact">
          <template #prepend><v-icon>mdi-earth</v-icon></template>
          Sẽ gửi tới <strong>tất cả {{ props.orgContacts.length }} khách hàng</strong> trong hệ thống.
        </v-alert>

        <!-- EXCLUDE mode -->
        <div v-else-if="form.mode === 'exclude'">
          <p class="text-caption text-medium-emphasis mb-3">
            Gửi tới tất cả, <strong>loại trừ</strong> các khách hàng sau:
          </p>
          <v-text-field
            v-model="contactSearch"
            placeholder="Tìm kiếm khách hàng..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            clearable
            hide-details
            class="mb-3"
          />
          <v-alert type="info" variant="tonal" density="compact" class="mb-3" rounded="lg">
            Sẽ gửi tới <strong>{{ totalExcluded }} khách hàng</strong>
            ({{ props.orgContacts.length }} tổng - {{ form.contactIds.length }} loại trừ)
          </v-alert>
          <div style="max-height: 260px; overflow-y: auto;" class="contact-list rounded-lg border">
            <v-list density="compact">
              <v-list-item
                v-for="c in filteredContacts"
                :key="c.id"
                class="px-3"
                :class="{ 'excluded-item': form.contactIds.includes(c.id) }"
              >
                <template #prepend>
                  <v-checkbox-btn
                    :model-value="form.contactIds.includes(c.id)"
                    @update:model-value="toggleContact(c.id)"
                    color="error"
                  />
                  <v-avatar size="28" color="primary" variant="tonal" class="mr-2">
                    <v-img v-if="c.avatarUrl" :src="c.avatarUrl" />
                    <v-icon v-else size="16">mdi-account</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title class="text-body-2">{{ c.fullName || c.phone }}</v-list-item-title>
                <v-list-item-subtitle class="text-caption">{{ c.phone }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </div>
        </div>

        <!-- MANUAL mode -->
        <div v-else-if="form.mode === 'manual'">
          <p class="text-caption text-medium-emphasis mb-3">
            Chọn thủ công từng khách hàng (<strong>{{ form.contactIds.length }}</strong> đã chọn):
          </p>
          <v-text-field
            v-model="contactSearch"
            placeholder="Tìm kiếm khách hàng..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            clearable
            hide-details
            class="mb-2"
          />
          <div class="d-flex gap-2 mb-3">
            <v-btn size="x-small" variant="tonal" @click="selectAll">Chọn tất cả</v-btn>
            <v-btn size="x-small" variant="tonal" @click="clearAll">Bỏ chọn</v-btn>
            <v-chip v-if="form.contactIds.length" size="x-small" color="primary">
              {{ form.contactIds.length }} / {{ props.orgContacts.length }}
            </v-chip>
          </div>
          <div style="max-height: 280px; overflow-y: auto;" class="contact-list rounded-lg border">
            <v-list density="compact">
              <v-list-item v-for="c in filteredContacts" :key="c.id" class="px-3"
                :class="{ 'selected-item': form.contactIds.includes(c.id) }">
                <template #prepend>
                  <v-checkbox-btn
                    :model-value="form.contactIds.includes(c.id)"
                    @update:model-value="toggleContact(c.id)"
                    color="primary"
                  />
                  <v-avatar size="28" color="primary" variant="tonal" class="mr-2">
                    <v-img v-if="c.avatarUrl" :src="c.avatarUrl" />
                    <v-icon v-else size="16">mdi-account</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title class="text-body-2">{{ c.fullName || c.phone }}</v-list-item-title>
                <v-list-item-subtitle class="text-caption">{{ c.phone }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item v-if="filteredContacts.length === 0">
                <v-list-item-title class="text-caption text-medium-emphasis text-center py-4">Không tìm thấy kết quả</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions :class="isMobile ? 'pa-3' : 'pa-4'">
        <v-btn variant="text" @click="model = false">Huỷ</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" :loading="saving" @click="save" :disabled="!form.name">
          {{ isEdit ? 'Lưu thay đổi' : 'Tạo nhóm' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { api } from '@/api/index';

const props = defineProps<{
  modelValue: boolean;
  group?: any;
  orgContacts: any[];
  loadingContacts?: boolean;
}>();
const emit = defineEmits(['update:modelValue', 'saved']);

const { mobile } = useDisplay();
const isMobile = computed(() => mobile.value);
const model = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) });
const isEdit = computed(() => !!props.group?.id);

const saving = ref(false);
const contactSearch = ref('');

const form = reactive({
  name: '',
  description: '',
  mode: 'manual' as string,
  contactIds: [] as string[],
});

const modes = [
  { value: 'all', label: 'Tất cả', icon: 'mdi-earth', color: 'success', desc: 'Gửi tới tất cả khách hàng' },
  { value: 'exclude', label: 'Loại trừ', icon: 'mdi-account-minus', color: 'warning', desc: 'Tất cả, trừ một số nhóm' },
  { value: 'manual', label: 'Chọn tay', icon: 'mdi-account-check', color: 'primary', desc: 'Chọn từng khách hàng' },
];

const filteredContacts = computed(() => {
  const q = contactSearch.value?.toLowerCase() || '';
  if (!q) return props.orgContacts;
  return props.orgContacts.filter(c =>
    (c.fullName || '').toLowerCase().includes(q) ||
    (c.phone || '').includes(q)
  );
});

const totalExcluded = computed(() =>
  Math.max(0, props.orgContacts.length - form.contactIds.length)
);

watch(() => props.modelValue, open => {
  if (open) {
    form.name = props.group?.name || '';
    form.description = props.group?.description || '';
    form.mode = props.group?.mode || 'manual';
    form.contactIds = Array.isArray(props.group?.contactIds) ? [...props.group.contactIds] : [];
    contactSearch.value = '';
  }
});

function toggleContact(id: string) {
  const idx = form.contactIds.indexOf(id);
  if (idx === -1) form.contactIds.push(id);
  else form.contactIds.splice(idx, 1);
}

function selectAll() {
  form.contactIds = filteredContacts.value.map(c => c.id);
}

function clearAll() {
  form.contactIds = [];
}

async function save() {
  if (!form.name) return;
  saving.value = true;
  try {
    const payload = {
      name: form.name,
      description: form.description,
      mode: form.mode,
      contactIds: form.contactIds,
    };
    if (isEdit.value) {
      await api.put(`/campaign-groups/${props.group.id}`, payload);
    } else {
      await api.post('/campaign-groups', payload);
    }
    emit('saved');
    model.value = false;
  } catch { /* ignore */ } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.mode-card {
  border: 2px solid transparent;
  background: rgba(var(--v-theme-on-surface), 0.05);
  transition: all 0.15s ease;
  cursor: pointer;
  min-height: 100px;
}
.mode-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
}
.mode-card--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.contact-list {
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

.excluded-item {
  background: rgba(var(--v-theme-error), 0.05);
}
.selected-item {
  background: rgba(var(--v-theme-primary), 0.05);
}
.cursor-pointer { cursor: pointer; }
</style>
