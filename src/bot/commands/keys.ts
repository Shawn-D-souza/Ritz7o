import { Telegraf } from 'telegraf';
import { BotContext } from '../../types/bot.js';

export function setupKeysCommand(bot: Telegraf<BotContext>) {
  bot.command('keys', (ctx) => ctx.scene.enter('KEYS_WIZARD'));
}
