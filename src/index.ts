import { Telegraf, Scenes, session } from 'telegraf';
import { BotContext } from './types/bot.js';
import { allowlistMiddleware } from './bot/middlewares/allowlist.js';
import { keysWizard } from './bot/wizards/keysWizard.js';
import { COMMANDS } from './bot/commands/index.js';
import { handleChatMessage } from './bot/handlers/chat.js';

// Parse configuration once at the top level
const ALLOWED_IDS = (process.env.ALLOWED_TELEGRAM_IDS || '')
  .split(',')
  .map(id => parseInt(id.trim(), 10))
  .filter(id => !isNaN(id));

const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);

// Setup Wizard
const stage = new Scenes.Stage<BotContext>([keysWizard]);

// Middleware pipeline
bot.use(allowlistMiddleware);
bot.use(session()); // Required for scenes
bot.use(stage.middleware());

// Setup all commands dynamically
for (const cmd of COMMANDS) {
  cmd.setup(bot, COMMANDS);
}

// Handle chat messages
bot.on('text', handleChatMessage);

// Start & Authenticate
bot.launch(async () => {
  // Push commands to Telegram for native UI autocomplete
  await bot.telegram.setMyCommands(
    COMMANDS.map(c => ({ command: c.command, description: c.description }))
  ).catch(err => console.warn('[Network Warn] Failed to sync commands to Telegram UI:', err));
  
  // Log network success using the auto-injected botInfo
  console.log(`[Network Success] Orchestrator entrypoint running as @${bot.botInfo?.username}`);
  
}).catch((err) => {
  // Catch fatal errors (like an invalid token) and crash the container
  console.error(`[Network Fatal] Telegram rejected the connection:`, err.message);
  process.exit(1);
});

// Graceful Shutdown (catches Docker signals)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));