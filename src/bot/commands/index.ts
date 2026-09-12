import { Telegraf } from 'telegraf';
import { BotContext } from '../../types/bot.js';
import { setupKeysCommand } from './keys.js';
import { setupModelCommand } from './model.js';
import { setupProviderCommand } from './provider.js';
import { setupStartCommand } from './start.js';

export interface BotCommand {
  command: string;
  description: string;
  setup: (bot: Telegraf<BotContext>, allCommands: BotCommand[]) => void;
}

export const COMMANDS: BotCommand[] = [
  {
    command: 'start',
    description: 'Show this welcome message and list all commands',
    setup: setupStartCommand
  },
  {
    command: 'keys',
    description: 'Manage authentication credentials and login securely',
    setup: (bot) => setupKeysCommand(bot)
  },
  {
    command: 'model',
    description: 'Pick an AI model for your active connection',
    setup: (bot) => setupModelCommand(bot)
  },
  {
    command: 'provider',
    description: 'Switch between your active connections (e.g. API vs CLI)',
    setup: (bot) => setupProviderCommand(bot)
  }
];
