<template>
  <v-dialog v-model="model" :max-width="isMobile ? 'calc(100vw - 32px)' : 860" scrollable>
    <v-card rounded="xl">
      <v-card-title class="d-flex align-center gap-3" :class="isMobile ? 'pa-4 pb-3 text-subtitle-1 font-weight-bold' : 'pa-5 pb-4 text-h6'">
        <v-icon color="primary" :size="isMobile ? 20 : 22">{{ isEdit ? 'mdi-pencil' : 'mdi-bullhorn-outline' }}</v-icon>
        {{ isEdit ? 'Chỉnh sửa chiến dịch' : 'Tạo chiến dịch mới' }}
      </v-card-title>
      <v-divider />

      <!-- Custom step indicator -->
      <div class="step-indicator d-flex align-center" :class="isMobile ? 'px-4 py-3' : 'px-8 py-4'">
        <div v-for="(s, i) in stepLabels" :key="i" class="d-flex align-center flex-grow-1">
          <div class="step-dot d-flex flex-column align-center" style="min-width: 64px;">
            <div class="dot" :class="{ 'dot--active': step === i + 1, 'dot--done': step > i + 1 }">
              <v-icon v-if="step > i + 1" size="14" color="white">mdi-check</v-icon>
              <span v-else class="text-caption font-weight-bold" :class="step === i + 1 ? 'text-white' : ''">{{ i + 1 }}</span>
            </div>
            <div class="text-caption mt-1" :class="step === i + 1 ? 'text-primary font-weight-semibold' : 'text-medium-emphasis'">{{ s }}</div>
          </div>
          <div v-if="i < stepLabels.length - 1" class="step-line flex-grow-1 mb-4" :class="{ 'step-line--done': step > i + 1 }" />
        </div>
      </div>
      <v-divider />

      <v-card-text :class="isMobile ? 'pa-4' : 'pa-6'" style="overflow-y: auto; min-height: 420px;">

        <!-- ── STEP 1: Nội dung ──────────────────────────────────── -->
        <div v-show="step === 1">
          <v-text-field
            v-model="form.title"
            label="Tiêu đề chiến dịch *"
            placeholder="VD: Sale tháng 5 - Chữ ký số"
            variant="outlined"
            density="comfortable"
            class="mb-5"
          />

          <div class="text-subtitle-2 font-weight-semibold mb-3">Nội dung tin nhắn</div>

          <div v-for="(block, idx) in form.content" :key="idx" class="content-block mb-4">
            <!-- Text block -->
            <div v-if="block.type === 'text'" class="text-block rounded-xl" :style="{ zIndex: emojiPickerIdx === idx ? 10 : 1 }">
              <!-- Toolbar -->
              <div class="text-toolbar d-flex align-center gap-1 px-3 py-2">
                <!-- Emoji picker trigger -->
                <div class="emoji-wrap" style="position:relative;">
                  <v-btn icon size="x-small" variant="text" @click.stop="toggleEmojiPicker(idx)">
                    <v-icon size="16">mdi-emoticon-outline</v-icon>
                    <v-tooltip activator="parent" location="top">Emoji</v-tooltip>
                  </v-btn>
                  <div v-if="emojiPickerIdx === idx" class="emoji-panel" @click.stop>
                    <EmojiPicker :native="true" class="custom-emoji-picker" @select="(e) => onPickerSelect(idx, e)" />
                  </div>
                </div>

                <v-divider vertical class="mx-1" style="height:16px;" />

                <v-btn icon size="x-small" variant="text" @click="applyBold(idx)">
                  <v-icon size="16">mdi-format-bold</v-icon>
                  <v-tooltip activator="parent" location="top">In đậm (Unicode)</v-tooltip>
                </v-btn>
                <v-btn icon size="x-small" variant="text" @click="applyItalic(idx)">
                  <v-icon size="16">mdi-format-italic</v-icon>
                  <v-tooltip activator="parent" location="top">In nghiêng (Unicode)</v-tooltip>
                </v-btn>
                <v-btn icon size="x-small" variant="text" @click="insertNewline(idx)">
                  <v-icon size="16">mdi-keyboard-return</v-icon>
                  <v-tooltip activator="parent" location="top">Xuống dòng</v-tooltip>
                </v-btn>

                <v-spacer />
                <span class="text-caption text-medium-emphasis">{{ (block.value || '').length }} ký tự</span>
                <v-btn icon size="x-small" variant="text" color="error" @click="removeBlock(idx)">
                  <v-icon size="15">mdi-delete</v-icon>
                </v-btn>
              </div>
              <v-divider />
              <v-textarea
                :ref="el => { if (el) textareaRefs[idx] = el }"
                v-model="block.value"
                placeholder="Nhập nội dung tin nhắn..."
                variant="plain"
                density="compact"
                rows="4"
                auto-grow
                max-rows="10"
                hide-details
                class="px-3 pt-2 pb-2"
                @click="emojiPickerIdx = -1"
              />
            </div>

            <!-- Image block -->
            <div v-else-if="block.type === 'image'" class="image-block d-flex align-center gap-3 pa-3 rounded-xl">
              <v-icon color="primary" size="22">mdi-image</v-icon>
              <img :src="block.base64" style="max-height: 72px; max-width: 180px; border-radius: 8px; object-fit: contain;" />
              <div class="flex-grow-1 text-caption text-medium-emphasis text-truncate">{{ block.filename || 'Hình ảnh' }}</div>
              <v-btn icon size="small" variant="text" color="error" @click="removeBlock(idx)">
                <v-icon size="16">mdi-delete</v-icon>
              </v-btn>
            </div>
          </div>

          <!-- Add block buttons -->
          <div class="d-flex gap-2 mt-1">
            <v-btn size="small" variant="tonal" prepend-icon="mdi-text" @click="addTextBlock">Thêm đoạn text</v-btn>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-image-plus" @click="imageInputRef?.click()">Thêm ảnh</v-btn>
            <input ref="imageInputRef" type="file" accept="image/*" multiple style="display: none" @change="onImageSelected" />
          </div>

          <v-alert v-if="!form.content.length" type="warning" variant="tonal" rounded="lg" density="compact" class="mt-4">
            Thêm ít nhất một đoạn nội dung để gửi.
          </v-alert>

          <!-- Bold info -->
          <v-alert type="info" variant="tonal" rounded="lg" density="compact" class="mt-3 text-caption">
            <v-icon start size="14">mdi-information-outline</v-icon>
            Zalo không hỗ trợ markdown. Nút <strong>B</strong> / <em>I</em> sẽ chuyển đổi ký tự đã chọn sang <strong>Unicode bold/italic</strong> (𝗮𝗯𝗰 / 𝘢𝘣𝘤).
          </v-alert>
        </div>

        <!-- ── STEP 2: Lịch gửi ──────────────────────────────────── -->
        <div v-show="step === 2">
          <div class="text-subtitle-2 font-weight-semibold mb-4">Kiểu lịch gửi</div>
          <v-row class="mb-5" no-gutters>
            <v-col v-for="s in scheduleTypes" :key="s.value" cols="6" sm="3" class="pa-1">
              <div class="schedule-chip pa-4 text-center rounded-xl cursor-pointer"
                :class="{ 'schedule-chip--active': form.scheduleType === s.value }"
                @click="form.scheduleType = s.value">
                <v-icon :color="form.scheduleType === s.value ? 'primary' : 'grey'" size="26" class="mb-1">{{ s.icon }}</v-icon>
                <div class="text-caption font-weight-semibold">{{ s.label }}</div>
              </div>
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="12" sm="6">
              <v-text-field v-model="form.scheduleTime" label="Giờ gửi *" type="time" variant="outlined" density="comfortable" prepend-inner-icon="mdi-clock-outline" />
            </v-col>
            <v-col v-if="form.scheduleType === 'once'" cols="12" sm="6">
              <v-text-field v-model="form.scheduleValue" label="Ngày gửi *" type="date" variant="outlined" density="comfortable" prepend-inner-icon="mdi-calendar" :min="today" />
            </v-col>
            <v-col v-else-if="form.scheduleType === 'weekly'" cols="12" sm="6">
              <v-select v-model="form.scheduleValue" label="Ngày trong tuần *" :items="weekdays" item-title="label" item-value="value" variant="outlined" density="comfortable" prepend-inner-icon="mdi-calendar-week" />
            </v-col>
            <v-col v-else-if="form.scheduleType === 'monthly'" cols="12" sm="6">
              <v-select v-model="form.scheduleValue" label="Ngày trong tháng *" :items="monthDays" variant="outlined" density="comfortable" prepend-inner-icon="mdi-calendar-month" />
            </v-col>
          </v-row>

          <v-switch v-if="form.scheduleType !== 'once'" v-model="form.isRecurring" color="primary" label="Lặp lại tự động" density="compact" hide-details class="mb-4" />

          <v-alert type="info" variant="tonal" rounded="lg" density="compact" class="mt-2">
            <template #prepend><v-icon>mdi-information</v-icon></template>
            <strong>Lịch gửi:</strong> {{ schedulePreview }}
          </v-alert>

          <v-card rounded="xl" variant="tonal" color="warning" class="mt-4 pa-4">
            <div class="d-flex align-start gap-3">
              <v-icon color="warning" size="20">mdi-shield-check</v-icon>
              <div>
                <div class="text-subtitle-2 font-weight-semibold mb-1">Cơ chế anti-spam</div>
                <div class="text-caption">
                  Tối đa <strong>3 KH/chunk</strong>, delay <strong>1–2 giây/KH</strong>,
                  <strong>5–10 giây/chunk</strong>. 1 KH nhiều Zalo → gửi qua tất cả.
                </div>
              </div>
            </div>
          </v-card>
        </div>

        <!-- ── STEP 3: Nhóm KH ──────────────────────────────────── -->
        <div v-show="step === 3">
          <div class="text-subtitle-2 font-weight-semibold mb-3">Chọn nhóm khách hàng *</div>

          <v-alert v-if="!props.groups.length" type="warning" variant="tonal" rounded="lg" class="mb-4">
            Chưa có nhóm nào. Vui lòng tạo nhóm trước.
          </v-alert>

          <v-row v-else>
            <v-col v-for="g in props.groups" :key="g.id" cols="12" sm="6">
              <div class="group-select-card pa-4 rounded-xl cursor-pointer"
                :class="{ 'group-select-card--active': form.groupId === g.id }"
                @click="form.groupId = g.id">
                <div class="d-flex justify-space-between align-start">
                  <div>
                    <div class="text-subtitle-2 font-weight-semibold">{{ g.name }}</div>
                    <v-chip size="x-small" :color="modeColor(g.mode)" variant="tonal" class="mt-1">{{ modeLabel(g.mode) }}</v-chip>
                  </div>
                  <v-icon v-if="form.groupId === g.id" color="primary" size="20">mdi-check-circle</v-icon>
                </div>
              </div>
            </v-col>
          </v-row>

          <v-divider class="my-4" />

          <div class="summary-card pa-4 rounded-xl">
            <div class="text-subtitle-2 font-weight-semibold mb-3">Tóm tắt chiến dịch</div>
            <v-list density="compact" class="pa-0" bg-color="transparent">
              <v-list-item prepend-icon="mdi-bullhorn-outline">
                <v-list-item-title>{{ form.title || '(chưa nhập tiêu đề)' }}</v-list-item-title>
                <v-list-item-subtitle>Tiêu đề</v-list-item-subtitle>
              </v-list-item>
              <v-list-item prepend-icon="mdi-file-document-outline">
                <v-list-item-title>{{ form.content.length }} khối nội dung</v-list-item-title>
                <v-list-item-subtitle>Nội dung</v-list-item-subtitle>
              </v-list-item>
              <v-list-item prepend-icon="mdi-clock-outline">
                <v-list-item-title>{{ schedulePreview }}</v-list-item-title>
                <v-list-item-subtitle>Lịch gửi</v-list-item-subtitle>
              </v-list-item>
              <v-list-item prepend-icon="mdi-account-group-outline">
                <v-list-item-title>{{ selectedGroupName }}</v-list-item-title>
                <v-list-item-subtitle>Nhóm khách hàng</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </div>
        </div>

      </v-card-text>

      <v-divider />
      <v-card-actions :class="isMobile ? 'pa-3 px-4' : 'pa-4 px-6'">
        <v-btn v-if="step > 1" variant="text" prepend-icon="mdi-arrow-left" @click="step--">Quay lại</v-btn>
        <v-btn v-else variant="text" @click="model = false">Huỷ</v-btn>
        <v-spacer />
        <v-btn v-if="step < 3" color="primary" variant="flat" @click="nextStep" :disabled="!canProceed">
          Tiếp theo <v-icon end>mdi-arrow-right</v-icon>
        </v-btn>
        <v-btn v-else color="primary" variant="flat" :loading="saving" @click="save" :disabled="!canSave">
          {{ isEdit ? 'Lưu thay đổi' : 'Tạo chiến dịch' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { useDisplay } from 'vuetify';
import { api } from '@/api/index';
import EmojiPicker from 'vue3-emoji-picker';
// @ts-ignore
import 'vue3-emoji-picker/css';

const props = defineProps<{
  modelValue: boolean;
  campaign?: any;
  groups: any[];
}>();
const emit = defineEmits(['update:modelValue', 'saved']);

const { mobile } = useDisplay();
const isMobile = computed(() => mobile.value);
const model = computed({ get: () => props.modelValue, set: v => emit('update:modelValue', v) });
const isEdit = computed(() => !!props.campaign?.id);

const step = ref(1);
const saving = ref(false);
const imageInputRef = ref<HTMLInputElement | null>(null);
const textareaRefs = ref<Record<number, any>>({});
const emojiPickerIdx = ref(-1);
const stepLabels = ['Nội dung', 'Lịch gửi', 'Nhóm KH'];

function onPickerSelect(idx: number, emoji: any) {
  insertEmojiAt(idx, emoji.i);
}

const form = reactive({
  title: '',
  content: [] as any[],
  scheduleType: 'once',
  scheduleTime: '08:00',
  scheduleValue: '',
  isRecurring: false,
  groupId: '',
});

const scheduleTypes = [
  { value: 'once',    label: 'Một lần',    icon: 'mdi-calendar-today' },
  { value: 'daily',   label: 'Hằng ngày',  icon: 'mdi-calendar-refresh' },
  { value: 'weekly',  label: 'Hằng tuần',  icon: 'mdi-calendar-week' },
  { value: 'monthly', label: 'Hằng tháng', icon: 'mdi-calendar-month' },
];

const weekdays = [
  { label: 'Thứ 2', value: '1' }, { label: 'Thứ 3', value: '2' },
  { label: 'Thứ 4', value: '3' }, { label: 'Thứ 5', value: '4' },
  { label: 'Thứ 6', value: '5' }, { label: 'Thứ 7', value: '6' },
  { label: 'Chủ nhật', value: '0' },
];
const monthDays = Array.from({ length: 28 }, (_, i) => String(i + 1));
const today = new Date().toISOString().split('T')[0];

const canProceed = computed(() => {
  if (step.value === 1) return form.title.length > 0 && form.content.length > 0;
  if (step.value === 2) return !!form.scheduleTime;
  return true;
});
const canSave = computed(() => form.title && form.groupId && form.content.length > 0);

const schedulePreview = computed(() => {
  const time = form.scheduleTime || '08:00';
  if (form.scheduleType === 'once') return form.scheduleValue ? `Một lần vào ${form.scheduleValue} lúc ${time}` : `Một lần lúc ${time}`;
  if (form.scheduleType === 'daily') return `Hằng ngày lúc ${time}${form.isRecurring ? ', lặp lại' : ''}`;
  if (form.scheduleType === 'weekly') {
    const day = weekdays.find(w => w.value === form.scheduleValue)?.label || 'Thứ 2';
    return `Hằng tuần vào ${day} lúc ${time}${form.isRecurring ? ', lặp lại' : ''}`;
  }
  if (form.scheduleType === 'monthly') return `Hằng tháng ngày ${form.scheduleValue || '1'} lúc ${time}${form.isRecurring ? ', lặp lại' : ''}`;
  return '';
});

const selectedGroupName = computed(() => props.groups.find(g => g.id === form.groupId)?.name || '(chưa chọn)');

watch(() => props.modelValue, open => {
  if (open) {
    step.value = 1;
    emojiPickerIdx.value = -1;
    if (props.campaign) {
      form.title = props.campaign.title;
      form.content = Array.isArray(props.campaign.content) ? [...props.campaign.content] : [];
      form.scheduleType = props.campaign.scheduleType || 'once';
      form.scheduleTime = props.campaign.scheduleTime || '08:00';
      form.scheduleValue = props.campaign.scheduleValue || '';
      form.isRecurring = props.campaign.isRecurring || false;
      form.groupId = props.campaign.groupId || '';
    } else {
      form.title = '';
      form.content = [{ type: 'text', value: '' }];
      form.scheduleType = 'once';
      form.scheduleTime = '08:00';
      form.scheduleValue = today;
      form.isRecurring = false;
      form.groupId = props.groups[0]?.id || '';
    }
  }
});

function nextStep() { if (canProceed.value) step.value++; }
function addTextBlock() { form.content.push({ type: 'text', value: '' }); }
function removeBlock(i: number) { form.content.splice(i, 1); }

// ── Emoji picker ──────────────────────────────────────────────────────
function toggleEmojiPicker(idx: number) {
  emojiPickerIdx.value = emojiPickerIdx.value === idx ? -1 : idx;
}

function insertEmojiAt(idx: number, emoji: string) {
  const block = form.content[idx];
  if (block.type !== 'text') return;
  const el = textareaRefs.value[idx];
  const textarea = el?.$el?.querySelector('textarea') as HTMLTextAreaElement | null;
  if (textarea) {
    const start = textarea.selectionStart ?? block.value.length;
    const end = textarea.selectionEnd ?? start;
    block.value = block.value.slice(0, start) + emoji + block.value.slice(end);
    nextTick(() => {
      const pos = start + emoji.length;
      textarea.setSelectionRange(pos, pos);
      textarea.focus();
    });
  } else {
    block.value += emoji;
  }
  emojiPickerIdx.value = -1;
}

// ── Unicode bold/italic ───────────────────────────────────────────────
// Zalo doesn't support markdown — convert selected text to Unicode bold/italic chars
const BOLD_MAP: Record<string, string> = {
  a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',
  n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',
  A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',
  N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭',
  '0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵',
};
const ITALIC_MAP: Record<string, string> = {
  a:'𝘢',b:'𝘣',c:'𝘤',d:'𝘥',e:'𝘦',f:'𝘧',g:'𝘨',h:'𝘩',i:'𝘪',j:'𝘫',k:'𝘬',l:'𝘭',m:'𝘮',
  n:'𝘯',o:'𝘰',p:'𝘱',q:'𝘲',r:'𝘳',s:'𝘴',t:'𝘵',u:'𝘶',v:'𝘷',w:'𝘸',x:'𝘹',y:'𝘺',z:'𝘻',
  A:'𝘈',B:'𝘉',C:'𝘊',D:'𝘋',E:'𝘌',F:'𝘍',G:'𝘎',H:'𝘏',I:'𝘐',J:'𝘑',K:'𝘒',L:'𝘓',M:'𝘔',
  N:'𝘕',O:'𝘖',P:'𝘗',Q:'𝘘',R:'𝘙',S:'𝘚',T:'𝘛',U:'𝘜',V:'𝘝',W:'𝘞',X:'𝘟',Y:'𝘠',Z:'𝘡',
};

function convertText(map: Record<string, string>, text: string) {
  return text.split('').map(c => map[c] || c).join('');
}

function applyBold(idx: number) { applyUnicodeFormat(idx, BOLD_MAP); }
function applyItalic(idx: number) { applyUnicodeFormat(idx, ITALIC_MAP); }

function applyUnicodeFormat(idx: number, map: Record<string, string>) {
  const block = form.content[idx];
  if (block.type !== 'text') return;
  const el = textareaRefs.value[idx];
  const textarea = el?.$el?.querySelector('textarea') as HTMLTextAreaElement | null;
  if (textarea) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    if (start !== end) {
      // Apply to selection
      const selected = block.value.slice(start, end);
      const converted = convertText(map, selected);
      block.value = block.value.slice(0, start) + converted + block.value.slice(end);
      nextTick(() => {
        textarea.setSelectionRange(start, start + converted.length);
        textarea.focus();
      });
    } else {
      // No selection — convert whole block
      block.value = convertText(map, block.value);
    }
  } else {
    block.value = convertText(map, block.value);
  }
}

function insertNewline(idx: number) {
  const block = form.content[idx];
  if (block.type !== 'text') return;
  const el = textareaRefs.value[idx];
  const textarea = el?.$el?.querySelector('textarea') as HTMLTextAreaElement | null;
  if (textarea) {
    const start = textarea.selectionStart ?? block.value.length;
    block.value = block.value.slice(0, start) + '\n' + block.value.slice(start);
    nextTick(() => { textarea.setSelectionRange(start + 1, start + 1); textarea.focus(); });
  } else {
    block.value += '\n';
  }
}

// ── Image ─────────────────────────────────────────────────────────────
function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => { form.content.push({ type: 'image', base64: ev.target?.result as string, filename: file.name }); };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function modeColor(mode: string) { return { all:'success', exclude:'warning', manual:'primary' }[mode] || 'primary'; }
function modeLabel(mode: string) { return { all:'Tất cả', exclude:'Loại trừ', manual:'Chọn tay' }[mode] || mode; }

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const payload = {
      title: form.title,
      groupId: form.groupId,
      content: form.content,
      scheduleType: form.scheduleType,
      scheduleTime: form.scheduleTime,
      scheduleValue: form.scheduleValue,
      isRecurring: form.isRecurring,
    };
    if (isEdit.value) {
      await api.put(`/campaigns/${props.campaign.id}`, payload);
    } else {
      await api.post('/campaigns', payload);
    }
    emit('saved');
    model.value = false;
  } catch { /* ignore */ } finally { saving.value = false; }
}
</script>

<style scoped>
/* ── Custom Stepper ── */
.step-indicator { gap: 0; }
.step-dot { position: relative; }
.dot {
  width: 34px; height: 34px; border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  transition: all 0.25s ease;
}
.dot--active {
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.2);
  color: white;
}
.dot--done { background: rgb(var(--v-theme-primary)); color: white; }
.step-line {
  height: 2px;
  background: rgba(var(--v-border-color), 0.3);
  margin: 0 6px; margin-bottom: 18px;
  transition: background 0.25s ease;
}
.step-line--done { background: rgb(var(--v-theme-primary)); }

/* ── Text block ── */
.text-block {
  border: 1.5px solid rgba(var(--v-border-color), var(--v-border-opacity));
  transition: border-color 0.15s;
  position: relative;
}
.text-block:focus-within {
  border-color: rgb(var(--v-theme-primary));
}
.text-toolbar {
  background: rgba(var(--v-theme-on-surface), 0.03);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: inherit;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

/* ── Image block ── */
.image-block {
  border: 1.5px dashed rgba(var(--v-border-color), 0.6);
  background: rgba(var(--v-theme-on-surface), 0.02);
}

/* ── Emoji picker ── */
.emoji-wrap { display: inline-block; }
.emoji-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
}
.custom-emoji-picker {
  --ep-color-bg: rgb(var(--v-theme-surface)) !important;
  --ep-color-border: rgba(var(--v-border-color), var(--v-border-opacity)) !important;
  --ep-color-text: rgb(var(--v-theme-on-surface)) !important;
  --ep-color-hover: rgba(var(--v-theme-primary), 0.1) !important;
  --ep-color-search-bg: rgba(var(--v-theme-on-surface), 0.06) !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  border-radius: 12px !important;
}

/* ── Schedule chips ── */
.schedule-chip {
  border: 2px solid transparent;
  background: rgba(var(--v-theme-on-surface), 0.05);
  cursor: pointer;
  transition: all 0.15s ease;
}
.schedule-chip--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}
.schedule-chip:hover { opacity: 0.85; }

/* ── Group cards ── */
.group-select-card {
  border: 2px solid rgba(var(--v-border-color), var(--v-border-opacity));
  transition: all 0.15s ease;
  cursor: pointer;
}
.group-select-card:hover { border-color: rgba(var(--v-theme-primary), 0.4); }
.group-select-card--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.06);
}

/* ── Summary ── */
.summary-card {
  background: rgba(var(--v-theme-primary), 0.04);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
}

.cursor-pointer { cursor: pointer; }
</style>
