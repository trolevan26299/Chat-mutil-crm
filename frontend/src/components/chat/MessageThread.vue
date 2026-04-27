<template>
  <div class="message-thread d-flex flex-column flex-grow-1" style="height: 100%;">
    <!-- Empty state -->
    <div v-if="!conversation" class="d-flex align-center justify-center flex-grow-1">
      <div class="text-center text-grey">
        <v-icon icon="mdi-chat-outline" size="96" color="grey-lighten-2" />
        <p class="text-h6 mt-4">Chọn cuộc trò chuyện</p>
      </div>
    </div>

    <template v-else>


      <!-- Header -->
      <div class="pa-3 d-flex align-center" style="border-bottom: 1px solid var(--border-glow, rgba(0,242,255,0.1));">
        <v-avatar size="36" color="grey-lighten-2" class="mr-3">
          <v-icon v-if="conversation.threadType === 'group'" icon="mdi-account-group" />
          <v-img v-else-if="conversation.contact?.avatarUrl" :src="conversation.contact.avatarUrl" />
          <v-icon v-else icon="mdi-account" />
        </v-avatar>
        <div class="flex-grow-1">
          <div class="font-weight-medium">{{ conversation.contact?.fullName || 'Unknown' }}</div>
          <div class="text-caption text-grey">{{ conversation.zaloAccount?.displayName || 'Zalo' }}</div>
        </div>

        <v-btn
          :icon="showContactPanel ? 'mdi-account-details' : 'mdi-account-details-outline'"
          size="small" variant="text"
          :color="showContactPanel ? 'primary' : undefined"
          @click="$emit('toggle-contact-panel')"
        />
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-grow-1 overflow-y-auto pa-3 chat-messages-area">
        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />
        <template v-for="(group, gi) in groupedMessages" :key="gi">
          <!-- Sticker group: show as responsive grid -->
          <div v-if="group.isStickers" class="mb-2 d-flex" :class="group.senderType === 'self' ? 'justify-end' : 'justify-start'">
            <div class="sticker-group-grid">
              <div
                v-for="msg in group.messages"
                :key="msg.id"
                class="sticker-group-cell"
                style="position:relative;"
                @mouseenter="hoveredMsgId = msg.id"
                @mouseleave="hoveredMsgId = null"
              >
                <button
                  v-show="hoveredMsgId === msg.id"
                  class="reply-icon-btn"
                  style="position:absolute;top:4px;right:4px;z-index:5;"
                  @click.stop="handleReplyClick(msg)"
                  title="Trả lời"
                >
                  <v-icon size="15">mdi-reply</v-icon>
                </button>
                <img
                  v-if="getStickerUrl(msg)"
                  :src="getStickerUrl(msg)!"
                  alt="Sticker"
                  class="sticker-img"
                  @error="($event.target as HTMLImageElement).style.display='none'"
                />
                <div class="text-caption msg-time" style="font-size:0.65rem;text-align:center;margin-top:2px;opacity:0.7;">{{ formatMessageTime(msg.sentAt) }}</div>
              </div>
            </div>
          </div>

          <div
            v-else
            v-for="msg in group.messages"
            :key="msg.id"
            class="mb-2 d-flex"
            :class="msg.senderType === 'self' ? 'justify-end' : 'justify-start'"
            style="align-items:center; gap:4px;"
            @mouseenter="hoveredMsgId = msg.id"
            @mouseleave="hoveredMsgId = null"
          >
            <!-- Actions btn: left of bubble (self msgs) -->
            <div
              v-if="msg.senderType === 'self'"
              v-show="hoveredMsgId === msg.id"
              class="d-flex align-center mr-1 msg-actions"
            >
              <button
                class="action-icon-btn"
                @click.stop="handleReplyClick(msg)"
              >
                <v-icon size="15">mdi-reply</v-icon>
                <v-tooltip activator="parent" location="top" open-delay="200" content-class="custom-tooltip">Trả lời</v-tooltip>
              </button>
              <button
                class="action-icon-btn ml-1"
                @click.stop="handleUndoClick(msg)"
              >
                <v-icon size="15">mdi-undo</v-icon>
                <v-tooltip activator="parent" location="top" open-delay="200" content-class="custom-tooltip">Thu hồi</v-tooltip>
              </button>
              <v-menu location="top" open-on-hover close-on-content-click :open-delay="100">
                <template v-slot:activator="{ props }">
                  <button class="action-icon-btn ml-1" v-bind="props">
                    <v-icon size="15">mdi-emoticon-outline</v-icon>
                  </button>
                </template>
                <div class="d-flex pa-1 rounded-pill elevation-3 bg-surface" style="gap: 4px; border: 1px solid rgba(150,150,150,0.2);">
                  <button v-for="(char, zcode) in globalEmojiMap" :key="zcode" class="emoji-picker-btn" @click="handleSendReaction(msg, String(zcode))">
                    {{ char }}
                  </button>
                </div>
              </v-menu>
            </div>

            <div style="max-width: 70%; position: relative;">
              <div v-if="conversation.threadType === 'group' && msg.senderType !== 'self'" class="text-caption mb-1" style="color: #00F2FF; font-weight: 500;">
                {{ msg.senderName || 'Unknown' }}
              </div>
              <div class="message-bubble pa-2 px-3 rounded-lg" :class="msg.senderType === 'self' ? 'bg-primary text-white' : 'bg-white'" style="word-wrap: break-word;">
                <!-- Quoted Message (Reply snippet at top of bubble) -->
                <div v-if="!msg.isDeleted && getQuoteData(msg)" class="mb-1 pa-2 rounded" style="background: var(--v-theme-surface); border-left: 3px solid rgba(0, 242, 255, 0.5); font-size: 0.8rem; line-height: 1.3; opacity: 0.85;">
                  <div class="font-weight-bold text-truncate" style="max-width: 200px;">{{ getQuoteData(msg)?.fromDName || getQuoteData(msg)?.uidFrom || 'Người dùng' }}</div>
                  <div class="text-truncate" style="max-width: 200px;">{{ getQuoteData(msg)?.textPreview || '(tin nhắn)' }}</div>
                </div>

                <!-- MAIN CONTENT (Mutually exclusive block) -->
                <!-- Deleted -->
                <div v-if="msg.isDeleted" class="text-decoration-line-through font-italic" style="opacity: 0.6;">
                  {{ msg.content || '(tin nhắn)' }}<span class="text-caption"> (đã thu hồi)</span>
                </div>
                <!-- Image -->
                <div v-else-if="getImageUrl(msg)">

                  <img :src="getImageUrl(msg)!" alt="Hình ảnh" class="chat-image" @click="previewImageUrl = getImageUrl(msg)!" />
                </div>
                <!-- File/PDF -->
                <div v-else-if="getFileInfo(msg)" class="file-card">
                  <v-icon size="20" class="mr-2" color="info">mdi-file-document-outline</v-icon>
                  <div class="flex-grow-1">
                    <div class="text-body-2 font-weight-medium">{{ getFileInfo(msg)!.name }}</div>
                    <div class="text-caption" style="opacity: 0.6;">{{ getFileInfo(msg)!.size }}</div>
                  </div>
                  <v-btn v-if="getFileInfo(msg)!.href" icon size="x-small" variant="text" @click="openFile(getFileInfo(msg)!.href)">
                    <v-icon size="16">mdi-download</v-icon>
                  </v-btn>
                </div>
                <!-- Sticker -->
                <div v-else-if="msg.contentType === 'sticker'">
                  <img
                    v-if="getStickerUrl(msg)"
                    :src="getStickerUrl(msg)!"
                    alt="Sticker"
                    class="sticker-img"
                    @error="($event.target as HTMLImageElement).style.display='none'"
                  />
                  <span v-else class="text-grey text-caption">🏷️ Sticker</span>
                </div>
                <div v-else-if="msg.contentType === 'video'">🎥 Video</div>
                <div v-else-if="msg.contentType === 'voice'">🎤 Tin nhắn thoại</div>
                <div v-else-if="msg.contentType === 'gif'">GIF</div>
                <!-- Reminder/Calendar -->
                <div v-else-if="isReminderMessage(msg)" class="reminder-card">
                  <div class="d-flex align-center mb-1">
                    <v-icon size="16" color="warning" class="mr-1">mdi-calendar-clock</v-icon>
                    <span class="text-caption font-weight-bold" style="color: #FFB74D;">Nhắc hẹn</span>
                  </div>
                  <div class="text-body-2">{{ getReminderTitle(msg) }}</div>
                  <div v-if="getReminderTime(msg)" class="text-caption mt-1" style="opacity: 0.7;">
                    <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>{{ getReminderTime(msg) }}
                  </div>
                  <v-btn size="x-small" variant="tonal" color="warning" class="mt-2" prepend-icon="mdi-calendar-sync" @click="syncAppointment(msg)">Đồng bộ lịch</v-btn>
                </div>
                <!-- Special message types -->
                <SpecialMessageRenderer
                  v-else-if="isSpecialType(msg.contentType)"
                  :type="msg.contentType"
                  :content="parseContent(msg.content)"
                />
                <!-- Default text -->
                <div v-else>{{ parseDisplayContent(msg.content) }}</div>
                <!-- Timestamp -->
                <div class="text-caption mt-1 msg-time" :class="msg.senderType === 'self' ? 'msg-time-self' : 'msg-time-contact'" style="font-size: 0.7rem;">
                  {{ formatMessageTime(msg.sentAt) }}
                </div>
              </div>
              
              <!-- REACTION BADGE -->
              <div
                v-if="getReactionSummary(msg)"
                class="reaction-badge"
                :class="msg.senderType === 'self' ? 'reaction-self' : 'reaction-contact'"
                :title="'Reactions: ' + getReactionSummary(msg)!.total"
              >
                <span 
                  v-for="(emoji, i) in getReactionSummary(msg)!.iconPreview" 
                  :key="i"
                  style="font-size: 13px; line-height: 1; z-index: 10;"
                >
                  {{ emoji }}
                </span>
                <span 
                  v-if="getReactionSummary(msg)!.total > 1" 
                  class="reaction-count"
                >
                  {{ getReactionSummary(msg)!.total }}
                </span>
              </div>
            </div>

            <!-- Actions btn: right of bubble (contact msgs) -->
            <div
              v-if="msg.senderType !== 'self'"
              v-show="hoveredMsgId === msg.id"
              class="d-flex align-center ml-1 msg-actions"
            >
              <button
                class="action-icon-btn"
                @click.stop="handleReplyClick(msg)"
              >
                <v-icon size="15">mdi-reply</v-icon>
                <v-tooltip activator="parent" location="top" open-delay="200" content-class="custom-tooltip">Trả lời</v-tooltip>
              </button>
              <v-menu location="top" open-on-hover close-on-content-click :open-delay="100">
                <template v-slot:activator="{ props }">
                  <button class="action-icon-btn ml-1" v-bind="props">
                    <v-icon size="15">mdi-emoticon-outline</v-icon>
                  </button>
                </template>
                <div class="d-flex pa-1 rounded-pill elevation-3 bg-surface" style="gap: 4px; border: 1px solid rgba(150,150,150,0.2);">
                  <button v-for="(char, zcode) in globalEmojiMap" :key="zcode" class="emoji-picker-btn" @click="handleSendReaction(msg, String(zcode))">
                    {{ char }}
                  </button>
                </div>
              </v-menu>
            </div>
          </div>
        </template>
        <div v-if="!loading && messages.length === 0" class="text-center pa-8 text-grey">Chưa có tin nhắn</div>
      </div>




      <!-- Input -->
      <div class="pa-2 chat-input-area d-flex flex-column" style="gap: 8px;">
        <AiSuggestionPanel
          v-if="showAiPanel"
          :suggestion="aiSuggestion"
          :loading="aiSuggestionLoading"
          :error="aiSuggestionError"
          @generate="$emit('ask-ai')"
          @apply="applySuggestion"
        />

        <!-- Reply preview banner -->
        <div v-if="replyTo" class="reply-preview d-flex align-center px-3 py-2">
          <v-icon size="16" color="primary" class="mr-2">mdi-reply</v-icon>
          <div class="flex-grow-1 text-truncate">
            <span class="text-caption font-weight-bold" style="color: #00F2FF;">{{ replyTo.senderType === 'self' ? 'Bạn' : (replyTo.senderName || 'Người dùng') }}</span>
            <span class="text-caption ml-1" style="opacity: 0.7;">{{ getReplyPreviewText(replyTo) }}</span>
          </div>
          <v-btn icon size="x-small" variant="text" @click="clearReply">
            <v-icon size="16">mdi-close</v-icon>
          </v-btn>
        </div>
        
        <div class="d-flex flex-column justify-end pa-2" style="background: var(--v-theme-surface); border: 1px solid var(--border-glow, rgba(0,242,255,0.2)); border-radius: 12px; position: relative;">
          <QuickTemplatePopup
            ref="popupRef"
            :visible="showTemplatePopup"
            :query="templateQuery"
            :templates="templates"
            :contact="conversation.contact"
            @select="onTemplateSelect"
            @close="showTemplatePopup = false"
          />
          
          <!-- Attachments preview (inside wrapper) -->
          <div v-if="selectedAttachments.length > 0" class="d-flex flex-wrap pa-2 mb-2" style="background: rgba(0,242,255,0.05); border: 1px solid rgba(0,242,255,0.3); border-radius: 8px; gap: 8px;">
            <div v-for="(att, index) in selectedAttachments" :key="index" style="position: relative;">
              <template v-if="att.type === 'image'">
                <img :src="att.base64" style="height: 64px; max-width: 120px; object-fit: contain; border-radius: 8px; border: 1px solid rgba(0,242,255,0.3);" />
              </template>
              <template v-else>
                <div class="d-flex align-center pa-2" style="background: var(--v-theme-surface); border: 1px solid rgba(0,242,255,0.3); border-radius: 8px; width: 220px; max-width: 100%;">
                  <v-icon size="24" color="info" class="mr-2">mdi-file-document</v-icon>
                  <div class="text-truncate pr-3 flex-grow-1">
                    <div class="text-caption font-weight-medium text-truncate">{{ att.filename }}</div>
                    <div class="text-caption text-grey" style="font-size: 10px !important;">{{ formatBytes(att.size) }}</div>
                  </div>
                </div>
              </template>
              <v-btn icon="mdi-close" size="20" color="error" variant="flat" @click="removeAttachment(index)" style="position: absolute; top: -8px; right: -8px;" />
            </div>
          </div>

          <v-textarea
            ref="textareaRef"
            v-model="inputText"
            placeholder="Nhập tin nhắn..."
            variant="plain"
            density="compact"
            hide-details
            auto-grow
            rows="1"
            max-rows="5"
            class="flex-grow-1 custom-textarea-plain px-2"
            @input="onInput"
            @keydown="onInputKeydown"
            @keydown.enter.exact.prevent="handleSend"
          />
          
          <!-- Toolbar -->
          <div class="d-flex align-center mt-1 pt-1" style="border-top: 1px dashed rgba(0,242,255,0.1);">
            <v-btn icon color="primary" variant="text" size="small" :class="{'bg-primary-lighten-5': showAiPanel}" @click="toggleAiPanel">
              <v-icon>mdi-robot-outline</v-icon>
              <v-tooltip activator="parent" location="top" open-delay="200" content-class="custom-tooltip">Bật/tắt Gợi ý AI</v-tooltip>
            </v-btn>
            <v-menu v-model="showEmojiPicker" :close-on-content-click="false" location="top" :offset="10">
              <template v-slot:activator="{ props }">
                <v-btn icon color="grey" variant="text" size="small" class="ml-1" v-bind="props">
                  <v-icon>mdi-emoticon-outline</v-icon>
                  <v-tooltip activator="parent" location="top" open-delay="200" content-class="custom-tooltip">Chèn Emoji</v-tooltip>
                </v-btn>
              </template>
              <div class="v3-emoji-picker-container shadow-elevation-3">
                <EmojiPicker :native="true" class="custom-emoji-picker" @select="onSelectEmoji" />
              </div>
            </v-menu>

            <!-- Sticker Picker -->
            <v-menu v-model="showStickerPopup" :close-on-content-click="false" location="top" :offset="10">
              <template v-slot:activator="{ props }">
                <v-btn icon color="grey" variant="text" size="small" class="ml-1" v-bind="props">
                  <v-icon>mdi-sticker-emoji</v-icon>
                  <v-tooltip activator="parent" location="top" open-delay="200" content-class="custom-tooltip">Chèn Sticker</v-tooltip>
                </v-btn>
              </template>
              <v-card width="320" height="400" class="d-flex flex-column" style="border-radius:12px;border:1px solid rgba(0,242,255,0.2);background:var(--v-theme-surface);">
                <v-card-text class="pa-2 flex-grow-0">
                  <v-text-field v-model="stickerQuery" density="compact" variant="outlined" hide-details placeholder="Tìm sticker..." prepend-inner-icon="mdi-magnify" clearable @update:model-value="onStickerSearch" />
                </v-card-text>
                <div v-if="searchingStickers" class="flex-grow-1 d-flex align-center justify-center">
                  <v-progress-circular indeterminate color="primary" size="24" />
                </div>
                <div v-else-if="stickers.length === 0" class="flex-grow-1 d-flex flex-column align-center justify-center text-grey">
                  <v-icon size="40" class="mb-2">mdi-emoticon-sad-outline</v-icon>
                  <span class="text-caption">Không tìm thấy sticker nào</span>
                </div>
                <v-card-text v-else class="pa-2 flex-grow-1 overflow-y-auto" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;align-content:start;">
                  <div v-for="st in stickers" :key="st.sticker_id" class="sticker-item" @click="sendSticker(st)">
                    <img :src="`https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${st.sticker_id}&size=130`" style="width:100%;height:100%;object-fit:contain;" loading="lazy" />
                  </div>
                </v-card-text>
              </v-card>
            </v-menu>

            <v-btn icon color="grey" variant="text" size="small" class="ml-1" @click="docInputNative?.click()">
              <v-icon>mdi-paperclip</v-icon>
              <v-tooltip activator="parent" location="top" open-delay="200" content-class="custom-tooltip">Đính kèm tệp</v-tooltip>
            </v-btn>
            <v-btn icon color="grey" variant="text" size="small" class="ml-1" @click="fileInputNative?.click()">
              <v-icon>mdi-image-plus</v-icon>
              <v-tooltip activator="parent" location="top" open-delay="200" content-class="custom-tooltip">Đính kèm ảnh</v-tooltip>
            </v-btn>

            <input type="file" ref="docInputNative" accept="*" multiple style="display: none" @change="onDocSelected" />
            <input type="file" ref="fileInputNative" accept="image/png, image/jpeg, image/webp" multiple style="display: none" @change="onFileSelected" />

            <v-spacer />

            <v-btn color="primary" variant="flat" class="px-4 text-none" style="border-radius: 20px;" :loading="sending" :disabled="(!inputText.trim() && selectedAttachments.length === 0)" @click="handleSend">
              Gửi
              <v-icon right size="small" class="ml-1">mdi-send</v-icon>
            </v-btn>
          </div>
        </div>
      </div>
    </template>

    <!-- Image preview dialog -->
    <v-dialog v-model="showImagePreview" max-width="900" content-class="elevation-0">
      <div class="text-center" @click="showImagePreview = false" style="cursor: pointer;">
        <img :src="previewImageUrl" alt="Preview" style="max-width: 100%; max-height: 85vh; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);" />
        <div class="text-caption mt-2" style="color: #aaa;">Nhấn để đóng</div>
      </div>
    </v-dialog>

    <!-- Undo Confirm Dialog -->
    <v-dialog v-model="undoDialog.show" max-width="400">
      <v-card class="bg-surface text-on-surface" style="border: 1px solid rgba(0, 242, 255, 0.2); border-radius: 12px; box-shadow: 0 0 15px rgba(0,242,255,0.1);">
        <v-card-title class="d-flex align-center pt-4 px-4 pb-0">
          <v-icon color="error" class="mr-2">mdi-delete-empty</v-icon>
          <span class="text-h6 font-weight-bold">Thu hồi tin nhắn</span>
        </v-card-title>
        <v-card-text class="pa-4 pt-3 text-body-1" style="opacity: 0.9;">
          Bạn có chắc chắn muốn thu hồi tin nhắn này không? Hành động này không thể hoàn thiện lại được.
        </v-card-text>
        <v-card-actions class="px-4 pb-4 pt-0 justify-end">
          <v-btn variant="plain" class="text-on-surface font-weight-bold mr-2" @click="undoDialog.show = false">HỦY</v-btn>
          <v-btn color="error" variant="flat" :loading="undoDialog.loading" style="border-radius: 8px; font-weight: bold; letter-spacing: 0.5px;" @click="confirmUndo">THU HỒI</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Sync snackbar -->
    <v-snackbar v-model="syncSnack.show" :color="syncSnack.color" timeout="3000">{{ syncSnack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue';
import type { Conversation, Message } from '@/composables/use-chat';
import { api } from '@/api/index';
import AiSuggestionPanel from '@/components/ai/ai-suggestion-panel.vue';
import SpecialMessageRenderer from '@/components/chat/special-message-renderer.vue';
import QuickTemplatePopup from '@/components/chat/quick-template-popup.vue';
import EmojiPicker from 'vue3-emoji-picker';
// @ts-ignore
import 'vue3-emoji-picker/css';

interface TemplateItem {
  id: string;
  name: string;
  content: string;
  category: string | null;
  isPersonal: boolean;
}

const props = defineProps<{
  conversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  showContactPanel?: boolean;
  aiSuggestion: string;
  aiSuggestionLoading: boolean;
  aiSuggestionError: string;
}>();

const emit = defineEmits<{
  (e: 'send', content: string, attachments: any[], sticker?: any, quote?: ReplyQuote): void;
  (e: 'ask-ai'): void;
  (e: 'toggle-contact-panel'): void;
}>();

// ── Reply feature ─────────────────────────────────────────────────────────
interface ReplyQuote {
  zaloMsgId: string;
  uidFrom: string;
  displayName: string;
  textPreview: string;
  msgType: string;
}

const replyTo = ref<Message | null>(null);
const hoveredMsgId = ref<string | null>(null);

function clearReply() {
  replyTo.value = null;
}

function getReplyPreviewText(msg: Message): string {
  if (!msg.content) return '(tin nhắn)';
  if (getStickerUrl(msg)) return '🏷️ Sticker';
  if (getImageUrl(msg)) return '🖼️ Hình ảnh';
  if (getFileInfo(msg)) return '📄 ' + getFileInfo(msg)!.name;
  return parseDisplayContent(msg.content).slice(0, 80) || '(tin nhắn)';
}

function buildReplyQuote(msg: Message): ReplyQuote {
  return {
    zaloMsgId: msg.zaloMsgId || '',
    uidFrom: msg.senderUid || '',
    displayName: msg.senderType === 'self' ? 'Bạn' : (msg.senderName || 'Người dùng'),
    textPreview: getReplyPreviewText(msg),
    msgType: msg.contentType || 'text',
  };
}

function getQuoteData(msg: Message): any | null {
  if (!msg.attachments || !Array.isArray(msg.attachments)) return null;
  const quoteAttach = msg.attachments.find((a: any) => a.type === 'quote');
  return quoteAttach ? quoteAttach.data : null;
}

const globalEmojiMap: Record<string, string> = {
  '/-heart': '❤️', '/-strong': '👍', ':>': '😆', ':o': '😮', ':-((': '😢',
  ':-h': '😡', ':-*': '😘', ":')": '😂'
};

function getReactionSummary(msg: Message) {
  if (!msg.reactions || !Array.isArray(msg.reactions) || msg.reactions.length === 0) return null;

  const emojiMapFallback: Record<string, string> = { ...globalEmojiMap, '/-shit': '💩', '/-rose': '🌹', '/-break': '💔', '/-weak': '👎', ';xx': '😍' };

  const sums: Record<string, number> = {};
  msg.reactions.forEach(r => {
    if (r.reactItem) {
      const e = emojiMapFallback[r.reactItem] || r.reactItem;
      sums[e] = (sums[e] || 0) + 1;
    }
  });

  const uniqueKeys = Object.keys(sums);
  if (uniqueKeys.length === 0) return null;

  // sort to show most used first visually
  uniqueKeys.sort((a, b) => sums[b] - sums[a]);

  return {
    iconPreview: uniqueKeys.slice(0, 3), // return array of strings
    total: msg.reactions.length,
    list: sums
  };
}

const inputText = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const textareaRef = ref<any>(null);

function handleReplyClick(msg: Message) {
  replyTo.value = msg;
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus();
    }
  });
}

const previewImageUrl = ref('');
const showImagePreview = computed({ get: () => !!previewImageUrl.value, set: (v) => { if (!v) previewImageUrl.value = ''; } });
const syncSnack = ref({ show: false, text: '', color: 'success' });
const showAiPanel = ref(false);
const showEmojiPicker = ref(false);

// Group consecutive sticker messages from same sender into a grid group
const groupedMessages = computed(() => {
  const groups: { isStickers: boolean; senderType: string; messages: typeof props.messages }[] = [];
  for (let i = 0; i < props.messages.length; i++) {
    const msg = props.messages[i];
    const isSticker = msg.contentType === 'sticker'
      || (msg.contentType === 'image' && !!(msg.content?.includes('emoticon/sticker') || msg.content?.includes('stickerWebpUrl') || msg.content?.includes('stickerUrl')));
    const last = groups[groups.length - 1];
    if (isSticker && last?.isStickers && last.senderType === msg.senderType) {
      last.messages.push(msg);
    } else {
      groups.push({ isStickers: isSticker, senderType: msg.senderType, messages: [msg] });
    }
  }
  return groups;
});

const showStickerPopup = ref(false);
const stickerQuery = ref('');
const stickers = ref<{sticker_id: number; cate_id: number; type: number}[]>([]);
const searchingStickers = ref(false);
let stickerSearchTimeout: number | null = null;

function onStickerSearch() {
  if (stickerSearchTimeout) clearTimeout(stickerSearchTimeout);
  stickerSearchTimeout = window.setTimeout(() => fetchStickers(), 500);
}

async function fetchStickers() {
  if (!props.conversation?.id) return;
  searchingStickers.value = true;
  try {
    const res = await api.get(`/conversations/${props.conversation.id}/stickers/search?keyword=${encodeURIComponent(stickerQuery.value || 'hi')}`);
    const data = res.data;
    // API returns [{sticker_id, cate_id, type}, ...]
    if (Array.isArray(data)) {
      stickers.value = data.filter((d: any) => d?.sticker_id);
    } else {
      stickers.value = [];
    }
  } catch (e) {
    console.error('Fetch sticker failed:', e);
    stickers.value = [];
  } finally {
    searchingStickers.value = false;
  }
}

watch(showStickerPopup, (val) => {
  if (val && stickers.value.length === 0) fetchStickers();
});

function sendSticker(st: {sticker_id: number; cate_id: number; type: number}) {
  showStickerPopup.value = false;
  const quote = replyTo.value ? buildReplyQuote(replyTo.value) : undefined;
  emit('send', '', [], { id: st.sticker_id, cateId: st.cate_id, type: st.type }, quote);
  clearReply();
}

function onSelectEmoji(emoji: any) {
  inputText.value += emoji.i;
}

function toggleAiPanel() {
  showAiPanel.value = !showAiPanel.value;
  if (showAiPanel.value && !props.aiSuggestion) {
    emit('ask-ai');
  }
}

// Content types handled by SpecialMessageRenderer
const SPECIAL_TYPES = new Set([
  'bank_transfer', 'call', 'qr_code', 'reminder', 'poll', 'note', 'forwarded', 'rich',
]);

function isSpecialType(contentType: string | null | undefined): boolean {
  return !!contentType && SPECIAL_TYPES.has(contentType);
}

/** Safely parse JSON content for SpecialMessageRenderer; returns raw string on failure. */
function parseContent(content: string | null): unknown {
  if (!content) return null;
  try { return JSON.parse(content); } catch { return content; }
}

// --- Template quick-insert ---
const showTemplatePopup = ref(false);
const templateQuery = ref('');
const templates = ref<TemplateItem[]>([]);
const popupRef = ref<InstanceType<typeof QuickTemplatePopup> | null>(null);

async function loadTemplates() {
  try {
    const res = await api.get<{ templates: TemplateItem[] }>('/automation/templates');
    templates.value = res.data.templates;
  } catch {
    // Non-critical — popup shows empty list on failure
  }
}

onMounted(() => { loadTemplates(); });

/** Detect `/` trigger: at start of input or immediately after a space */
function onInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value;
  if (value === '/' || /\s\/$/.test(value)) {
    showTemplatePopup.value = true;
    templateQuery.value = '';
  } else if (showTemplatePopup.value) {
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash === -1) {
      showTemplatePopup.value = false;
    } else {
      templateQuery.value = value.slice(lastSlash + 1);
    }
  }
}

/** Forward arrow/enter/escape keys to popup when open */
function onInputKeydown(e: KeyboardEvent) {
  if (!showTemplatePopup.value) return;
  if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
    popupRef.value?.onKey(e);
  }
}

function onTemplateSelect(rendered: string) {
  const lastSlash = inputText.value.lastIndexOf('/');
  inputText.value = lastSlash >= 0 ? inputText.value.slice(0, lastSlash) + rendered : rendered;
  showTemplatePopup.value = false;
  templateQuery.value = '';
}
// --- End template quick-insert ---

function handleSend() {
  if (showTemplatePopup.value) { showTemplatePopup.value = false; return; }
  if (!inputText.value.trim() && selectedAttachments.value.length === 0) return;
  const quote = replyTo.value ? buildReplyQuote(replyTo.value) : undefined;
  emit('send', inputText.value.trim(), selectedAttachments.value, undefined, quote);
  inputText.value = '';
  clearAttachments();
  clearReply();
}

// --- Upload Image & File ---
interface AttachmentData {
  type: 'image' | 'file';
  filename: string;
  base64: string;
  size: number;
  width?: number; // for image
  height?: number; // for image
}
const fileInputNative = ref<HTMLInputElement | null>(null);
const docInputNative = ref<HTMLInputElement | null>(null);
const selectedAttachments = ref<AttachmentData[]>([]);

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  Array.from(target.files).forEach(file => {
    if (file.size > 50 * 1024 * 1024) {
      syncSnack.value = { show: true, text: `Ảnh ${file.name} quá lớn (tối đa 50MB)`, color: 'error' };
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        selectedAttachments.value.push({
          type: 'image',
          filename: file.name,
          base64,
          width: img.naturalWidth,
          height: img.naturalHeight,
          size: file.size
        });
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
  });
  target.value = ''; // reset input
}

function onDocSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files?.length) return;
  Array.from(target.files).forEach(file => {
    if (file.size > 50 * 1024 * 1024) {
      syncSnack.value = { show: true, text: `File ${file.name} quá lớn (tối đa 50MB)`, color: 'error' };
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      selectedAttachments.value.push({
        type: 'file',
        filename: file.name,
        base64,
        size: file.size
      });
    };
    reader.readAsDataURL(file);
  });
  target.value = ''; // reset input
}

function removeAttachment(index: number) {
  selectedAttachments.value.splice(index, 1);
}

function clearAttachments() {
  selectedAttachments.value = [];
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024, dm = decimals < 0 ? 0 : decimals, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'], i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function applySuggestion() { 
  if (!props.aiSuggestion) return; 
  inputText.value = props.aiSuggestion; 
  showAiPanel.value = false;
}
function formatMessageTime(d: string) { return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }

function openFile(url: string) { 
  if (url) {
    try {
      const oUrl = new URL(url);
      if (oUrl.host.includes('dlfl.vn') || oUrl.host.includes('zalo.me') || oUrl.host.includes('zcloud.vn')) {
        const token = localStorage.getItem('token') || '';
        const proxyUrl = `/api/v1/conversations/${props.conversation?.id}/proxy-file?url=${encodeURIComponent(url)}&token=${token}`;
        window.open(proxyUrl, '_blank');
        return;
      }
    } catch {}
  }
  window.open(url, '_blank'); 
}

/** Extract image URL from JSON content */
function getImageUrl(msg: Message): string | null {
  if (msg.contentType === 'image' && msg.content) {
    if (msg.content.startsWith('http')) return msg.content;
    try { const p = JSON.parse(msg.content); return p.href || p.thumb || p.hdUrl || null; } catch {}
  }
  if (msg.content?.startsWith('{')) {
    try {
      const p = JSON.parse(msg.content);
      const href = p.href || p.thumb || '';
      if (href && /\.(jpg|jpeg|png|webp|gif)/i.test(href)) return href;
      if (href && href.includes('zdn.vn') && !p.params?.includes('fileExt')) return href;
    } catch {}
  }
  return null;
}

/** Extract file info from JSON content (PDF, docs, etc.) */
function getFileInfo(msg: Message): { name: string; size: string; href: string } | null {
  if (!msg.content?.startsWith('{')) return null;
  try {
    const p = JSON.parse(msg.content);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    if (params?.fileExt || params?.fType === 1) {
      const bytes = parseInt(params.fileSize || '0');
      const size = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
      return { name: p.title || `file.${params.fileExt || 'unknown'}`, size, href: p.href || '' };
    }
  } catch {}
  return null;
}

/**
 * Build sticker URL from message content.
 * New messages: backend resolves real URL into stickerUrl field.
 * Old messages (fallback): try Zalo public API emoticon endpoint
 */
function getStickerUrl(msg: Message): string | null {
  const isSticker = msg.contentType === 'sticker'
    || (msg.contentType === 'image' && (msg.content?.includes('emoticon/sticker') || msg.content?.includes('eid=')));
  if (!isSticker) return null;

  try {
    const p = msg.content?.startsWith('{') ? JSON.parse(msg.content) : null;

    // Priority: resolved URLs stored in DB
    if (p?.stickerUrl) return p.stickerUrl;
    if (p?.stickerWebpUrl) return p.stickerWebpUrl;
    if (p?.href) return p.href;
    if (p?.thumb) return p.thumb;

    // Fallback: build URL from numeric ID
    const eid = p?.id ?? p?.stickerId ?? p?.catId;
    if (eid !== undefined && eid !== null) {
      return `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${eid}&size=130`;
    }

    // Raw URL
    if (msg.content?.startsWith('http')) return msg.content;
  } catch {}
  return null;
}

function parseDisplayContent(content: string | null): string {
  if (!content) return '';
  if (!content.startsWith('{')) return content;
  try {
    const p = JSON.parse(content);
    if (p.title && p.href) return `🔗 ${p.title}`;
    if (p.title) return p.title;
    if (p.href) return `🔗 ${p.description || p.href}`;
    return content;
  } catch { return content; }
}

function isReminderMessage(msg: Message): boolean {
  if (!msg.content) return false;
  try { const p = JSON.parse(msg.content); return p.action === 'msginfo.actionlist'; } catch { return false; }
}

function getReminderTitle(msg: Message): string {
  try { return JSON.parse(msg.content!).title || ''; } catch { return msg.content || ''; }
}

function getReminderTime(msg: Message): string | null {
  try {
    const p = JSON.parse(msg.content!);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    for (const h of (params?.highLightsV2 || [])) {
      if (h.ts > 1e12) return new Date(h.ts).toLocaleString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  } catch {}
  return null;
}

/** Sync Zalo reminder to CRM appointments via API */
async function syncAppointment(msg: Message) {
  if (!props.conversation?.contact?.id) { syncSnack.value = { show: true, text: 'Không có thông tin khách hàng', color: 'error' }; return; }
  try {
    const p = JSON.parse(msg.content!);
    const params = typeof p.params === 'string' ? JSON.parse(p.params) : p.params;
    let appointmentDate: string | null = null;
    for (const h of (params?.highLightsV2 || [])) {
      if (h.ts > 1e12) { appointmentDate = new Date(h.ts).toISOString(); break; }
    }
    if (!appointmentDate) { syncSnack.value = { show: true, text: 'Không tìm thấy thời gian hẹn', color: 'warning' }; return; }
    await api.post('/appointments', {
      contactId: props.conversation.contact.id,
      appointmentDate,
      appointmentTime: new Date(appointmentDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      type: 'tai_kham',
      notes: `[Zalo] ${p.title || ''}`,
    });
    syncSnack.value = { show: true, text: 'Đã đồng bộ lịch hẹn thành công!', color: 'success' };
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } };
    syncSnack.value = { show: true, text: e.response?.data?.error || 'Đồng bộ thất bại', color: 'error' };
  }
}

const handleSendReaction = async (msg: Message, zcode: string) => {
  if (!msg.id || !props.conversation?.id) return;
  try {
    await api.post(`/conversations/${props.conversation.id}/messages/${msg.id}/reaction`, { icon: zcode });
  } catch (err) {
    console.error('Lỗi khi thả cảm xúc:', err);
  }
};

const undoDialog = ref({ show: false, loading: false, msgId: '' });

const handleUndoClick = async (msg: Message) => {
  if (!msg.id || !props.conversation?.id) return;
  undoDialog.value = { show: true, loading: false, msgId: msg.id };
};

const confirmUndo = async () => {
  const msgId = undoDialog.value.msgId;
  undoDialog.value.loading = true;
  try {
    await api.post(`/conversations/${props.conversation!.id}/messages/${msgId}/undo`);
    undoDialog.value.show = false;
  } catch (err: any) {
    console.error('Lỗi khi thu hồi tin nhắn:', err);
    syncSnack.value = { show: true, text: err.response?.data?.error || 'Không thể thu hồi tin nhắn', color: 'error' };
  } finally {
    undoDialog.value.loading = false;
  }
};

onMounted(() => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
});

watch(() => props.messages.length, async () => { await nextTick(); if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight; });
</script>

<style scoped>
.message-bubble { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }
.reminder-card { padding: 8px 12px; border-left: 3px solid #FFB74D; border-radius: 8px; background: rgba(255, 183, 77, 0.08); }
.chat-messages-area {
  background: rgba(10, 25, 47, 0.3);
}

.reply-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.2);
  color: #eeeeee;
  cursor: pointer;
  flex-shrink: 0;
  outline: none;
  padding: 0;
  transition: background 0.15s, border-color 0.15s, transform 0.12s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.reply-icon-btn:hover {
  background: rgba(0, 242, 255, 0.3);
  border-color: rgba(0, 242, 255, 0.6);
  color: #ffffff;
  transform: scale(1.1);
  box-shadow: 0 2px 6px rgba(0, 242, 255, 0.3);
}

/* Light mode adjustments */
.v-theme--light .reply-icon-btn {
  border: 1px solid rgba(100, 100, 100, 0.3);
  background: rgba(100, 100, 100, 0.15);
  color: #546E7A;
}

.v-theme--light .reply-icon-btn:hover {
  background: rgba(21, 101, 192, 0.18);
  border-color: rgba(21, 101, 192, 0.5);
  color: #1565C0;
}


.custom-textarea-plain :deep(.v-field__overlay),
.custom-textarea-plain :deep(.v-field__outline) {
  display: none !important;
}
.custom-textarea-plain :deep(.v-field__input) {
  padding-top: 8px;
  padding-bottom: 8px;
  padding-left: 12px !important;
  color: var(--v-theme-on-surface);
}
.file-card { display: flex; align-items: center; padding: 8px 12px; border-radius: 8px; background: rgba(0, 242, 255, 0.05); border: 1px solid rgba(0, 242, 255, 0.1); }
.sticker-img { width: 120px; height: 120px; object-fit: contain; border-radius: 8px; }
.chat-image { max-width: 100%; max-height: 300px; border-radius: 12px; cursor: pointer; transition: transform 0.2s; }
.chat-image:hover { transform: scale(1.02); }
.v3-emoji-picker-container {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(0, 242, 255, 0.2) !important;
}
.custom-emoji-picker {
  height: 350px;
}
.sticker-item:hover {
  background: rgba(0,242,255,0.1);
}

/* Sticker grid in message list */
.sticker-group-grid {
  display: flex;
  flex-wrap: wrap;
  max-width: 440px; /* 4 × 110px */
  gap: 4px;
}
.sticker-group-cell {
  width: 104px;
  height: 104px;
  padding: 2px;
  flex-shrink: 0;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.sticker-group-cell .sticker-img {
  width: 96px !important;
  height: 96px !important;
  object-fit: contain;
}

/* Right-click context menu */
.msg-context-menu {
  position: fixed;
  z-index: 9999;
  background: #1e2a3a;
  border: 1px solid rgba(0, 242, 255, 0.25);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  min-width: 160px;
  overflow: hidden;
  user-select: none;
}

.msg-context-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  font-size: 0.85rem;
  color: rgba(255,255,255,0.85);
  cursor: pointer;
  transition: background 0.15s;
}

.msg-context-item:hover {
  background: rgba(0, 242, 255, 0.12);
  color: #00F2FF;
}

/* Reply preview banner above input */
.reply-preview {
  background: rgba(0, 242, 255, 0.07);
  border-left: 3px solid #00F2FF;
  border-radius: 8px;
  gap: 6px;
}

.reaction-badge {
  position: absolute;
  bottom: -10px;
  display: flex !important;
  align-items: center;
  background-color: var(--v-theme-surface);
  border: 1px solid rgba(150, 150, 150, 0.15);
  border-radius: 20px;
  padding: 2px 6px;
  white-space: nowrap;
  z-index: 2;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
  cursor: pointer;
}
html.v-theme--light .reaction-badge {
  background-color: #fff;
}
.reaction-self {
  right: 12px;
}
.reaction-contact {
  left: 12px;
}
.reaction-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--v-theme-on-surface);
  opacity: 0.7;
  margin-left: 2px;
}
.msg-actions {
  transition: transform 0.2s ease;
}

.action-icon-btn {
  background: var(--v-theme-surface);
  border: 1px solid rgba(150, 150, 150, 0.15);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--v-theme-on-surface);
  opacity: 0.6;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.action-icon-btn:hover {
  opacity: 1;
  background: var(--v-theme-primary);
  color: white;
  border-color: transparent;
}

.emoji-picker-btn {
  background: transparent;
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}
.emoji-picker-btn:hover {
  background: rgba(150,150,150,0.15);
  transform: scale(1.1);
}

</style>

<style>
/* Global styles for tooltips since they teleport outside the component */
.custom-tooltip {
  background-color: rgb(var(--v-theme-on-surface)) !important;
  color: rgb(var(--v-theme-surface)) !important;
  border-radius: 6px;
  overflow: visible !important;
  padding: 4px 8px !important;
  opacity: 0.9 !important;
  font-weight: 500;
}

.custom-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: rgb(var(--v-theme-on-surface)) transparent transparent transparent !important;
  width: 0 !important;
  height: 0 !important;
  background-color: transparent !important;
  display: block;
}
</style>
