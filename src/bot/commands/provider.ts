import { Telegraf, Markup } from 'telegraf';
import { BotContext } from '../../types/bot.js';
import { getAvailableProviders, setActiveProvider, getEmployeeActiveRouting } from '../../services/supabase/vault.js';

export function setupProviderCommand(bot: Telegraf<BotContext>) {
  bot.command('provider', async (ctx) => {
    const telegramId = ctx.from.id;
    
    // Show loading UI
    const loadingMsg = await ctx.reply('⏳ Fetching available connections...');

    try {
      const [providers, activeRouting] = await Promise.all([
        getAvailableProviders(telegramId),
        getEmployeeActiveRouting(telegramId)
      ]);

      if (providers.length === 0) {
         await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          '❌ No connections found. Please run /keys to authenticate.'
        );
        return;
      }

      const buttons = [];
      for (const p of providers) {
        // Highlight active provider
        let label = `${p.provider} (${p.auth_mode})`;
        if (activeRouting && activeRouting.provider === p.provider && activeRouting.auth_mode === p.auth_mode) {
          label += ' ✅';
        }
        buttons.push([Markup.button.callback(label, `setprovider_${p.provider}_${p.auth_mode}`)]);
      }
      
      buttons.push([Markup.button.callback('❌ Cancel', 'setprovider_cancel')]);

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        `Choose an active connection:`,
        Markup.inlineKeyboard(buttons)
      );
    } catch (error) {
      console.error('[Provider Command] Error:', error);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        '❌ An error occurred while fetching connections.'
      );
    }
  });

  bot.action('setprovider_cancel', async (ctx) => {
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch (e) {}
    await ctx.editMessageText('❌ Connection selection cancelled.');
    await ctx.answerCbQuery();
  });

  bot.action(/^setprovider_(.+?)_(.+)$/, async (ctx) => {
    const telegramId = ctx.from.id;
    const provider = ctx.match[1];
    const authMode = ctx.match[2];
    if (!provider || !authMode) return;
    
    // Remove buttons immediately when choice is made
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch (e) {}

    const success = await setActiveProvider(telegramId, provider, authMode);

    if (success) {
      await ctx.editMessageText(`✅ Active connection successfully switched! Use /model to pick a model.`);
    } else {
      await ctx.editMessageText(`❌ Failed to switch connection in Vault.`);
    }
    await ctx.answerCbQuery();
  });
}
