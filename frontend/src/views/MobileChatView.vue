<template>
  <div class="mobile-chat h-100 d-flex flex-column">
    <!-- Conversation list (shown when no conversation selected) -->
    <div v-if="!selectedConvId" class="flex-grow-1 overflow-hidden" style="position: relative;">
      <ConversationList
        :conversations="conversations"
        :selected-id="selectedConvId"
        :loading="loadingConvs"
        v-model:search="searchQuery"
        @select="handleSelectConversation"
        @filter-account="onFilterAccount"
      />
    </div>

    <!-- Message thread (shown when conversation selected) -->
    <div v-else class="flex-grow-1 d-flex flex-column overflow-hidden" style="position: relative;">

      <MessageThread
        :conversation="selectedConv"
        :messages="allMessages"
        :loading="loadingMsgs"
        :sending="sendingMsg"
        :show-contact-panel="showContactPanel"
        :ai-suggestion="(null as any)"
        :ai-suggestion-loading="false"
        :ai-suggestion-error="(null as any)"
        show-back
        @back="goBack"
        @toggle-contact-panel="showContactPanel = true"
        @send="handleSend"
        style="flex: 1; min-height: 0;"
      />
    </div>

    <v-navigation-drawer
      v-model="showContactPanel"
      location="right"
      temporary
      width="320"
      class="bg-surface"
    >
      <ChatContactPanel
        v-if="showContactPanel && selectedConv?.contact"
        :contact-id="selectedConv.contact.id"
        :contact="selectedConv.contact"
        :ai-summary="aiSummary"
        :ai-summary-loading="aiSummaryLoading"
        :ai-sentiment="aiSentiment"
        :ai-sentiment-loading="aiSentimentLoading"
        @refresh-ai-summary="generateAiSummary"
        @refresh-ai-sentiment="generateAiSentiment"
        @close="showContactPanel = false"
        @saved="fetchConversations()"
      />
    </v-navigation-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConversationList from '@/components/chat/ConversationList.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import ChatContactPanel from '@/components/chat/ChatContactPanel.vue';
import { useChat } from '@/composables/use-chat';
import { useOfflineQueue } from '@/composables/use-offline-queue';

const route = useRoute();
const router = useRouter();
const {
  conversations, selectedConvId, selectedConv, messages,
  loadingConvs, loadingMsgs, sendingMsg, searchQuery, accountFilter,
  aiSummary, aiSummaryLoading, aiSentiment, aiSentimentLoading,
  fetchConversations, selectConversation, sendMessage, sendMessageTo,
  generateAiSummary, generateAiSentiment,
  initSocket, destroySocket,
} = useChat();

const { pendingMessages, enqueue, flush } = useOfflineQueue();

const showContactPanel = ref(false);

function onFilterAccount(id: string | null) {
  accountFilter.value = id;
  fetchConversations();
}

function handleSelectConversation(id: string) {
  if (id !== selectedConvId.value) {
    selectConversation(id);
    router.push({ query: { convId: id } });
  }
}

function goBack() {
  selectedConvId.value = null;
  router.push({ query: {} });
}

// Merge real messages with pending offline messages
const allMessages = computed(() => {
  const pending = pendingMessages.value
    .filter(p => p.conversationId === selectedConvId.value)
    .map(p => ({
      id: p.id,
      content: p.content,
      contentType: 'text',
      senderType: 'self',
      senderName: null,
      senderUid: null,
      sentAt: p.createdAt,
      isDeleted: false,
      zaloMsgId: null,
      _pending: true,
    }));
  return [...messages.value, ...pending];
});

async function handleSend(content: string, attachments?: any[], sticker?: any, quote?: any) {
  if (!selectedConvId.value) return;
  if (!navigator.onLine) {
    enqueue(selectedConvId.value, content);
    return;
  }
  await sendMessage(content, attachments, sticker, quote);
}

// Flush queue when coming back online
function onOnline() {
  flush(sendMessageTo);
}

onMounted(async () => {
  await fetchConversations();
  initSocket();
  window.addEventListener('online', onOnline);
  
  if (route.query.convId) {
    selectConversation(route.query.convId as string);
  }
});

watch(() => route.query.convId, (newId) => {
  if (newId && newId !== selectedConvId.value) selectConversation(newId as string);
});

onUnmounted(() => {
  destroySocket();
  window.removeEventListener('online', onOnline);
  clearTimeout(searchTimeout);
});

let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchConversations(), 300);
});
</script>
