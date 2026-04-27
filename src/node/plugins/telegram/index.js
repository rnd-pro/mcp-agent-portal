// @ctx telegram-plugin.ctx
import { Telegraf } from 'telegraf';

let bot;

export async function init(portalAPI, config) {
  if (!config.token) {
    console.error(`🔴 [TelegramPlugin] Missing bot token in configuration.`);
    return;
  }
  
  bot = new Telegraf(config.token);
  const targetAdapterType = config.adapterType || 'gemini';

  bot.on('text', async (ctx) => {
    const prompt = ctx.message.text;
    const adapter = portalAPI.adapterPool?.acquire(targetAdapterType);
    
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
      
      const replyText = result.text || result.toString();
      
      // Telegraf message max length is 4096, but we will just truncate for the alpha if it's too long
      const safeText = replyText.length > 4000 ? replyText.substring(0, 4000) + '...[truncated]' : replyText;
      
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

export default { init, destroy };
