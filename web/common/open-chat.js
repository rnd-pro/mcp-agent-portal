import { state as dashState, emit as dashEmit } from '../dashboard-state.js';
import { updateParams } from 'symbiote-ui/ui';

// Focus a chat in the workspace: set the shared active chat, reflect it in the URL params, and
// notify chat-aware panels. Mirrors the selection path used by the chat list so any surface
// (workflow board card action, card inspector) can jump to an agent's chat the same way.
export function openChat(chatId) {
  let id = String(chatId ?? '').trim();
  if (!id) return false;
  dashState.activeChatId = id;
  updateParams({ chat: id });
  dashEmit('active-chat-changed', { id });
  return true;
}
