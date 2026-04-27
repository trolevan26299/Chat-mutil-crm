<template>
  <div>
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5 mr-4">Workflow Automation</h1>
      <v-spacer />
      <v-btn v-if="canManage" color="primary" prepend-icon="mdi-plus" @click="openCreateRule">Thêm rule</v-btn>
    </div>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="rules">Rules</v-tab>
      <v-tab value="templates">Templates</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="rules">
        <div v-if="isMobile" class="d-flex flex-column gap-3 mb-4">
          <v-card v-for="item in rules" :key="item.id" class="pa-4" elevation="0" border>
            <div class="d-flex align-center justify-space-between mb-2">
              <div class="font-weight-bold text-truncate" style="max-width: 70%">{{ item.name }}</div>
              <v-switch :model-value="item.enabled" color="primary" hide-details density="compact" :disabled="!canManage" @update:model-value="toggleRule(item, $event)" />
            </div>
            <div class="d-flex align-center gap-2 mb-2">
              <v-chip size="small" variant="tonal" color="info">{{ triggerLabel(item.trigger) }}</v-chip>
              <div class="text-caption text-grey">Đã chạy: {{ item.runCount || 0 }} lần</div>
            </div>
            <div class="text-caption text-grey mb-3">
              Gần nhất: {{ item.lastRunAt ? formatDateTime(item.lastRunAt) : 'Chưa chạy' }}
            </div>
            <div class="d-flex justify-end gap-1">
              <v-btn v-if="canManage" icon size="small" variant="tonal" color="primary" @click="openEditRule(item)"><v-icon>mdi-pencil</v-icon></v-btn>
              <v-btn v-if="canManage" icon size="small" variant="tonal" color="error" @click="deleteRule(item.id)"><v-icon>mdi-delete</v-icon></v-btn>
            </div>
          </v-card>
          <div v-if="!rules.length" class="text-center pa-6 text-grey">Chưa có automation rule nào</div>
        </div>

        <v-card v-else>
          <v-data-table :headers="ruleHeaders" :items="rules" :loading="rulesLoading" no-data-text="Chưa có automation rule nào">
            <template #item.trigger="{ item }">
              <v-chip size="small" variant="tonal">{{ triggerLabel(item.trigger) }}</v-chip>
            </template>
            <template #item.enabled="{ item }">
              <v-switch :model-value="item.enabled" color="primary" hide-details :disabled="!canManage" @update:model-value="toggleRule(item, $event)" />
            </template>
            <template #item.lastRunAt="{ item }">
              {{ item.lastRunAt ? formatDateTime(item.lastRunAt) : '—' }}
            </template>
            <template #item.actions="{ item }">
              <div v-if="canManage">
                <v-btn icon size="small" variant="text" @click="openEditRule(item)"><v-icon>mdi-pencil</v-icon></v-btn>
                <v-btn icon size="small" variant="text" color="error" @click="deleteRule(item.id)"><v-icon>mdi-delete</v-icon></v-btn>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>

      <v-window-item value="templates">
        <TemplateManager
          :templates="templates"
          :loading="templatesLoading"
          :saving="templateSaving"
          :can-manage="canManage"
          @create="createTemplate"
          @update="updateTemplate"
          @delete="deleteTemplate"
        />
      </v-window-item>
    </v-window>

    <RuleBuilder
      v-model="showRuleDialog"
      :rule="selectedRule"
      :templates="templates"
      :saving="ruleSaving"
      @save="saveRule"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import RuleBuilder from '@/components/automation/RuleBuilder.vue';
import TemplateManager from '@/components/automation/TemplateManager.vue';
import { useAutomationRules, type AutomationRule } from '@/composables/use-automation-rules';
import { useMessageTemplates } from '@/composables/use-message-templates';
import { useAuthStore } from '@/stores/auth';
import { useMobile } from '@/composables/use-mobile';

const { isMobile } = useMobile();
const authStore = useAuthStore();
const canManage = computed(() => authStore.isAdmin);
const tab = ref('rules');
const showRuleDialog = ref(false);
const selectedRule = ref<AutomationRule | null>(null);

const {
  rules,
  loading: rulesLoading,
  saving: ruleSaving,
  fetchRules,
  createRule,
  updateRule,
  deleteRule: removeRule,
} = useAutomationRules();

const {
  templates,
  loading: templatesLoading,
  saving: templateSaving,
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} = useMessageTemplates();

const ruleHeaders = [
  { title: 'Tên rule', key: 'name' },
  { title: 'Trigger', key: 'trigger' },
  { title: 'Ưu tiên', key: 'priority' },
  { title: 'Đã chạy', key: 'runCount' },
  { title: 'Lần chạy gần nhất', key: 'lastRunAt' },
  { title: 'Bật', key: 'enabled', sortable: false },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

function triggerLabel(trigger: string) {
  const labels: Record<string, string> = {
    message_received: 'Tin nhắn đến',
    contact_created: 'Contact mới',
    status_changed: 'Đổi trạng thái',
  };
  return labels[trigger] ?? trigger;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN');
}

function openCreateRule() {
  selectedRule.value = null;
  showRuleDialog.value = true;
}

function openEditRule(rule: AutomationRule) {
  selectedRule.value = rule;
  showRuleDialog.value = true;
}

async function saveRule(payload: Partial<AutomationRule>) {
  if (payload.id) {
    await updateRule(payload.id, payload);
  } else {
    await createRule(payload);
  }
  showRuleDialog.value = false;
}

async function toggleRule(rule: AutomationRule, enabled: boolean | null) {
  await updateRule(rule.id, { enabled: !!enabled });
}

async function deleteRule(id: string) {
  await removeRule(id);
}

onMounted(async () => {
  await Promise.all([fetchRules(), fetchTemplates()]);
});
</script>
