import { state as dashState, emit as dashEmit } from '../dashboard-state.js';
import { updateParams } from 'symbiote-ui/ui';

// Section that hosts the full agent-chat view (registerSection('dashboard') -> agent-chat panel).
const CHAT_SECTION = 'dashboard';

function currentSection() {
  return String(globalThis.location?.hash || '')
    .replace(/^#/, '')
    .split('?')[0]
    .split('/')[0];
}

// Focus a chat: set the shared active chat, notify chat-aware panels, and make sure the chat is
// actually visible. On the workflow board the chat dock is collapsed, so set-active alone shows
// nothing — navigate to the dedicated chat view (carrying the chat as a hash param the router reads)
// when we are not already on it. Mirrors the selection path used by the chat list.
export function openChat(chatId) {
  let id = String(chatId ?? '').trim();
  if (!id) return false;
  dashState.activeChatId = id;
  if (currentSection() === CHAT_SECTION) {
    updateParams({ chat: id });
  } else if (globalThis.location) {
    globalThis.location.hash = `${CHAT_SECTION}?chat=${encodeURIComponent(id)}`;
  }
  dashEmit('active-chat-changed', { id });
  return true;
}
