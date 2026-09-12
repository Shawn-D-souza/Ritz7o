import { Telegraf, Markup } from 'telegraf';
import { BotContext } from '../../types/bot.js';
import { getEmployeeActiveRouting, updateEmployeePreferences } from '../../services/supabase/vault.js';
import { fetchGeminiApiModels, fetchAgyModels } from '../../services/models/fetcher.js';

export function setupModelCommand(bot: Telegraf<BotContext>) {
  bot.command('model', async (ctx) => {
    const telegramId = ctx.from.id;
    
    // Show a loading UI/message
    const loadingMsg = await ctx.reply('⏳ Fetching available models...');

    try {
      const activeRouting = await getEmployeeActiveRouting(telegramId);
      if (!activeRouting) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          '❌ No active credential found. Please run /keys or /provider to authenticate or switch connections.'
        );
        return;
      }

      let models = [];
      if (activeRouting.provider === 'gemini') {
        models = await fetchGeminiApiModels(activeRouting.secret_value);
      } else if (activeRouting.provider === 'agy') {
        models = await fetchAgyModels(activeRouting.secret_value);
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          `❌ Unknown provider: ${activeRouting.provider}`
        );
        return;
      }

      if (models.length === 0) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, 
          loadingMsg.message_id, 
          undefined, 
          '❌ No models found or failed to fetch.'
        );
        return;
      }

      // Create inline keyboard, max 2 columns for better UI
      const buttons = [];
      for (let i = 0; i < models.length; i += 2) {
        const m1 = models[i]!;
        const row = [Markup.button.callback(m1.name, `setmodel_${m1.id}`)];
        if (i + 1 < models.length) {
          const m2 = models[i + 1]!;
          row.push(Markup.button.callback(m2.name, `setmodel_${m2.id}`));
        }
        buttons.push(row);
      }
      // Add a cancel button
      buttons.push([Markup.button.callback('❌ Cancel', 'setmodel_cancel')]);

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        `Choose a model for ${activeRouting.provider}:\n(Currently selected: ${activeRouting.selected_model})`,
        Markup.inlineKeyboard(buttons)
      );

    } catch (error) {
      console.error('[Model Command] Error:', error);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        undefined,
        '❌ An error occurred while fetching models.'
      );
    }
  });

  // Handle the callback query when a model is clicked
  bot.action(/^setmodel_(.+)$/, async (ctx) => {
    const telegramId = ctx.from.id;
    const modelId = ctx.match[1];
    if (!modelId) return;
    
    // Immediately remove buttons when one choice is made
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch (e) {
      console.warn("Could not remove inline keyboard", e);
    }

    if (modelId === 'cancel') {
      await ctx.editMessageText('❌ Model selection cancelled.');
      return;
    }

    const success = await updateEmployeePreferences(telegramId, modelId, null); // Effort is unaffected

    if (success) {
      await ctx.editMessageText(`✅ Active model successfully set to: <b>${modelId}</b>`, { parse_mode: 'HTML' });
    } else {
      await ctx.editMessageText(`❌ Failed to update model preferences in Vault.`);
    }
    await ctx.answerCbQuery();
  });
}
