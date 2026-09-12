import { Scenes } from 'telegraf';
import { BotContext } from '../../types/bot.js';
import { storeEmployeeKey } from '../../services/supabase/vault.js';

export const keysWizard = new Scenes.WizardScene<BotContext>(
  'KEYS_WIZARD',
  // Step 1: Prompt
  async (ctx) => {
    await ctx.reply("Please provide your API key. This will be stored securely in the Vault.");
    return ctx.wizard.next();
  },
  // Step 2: Capture and Purge
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply("Invalid input. Please send text.");
      return;
    }

    let apiKey = ctx.message.text;
    const telegramId = ctx.from!.id;

    // Immediately delete the user's message from Telegram chat for security
    try {
      await ctx.deleteMessage(ctx.message.message_id);
    } catch (e) {
      console.warn("Could not delete message. Bot might lack message deletion permissions.");
    }

    const success = await storeEmployeeKey(telegramId, apiKey);

    // Purge reference immediately
    apiKey = '';

    if (success) {
      await ctx.reply("✅ Key securely encrypted and stored.");
    } else {
      await ctx.reply("❌ Failed to store key. Please contact the administrator.");
    }

    return ctx.scene.leave();
  }
);
