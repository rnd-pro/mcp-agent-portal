import { Telegraf } from 'telegraf';
import { getStateGraph } from '../state-graph.js';

/**
 * Starts the Telegram Gateway, connecting external Telegram users
 * to the internal Agent Pool via the proxyManager.
 * 
 * @param {import('../proxy/mcp-proxy.js').MCPProxyManager} proxyManager 
 */
export function startTelegramGateway(proxyManager) {
  const settings = getStateGraph().getSettings();
  const token = process.env.TELEGRAM_BOT_TOKEN || settings.telegramToken;
  
  if (!token) {
    console.log('[TelegramGateway] TELEGRAM_BOT_TOKEN not set in env or settings. Gateway disabled.');
    return;
  }

  const bot = new Telegraf(token);

  // Map of taskId -> { chatId, messageId, text, lastUpdate }
  const activeTasks = new Map();
  const authorizedChatId = settings.telegramChatId ? String(settings.telegramChatId) : null;

  bot.start((ctx) => {
    if (authorizedChatId && String(ctx.chat.id) !== authorizedChatId) return;
    ctx.reply('👋 Hello! I am the Agent Portal Telegram Gateway.\nSend me a task and I will delegate it to the Agent Pool.');
  });

  bot.on('text', async (ctx) => {
    const tgChatId = ctx.chat.id;
    if (authorizedChatId && String(tgChatId) !== authorizedChatId) {
      console.log(`[TelegramGateway] Ignored message from unauthorized chat: ${tgChatId}`);
      return;
    }

    const prompt = ctx.message.text;

    // Support Telegram Topics (supergroups with message_thread_id)
    let sessionId = `tg_${tgChatId}`;
    if ((ctx.chat.type === 'supergroup' || ctx.chat.type === 'group') && ctx.message.message_thread_id) {
      sessionId = `tg_${tgChatId}_thread_${ctx.message.message_thread_id}`;
    } else if (ctx.chat.type === 'private') {
      sessionId = `tg_${ctx.from.id}`;
    }

    let placeholderMsg;
    try {
      placeholderMsg = await ctx.reply('Thinking...');
    } catch (e) {
      console.error('[TelegramGateway] Failed to send placeholder:', e);
      return;
    }

    try {
      // Delegate to Agent Pool
      const result = await proxyManager.requestFromChild('agent-pool', 'tools/call', {
        name: 'delegate_task',
        arguments: {
          prompt,
          sessionId,
          runner: 'gemini',
        }
      });

      if (result.isError) {
        throw new Error(result.content?.[0]?.text || 'Unknown error');
      }

      // Try to parse taskId from response (e.g. "Dispatched task abc-123")
      const resultText = result.content?.[0]?.text || '';
      const taskMatch = resultText.match(/task ([a-f0-9\-]+)/i) || resultText.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      
      let taskId = null;
      if (taskMatch) {
        taskId = taskMatch[1];
      }

      if (taskId) {
        activeTasks.set(taskId, {
          chatId: tgChatId,
          messageId: placeholderMsg.message_id,
          text: '',
          lastUpdate: Date.now(),
          dirty: false,
        });
        await ctx.telegram.editMessageText(tgChatId, placeholderMsg.message_id, undefined, `Task ${taskId.substring(0, 8)} started...`);
      } else {
        await ctx.telegram.editMessageText(tgChatId, placeholderMsg.message_id, undefined, `Task dispatched:\n${resultText}`);
      }

    } catch (err) {
      await ctx.telegram.editMessageText(tgChatId, placeholderMsg.message_id, undefined, `❌ Failed to delegate task:\n${err.message}`);
    }
  });

  // Listen to multiplexer events to capture streaming updates
  proxyManager.addMultiplexerCallback((serverName, msg) => {
    if (serverName === 'agent-pool' && msg.method === 'notifications/task/event') {
      const { taskId, type, data } = msg.params || {};
      if (taskId && activeTasks.has(taskId)) {
        const taskState = activeTasks.get(taskId);

        if (type === 'chunk' && data) {
          taskState.text += data;
          taskState.dirty = true;
        } else if (type === 'result') {
          taskState.text = `✅ Task Completed:\n\n${data?.response || ''}`;
          taskState.dirty = true;
        } else if (type === 'error') {
          taskState.text = `❌ Task Error:\n\n${data?.error || ''}`;
          taskState.dirty = true;
        }

        // Throttle updates to Telegram to avoid Rate Limits (1 update per 2 seconds max)
        const now = Date.now();
        if (taskState.dirty && (now - taskState.lastUpdate > 2000 || type === 'result' || type === 'error')) {
          taskState.lastUpdate = now;
          taskState.dirty = false;

          let textToSend = taskState.text;
          if (textToSend.length > 4000) {
            textToSend = textToSend.substring(0, 4000) + '...\n[Truncated]';
          }
          if (textToSend.trim() === '') textToSend = 'Running...';

          bot.telegram.editMessageText(taskState.chatId, taskState.messageId, undefined, textToSend).catch(err => {
            if (err.description && err.description.includes('message is not modified')) {
              // Ignore
            } else {
              console.error(`[TelegramGateway] Edit failed for ${taskId}:`, err.message);
            }
          });

          // Cleanup memory if done
          if (type === 'result' || type === 'error') {
            activeTasks.delete(taskId);
          }
        }
      }
    }
  });

  bot.launch().then(() => {
    console.log('[TelegramGateway] Successfully connected to Telegram API');
  }).catch(err => {
    console.error('[TelegramGateway] Failed to launch bot:', err);
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
