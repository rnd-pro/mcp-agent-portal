// @ctx telegram.ctx
import { Telegraf } from 'telegraf';

let bot;
let alertChatId;

export async function init(portalAPI, config) {
  if (!config.token) {
    console.error(`🔴 [TelegramPlugin] Missing bot token in configuration.`);
    return;
  }
  
  bot = new Telegraf(config.token);
  alertChatId = config.alertChatId || null;
  let targetAdapterType = config.adapterType || 'gemini';

  bot.on('text', async (ctx) => {
    let prompt = ctx.message.text;
    let adapter = portalAPI.adapterPool?.acquire(targetAdapterType);
    
    if (!adapter) {
      await ctx.reply(`⚠️ The ${targetAdapterType} agent pool is currently at capacity or disabled.`);
      return;
    }
    
    let statusMsg;
    try {
      statusMsg = await ctx.reply('⏳ Thinking...');
    } catch (e) {
      console.error('Telegram API error on reply:', e);
      portalAPI.adapterPool?.release(adapter);
      return;
    }
    
    try {
      // Execute via the portal's AdapterPool
      const result = await adapter.run({
        prompt: prompt,
        model: config.model || 'auto',
        cwd: process.cwd(),
        timeout: config.timeout || 300
      });
      
      let replyText = result.response || '';
      
      // Telegraf message max length is 4096, but we will just truncate for the alpha if it's too long
      let safeText = replyText.length > 4000 ? replyText.substring(0, 4000) + '...[truncated]' : replyText;
      
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        statusMsg.message_id, 
        null, 
        safeText
      );
    } catch (err) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, 
        statusMsg.message_id, 
        null, 
        `❌ Error: ${err.message}`
      );
    } finally {
      portalAPI.adapterPool?.release(adapter);
    }
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  await bot.launch();
  console.log('✅ [TelegramPlugin] Bot launched and listening.');
}

export async function destroy() {
  if (bot) {
    try {
      bot.stop('Plugin destroyed');
    } catch (e) {}
    bot = null;
  }
}

/**
 * Receive system alerts (crash, error, etc.) and forward to alertChatId.
 * @param {{ type: string, server?: string, message: string }} alert
 */
export function onAlert(alert) {
  if (!bot || !alertChatId) return;
  let text = `⚠️ *Portal Alert*\n\`${alert.type}\`: ${alert.message}`;
  bot.telegram.sendMessage(alertChatId, text, { parse_mode: 'Markdown' }).catch((err) => {
    console.error('[telegram] Failed to send alert:', err.message);
  });
}

export default { init, destroy, onAlert };
