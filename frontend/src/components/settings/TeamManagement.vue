<template>
  <div>
    <div class="d-flex align-center mb-4">
      <span class="text-h6">Danh sách đội nhóm</span>
      <v-spacer />
      <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="mdi-plus" @click="openCreate">
        Thêm đội nhóm
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
      {{ error }}
    </v-alert>
    <v-progress-linear v-if="loading" indeterminate color="cyan" class="mb-2" />
    <div v-if="teams.length === 0 && !loading" class="text-center py-8 text-medium-emphasis">
      Chưa có đội nhóm nào
    </div>

    <v-expansion-panels v-model="expandedPanel" variant="accordion">
      <v-expansion-panel v-for="team in teams" :key="team.id" @click="onPanelClick(team.id)">
        <v-expansion-panel-title>
          <div class="d-flex align-center w-100">
            <v-icon class="mr-2" color="cyan">mdi-account-group</v-icon>
            <div>
              <span class="font-weight-medium">{{ team.name }}</span>
              <div v-if="team.description" class="text-caption text-medium-emphasis">{{ team.description }}</div>
            </div>
            <v-chip size="x-small" class="ml-3" variant="tonal" color="cyan">
              {{ memberMap[team.id]?.length ?? 0 }} thành viên
            </v-chip>
            <v-chip size="x-small" class="ml-1" variant="tonal" color="purple">
              {{ knowledgeMap[team.id]?.length ?? 0 }} tài liệu
            </v-chip>
            <v-spacer />
            <template v-if="authStore.isAdmin">
              <v-btn icon size="x-small" variant="text" class="mr-1" @click.stop="openEdit(team)">
                <v-icon>mdi-pencil</v-icon>
              </v-btn>
              <v-btn icon size="x-small" variant="text" color="error" @click.stop="openDelete(team)">
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </template>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <v-tabs v-model="activeTab[team.id]" density="compact" class="mb-3">
            <v-tab value="members" prepend-icon="mdi-account-multiple">Thành viên</v-tab>
            <v-tab value="knowledge" prepend-icon="mdi-brain">Kiến thức AI</v-tab>
          </v-tabs>

          <!-- ── Members Tab ── -->
          <div v-if="activeTab[team.id] === 'members' || !activeTab[team.id]">
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-chip
                v-for="m in memberMap[team.id] ?? []"
                :key="m.userId"
                closable
                :close-label="'Xóa ' + m.fullName"
                @click:close="authStore.isAdmin && handleRemoveMember(team.id, m.userId)"
              >
                <v-avatar start><v-icon>mdi-account</v-icon></v-avatar>
                <span>{{ m.fullName }}</span>
                <v-chip size="x-small" class="ml-2" :color="m.role === 'lead' ? 'amber' : 'default'" variant="flat">
                  {{ m.role === 'lead' ? 'Trưởng nhóm' : 'Nhân viên' }}
                </v-chip>
              </v-chip>
              <span v-if="!memberMap[team.id]?.length" class="text-medium-emphasis text-body-2">
                Chưa có thành viên
              </span>
            </div>
            <v-btn v-if="authStore.isAdmin" size="small" variant="tonal" prepend-icon="mdi-account-plus" @click="openAddMember(team)">
              Thêm thành viên
            </v-btn>
          </div>

          <!-- ── Knowledge Tab ── -->
          <div v-if="activeTab[team.id] === 'knowledge'">
            <div class="mb-3">
              <v-progress-linear v-if="knowledgeLoading[team.id]" indeterminate color="purple" class="mb-2" />

              <!-- Knowledge list -->
              <v-list v-if="knowledgeMap[team.id]?.length" density="compact" class="mb-2 rounded border">
                <v-list-item
                  v-for="doc in knowledgeMap[team.id]"
                  :key="doc.id"
                  :subtitle="doc.sourceType === 'url' ? doc.sourceUrl : (doc.chunkCount + ' đoạn văn bản đã học')"
                >
                  <template #prepend>
                    <v-icon :color="sourceTypeColor(doc.sourceType)" size="20">
                      {{ sourceTypeIcon(doc.sourceType) }}
                    </v-icon>
                  </template>
                  <template #title>
                    <span class="text-body-2 font-weight-medium">{{ doc.title }}</span>
                  </template>
                  <template #append>
                    <v-chip
                      :color="statusColor(doc.status)"
                      size="x-small"
                      variant="flat"
                      class="mr-1"
                    >
                      <v-progress-circular v-if="doc.status === 'indexing'" indeterminate size="10" class="mr-1" />
                      {{ statusLabel(doc.status) }}
                    </v-chip>
                    <!-- Reindex if indexed but 0 chunks -->
                    <v-btn
                      v-if="authStore.isAdmin && doc.status === 'indexed' && doc.chunkCount === 0"
                      icon size="x-small"
                      variant="text"
                      color="warning"
                      title="0 đoạn — Thử học lại"
                      @click="handleReindex(team.id, doc.id)"
                    >
                      <v-icon>mdi-refresh</v-icon>
                    </v-btn>
                    <!-- Reindex if failed -->
                    <v-btn
                      v-if="authStore.isAdmin && doc.status === 'failed'"
                      icon size="x-small"
                      variant="text"
                      color="warning"
                      title="Thử lại"
                      @click="handleReindex(team.id, doc.id)"
                    >
                      <v-icon>mdi-refresh</v-icon>
                    </v-btn>
                    <!-- View content -->
                    <v-btn
                      icon size="x-small"
                      variant="text"
                      color="cyan"
                      title="Xem nội dung"
                      @click="openPreview(doc)"
                    >
                      <v-icon>mdi-eye</v-icon>
                    </v-btn>
                    <v-btn
                      v-if="authStore.isAdmin"
                      icon size="x-small"
                      variant="text"
                      color="error"
                      title="Xóa tài liệu"
                      @click="handleDeleteKnowledge(team.id, doc.id)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                </v-list-item>
              </v-list>

              <div v-else-if="!knowledgeLoading[team.id]" class="text-caption text-medium-emphasis mb-2">
                Chưa có tài liệu nào. Thêm tài liệu để AI học ngành nghề của đội nhóm.
              </div>
            </div>

            <v-btn v-if="authStore.isAdmin" size="small" color="purple" variant="tonal" prepend-icon="mdi-plus" @click="openAddKnowledge(team)">
              Thêm tài liệu
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- ── Create Team Dialog ── -->
    <v-dialog v-model="showCreate" max-width="440" :fullscreen="isMobile">
      <v-card>
        <v-card-title class="pa-4 pb-2">Thêm đội nhóm</v-card-title>
        <v-card-text class="pa-4 pt-2">
          <v-text-field v-model="teamForm.name" label="Tên đội nhóm *" autofocus class="mb-2" @keyup.enter="handleCreate" />
          <v-textarea v-model="teamForm.description" label="Mô tả ngành nghề" rows="2" hint="VD: Đội sale máy đếm tiền, chuyên tư vấn giá cả..." />
          <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="showCreate = false">Hủy</v-btn>
          <v-btn color="primary" :loading="saving" @click="handleCreate">Tạo</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Edit Team Dialog ── -->
    <v-dialog v-model="showEdit" max-width="440" :fullscreen="isMobile">
      <v-card>
        <v-card-title class="pa-4 pb-2">Sửa đội nhóm</v-card-title>
        <v-card-text class="pa-4 pt-2">
          <v-text-field v-model="teamForm.name" label="Tên đội nhóm *" autofocus class="mb-2" />
          <v-textarea v-model="teamForm.description" label="Mô tả ngành nghề" rows="2" />
          <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="showEdit = false">Hủy</v-btn>
          <v-btn color="primary" :loading="saving" @click="handleUpdate">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Delete Confirm Dialog ── -->
    <v-dialog v-model="showDelete" max-width="380">
      <v-card>
        <v-card-title>Xác nhận xóa</v-card-title>
        <v-card-text>Bạn có chắc muốn xóa đội nhóm "<strong>{{ selectedTeam?.name }}</strong>"?<br/>Tất cả tài liệu AI của đội nhóm cũng sẽ bị xóa.</v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="showDelete = false">Hủy</v-btn>
          <v-btn color="error" :loading="saving" @click="handleDelete">Xóa</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Add Member Dialog ── -->
    <v-dialog v-model="showAddMember" max-width="440" :fullscreen="isMobile">
      <v-card>
        <v-card-title class="pa-4 pb-2">Thêm thành viên</v-card-title>
        <v-card-text class="pa-4 pt-2">
          <v-select
            v-model="selectedUserId"
            :items="availableUsers"
            item-title="fullName"
            item-value="id"
            label="Chọn nhân viên"
            no-data-text="Không có nhân viên để thêm"
            class="mb-2"
          />
          <v-select
            v-model="selectedMemberRole"
            :items="[{ title: 'Nhân viên', value: 'member' }, { title: 'Trưởng nhóm', value: 'lead' }]"
            item-title="title"
            item-value="value"
            label="Vai trò"
          />
          <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="showAddMember = false">Hủy</v-btn>
          <v-btn color="primary" :loading="saving" @click="handleAddMember">Thêm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Add Knowledge Dialog ── -->
    <v-dialog v-model="showAddKnowledge" max-width="600" :fullscreen="isMobile">
      <v-card>
        <v-card-title class="pa-4 pb-0">
          <v-icon color="purple" class="mr-2">mdi-brain</v-icon>
          Thêm tài liệu AI cho "{{ selectedTeam?.name }}"
        </v-card-title>
        <v-card-text class="pa-4">
          <v-text-field v-model="kForm.title" label="Tiêu đề tài liệu *" class="mb-3" />

          <v-tabs v-model="kForm.type" class="mb-4" density="compact">
            <v-tab value="text" prepend-icon="mdi-text">Văn bản</v-tab>
            <v-tab value="url" prepend-icon="mdi-web">Website URL</v-tab>
            <v-tab value="file" prepend-icon="mdi-file-pdf-box">File PDF</v-tab>
          </v-tabs>

          <!-- Text input -->
          <v-textarea
            v-if="kForm.type === 'text'"
            v-model="kForm.content"
            label="Nội dung tài liệu *"
            rows="8"
            hint="Nhập nội dung: bảng giá, quy trình, thông tin sản phẩm..."
            auto-grow
          />

          <!-- URL input -->
          <div v-if="kForm.type === 'url'">
            <v-text-field
              v-model="kForm.sourceUrl"
              label="Địa chỉ website *"
              placeholder="https://example.com/bang-gia"
              prepend-inner-icon="mdi-web"
              hint="Hệ thống sẽ tự động đọc nội dung từ trang web này và các trang con bên trong"
            />
            
            <v-radio-group v-model="kForm.crawlLimit" inline class="mt-2" density="compact" label="Mức độ quét trang con:">
              <v-radio label="Giới hạn (Tối đa 50 trang)" :value="50"></v-radio>
              <v-radio label="Toàn bộ website" value="all"></v-radio>
            </v-radio-group>
            
            <v-alert
              v-if="kForm.crawlLimit === 'all'"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-1 mb-2 text-caption"
            >
              Cảnh báo: Việc quét toàn bộ website có thể mất nhiều thời gian và làm giảm hiệu năng hệ thống nếu trang web có hàng nghìn bài viết.
            </v-alert>
          </div>

          <!-- File upload -->
          <div v-if="kForm.type === 'file'">
            <v-file-input
              v-model="kForm.file"
              label="Chọn file PDF *"
              accept=".pdf"
              prepend-inner-icon="mdi-file-pdf-box"
              prepend-icon=""
              hint="Tối đa 20MB. Hỗ trợ file PDF"
              show-size
            />
          </div>

          <v-alert v-if="kDialogError" type="error" density="compact" class="mt-3">{{ kDialogError }}</v-alert>
          <v-alert type="info" variant="tonal" density="compact" class="mt-3">
            <template #prepend><v-icon>mdi-information</v-icon></template>
            Sau khi thêm, hệ thống sẽ <strong>tự động xử lý và học</strong> nội dung tài liệu. Quá trình này có thể mất vài giây.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="showAddKnowledge = false">Hủy</v-btn>
          <v-btn color="purple" :loading="kSaving" @click="handleAddKnowledge">
            <v-icon start>mdi-brain</v-icon>Thêm & Học
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Preview Knowledge Dialog ── -->
    <v-dialog v-model="showPreview" max-width="800" :fullscreen="isMobile" scrollable>
      <v-card>
        <v-card-title class="pa-4 pb-2 d-flex align-center">
          <v-icon color="cyan" class="mr-2">mdi-file-document-outline</v-icon>
          <span class="text-truncate">{{ previewTitle }}</span>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="showPreview = false"></v-btn>
        </v-card-title>
        <v-divider></v-divider>
        <v-card-text class="pa-4 bg-grey-lighten-4">
          <v-progress-linear v-if="previewLoading" indeterminate color="cyan" class="mb-2" />
          <pre v-else class="text-body-2" style="white-space: pre-wrap; font-family: inherit;">{{ previewContent || 'Không có nội dung' }}</pre>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showPreview = false">Đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, onBeforeUnmount } from 'vue';
import { useTeams, type Team, type TeamMember, type TeamKnowledge } from '@/composables/use-teams';
import { useUsers } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import { useMobile } from '@/composables/use-mobile';

const { isMobile } = useMobile();
const {
  teams, loading, error,
  fetchTeams, createTeam, updateTeam, deleteTeam,
  fetchMembers, addMember, removeMember,
  fetchKnowledge, fetchKnowledgeContent, addKnowledgeText, addKnowledgeUrl, uploadKnowledgeFile,
  deleteKnowledge, reindexKnowledge,
} = useTeams();
const { users, fetchUsers } = useUsers();
const authStore = useAuthStore();

// ── State ──────────────────────────────────────────────────────────────────

const expandedPanel = ref<number | null>(null);
const activeTab = ref<Record<string, string>>({});
const memberMap = ref<Record<string, TeamMember[]>>({});
const knowledgeMap = ref<Record<string, TeamKnowledge[]>>({});
const knowledgeLoading = ref<Record<string, boolean>>({});

// Team dialogs
const showCreate = ref(false);
const showEdit = ref(false);
const showDelete = ref(false);
const saving = ref(false);
const dialogError = ref('');
const selectedTeam = ref<Team | null>(null);
const teamForm = reactive({ name: '', description: '' });

// Member dialog
const showAddMember = ref(false);
const selectedUserId = ref('');
const selectedMemberRole = ref('member');

// Knowledge dialog
const showAddKnowledge = ref(false);
const kSaving = ref(false);
const kDialogError = ref('');
const kForm = reactive({
  title: '',
  type: 'text' as 'text' | 'url' | 'file',
  content: '',
  sourceUrl: '',
  crawlLimit: 50 as number | 'all',
  file: null as File[] | null,
});

// Preview Knowledge Dialog
const showPreview = ref(false);
const previewTitle = ref('');
const previewContent = ref('');
const previewLoading = ref(false);

// ── Computed ───────────────────────────────────────────────────────────────

const availableUsers = computed(() => {
  if (!selectedTeam.value) return users.value;
  const memberIds = new Set((memberMap.value[selectedTeam.value.id] ?? []).map(m => m.userId));
  return users.value.filter(u => !memberIds.has(u.id));
});

// ── Helpers ────────────────────────────────────────────────────────────────

function sourceTypeIcon(type: string) {
  return type === 'url' ? 'mdi-web' : type === 'file' ? 'mdi-file-pdf-box' : 'mdi-text';
}
function sourceTypeColor(type: string) {
  return type === 'url' ? 'blue' : type === 'file' ? 'red' : 'green';
}
function statusColor(status: string) {
  return { pending: 'warning', indexing: 'blue', indexed: 'success', failed: 'error' }[status] ?? 'default';
}
function statusLabel(status: string) {
  return { pending: 'Chờ xử lý', indexing: 'Đang học...', indexed: 'Đã sẵn sàng', failed: 'Lỗi' }[status] ?? status;
}

// ── Data loading ───────────────────────────────────────────────────────────

async function onPanelClick(teamId: string) {
  if (!memberMap.value[teamId]) {
    memberMap.value[teamId] = await fetchMembers(teamId);
  }
  if (!knowledgeMap.value[teamId]) {
    knowledgeLoading.value[teamId] = true;
    knowledgeMap.value[teamId] = await fetchKnowledge(teamId);
    knowledgeLoading.value[teamId] = false;
  }
}

async function refreshKnowledge(teamId: string) {
  knowledgeLoading.value[teamId] = true;
  knowledgeMap.value[teamId] = await fetchKnowledge(teamId);
  knowledgeLoading.value[teamId] = false;
}

// ── Team CRUD ──────────────────────────────────────────────────────────────

function openCreate() {
  teamForm.name = '';
  teamForm.description = '';
  dialogError.value = '';
  showCreate.value = true;
}

function openEdit(team: Team) {
  selectedTeam.value = team;
  teamForm.name = team.name;
  teamForm.description = team.description || '';
  dialogError.value = '';
  showEdit.value = true;
}

function openDelete(team: Team) {
  selectedTeam.value = team;
  showDelete.value = true;
}

async function handleCreate() {
  if (!teamForm.name.trim()) return;
  saving.value = true;
  dialogError.value = '';
  const res = await createTeam(teamForm.name.trim(), teamForm.description.trim() || undefined);
  saving.value = false;
  if (res.ok) { showCreate.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleUpdate() {
  if (!selectedTeam.value || !teamForm.name.trim()) return;
  saving.value = true;
  dialogError.value = '';
  const res = await updateTeam(selectedTeam.value.id, teamForm.name.trim(), teamForm.description.trim() || undefined);
  saving.value = false;
  if (res.ok) { showEdit.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleDelete() {
  if (!selectedTeam.value) return;
  saving.value = true;
  const res = await deleteTeam(selectedTeam.value.id);
  saving.value = false;
  if (res.ok) {
    showDelete.value = false;
    delete memberMap.value[selectedTeam.value.id];
    delete knowledgeMap.value[selectedTeam.value.id];
  }
}

// ── Members ────────────────────────────────────────────────────────────────

function openAddMember(team: Team) {
  selectedTeam.value = team;
  selectedUserId.value = '';
  selectedMemberRole.value = 'member';
  dialogError.value = '';
  showAddMember.value = true;
}

async function handleAddMember() {
  if (!selectedTeam.value || !selectedUserId.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await addMember(selectedTeam.value.id, selectedUserId.value, selectedMemberRole.value);
  saving.value = false;
  if (res.ok) {
    memberMap.value[selectedTeam.value.id] = await fetchMembers(selectedTeam.value.id);
    showAddMember.value = false;
  } else {
    dialogError.value = res.error || '';
  }
}

async function handleRemoveMember(teamId: string, userId: string) {
  const res = await removeMember(teamId, userId);
  if (res.ok) memberMap.value[teamId] = await fetchMembers(teamId);
}

// ── Knowledge ──────────────────────────────────────────────────────────────

function openAddKnowledge(team: Team) {
  selectedTeam.value = team;
  kForm.title = '';
  kForm.type = 'text';
  kForm.content = '';
  kForm.sourceUrl = '';
  kForm.crawlLimit = 50;
  kForm.file = null;
  kDialogError.value = '';
  showAddKnowledge.value = true;
}

async function handleAddKnowledge() {
  if (!selectedTeam.value || !kForm.title.trim()) {
    kDialogError.value = 'Vui lòng nhập tiêu đề';
    return;
  }
  kSaving.value = true;
  kDialogError.value = '';
  const teamId = selectedTeam.value.id;

  let res: { ok: boolean; error?: string };
  if (kForm.type === 'text') {
    if (!kForm.content.trim()) { kDialogError.value = 'Vui lòng nhập nội dung'; kSaving.value = false; return; }
    res = await addKnowledgeText(teamId, kForm.title.trim(), kForm.content.trim());
  } else if (kForm.type === 'url') {
    if (!kForm.sourceUrl.trim()) { kDialogError.value = 'Vui lòng nhập URL'; kSaving.value = false; return; }
    res = await addKnowledgeUrl(teamId, kForm.title.trim(), kForm.sourceUrl.trim(), kForm.crawlLimit);
  } else {
    const file = Array.isArray(kForm.file) ? kForm.file[0] : kForm.file;
    if (!file) { kDialogError.value = 'Vui lòng chọn file PDF'; kSaving.value = false; return; }
    res = await uploadKnowledgeFile(teamId, kForm.title.trim(), file);
  }

  kSaving.value = false;
  if (res.ok) {
    showAddKnowledge.value = false;
    await refreshKnowledge(teamId);
  } else {
    kDialogError.value = res.error || 'Có lỗi xảy ra';
  }
}

async function openPreview(doc: TeamKnowledge) {
  previewTitle.value = doc.title;
  previewContent.value = '';
  previewLoading.value = true;
  showPreview.value = true;
  
  // Find teamId from maps
  const teamId = Object.keys(knowledgeMap.value).find(tid => 
    knowledgeMap.value[tid].some(d => d.id === doc.id)
  );

  if (teamId) {
    previewContent.value = await fetchKnowledgeContent(teamId, doc.id);
  }
  previewLoading.value = false;
}

async function handleDeleteKnowledge(teamId: string, knowledgeId: string) {
  const res = await deleteKnowledge(teamId, knowledgeId);
  if (res.ok) await refreshKnowledge(teamId);
}

async function handleReindex(teamId: string, knowledgeId: string) {
  await reindexKnowledge(teamId, knowledgeId);
  await refreshKnowledge(teamId);
}

// ── Polling for indexing status ──
let pollInterval: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    for (const teamId of Object.keys(knowledgeMap.value)) {
      const hasIndexing = knowledgeMap.value[teamId]?.some(k => k.status === 'indexing');
      if (hasIndexing) {
        // Soft refresh without loading spinner
        const newData = await fetchKnowledge(teamId);
        knowledgeMap.value[teamId] = newData;
      }
    }
  }, 5000);
}

onMounted(async () => {
  await Promise.all([fetchTeams(), fetchUsers()]);
  startPolling();
});

onBeforeUnmount(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>
