import { Telegraf } from 'telegraf';
import { BotContext } from '../../types/bot.js';
import { BotCommand } from './index.js';

export function setupStartCommand(bot: Telegraf<BotContext>, commands: BotCommand[]) {
  bot.command('start', (ctx) => {
    let message = 'Welcome to Ritz7o! Here are the available commands:\n\n';
    
    for (const cmd of commands) {
      message += `/${cmd.command} - ${cmd.description}\n`;
    }
    
    return ctx.reply(message);
  });
}
