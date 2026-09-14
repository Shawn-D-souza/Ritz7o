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
const start = () => {
  const onLaunch = () => {
    // Log network success using the auto-injected botInfo FIRST so you see it instantly
    console.log(`[Network Success] Orchestrator entrypoint running as @${bot.botInfo?.username}`);

    // Push commands to Telegram for native UI autocomplete in the background
    bot.telegram.setMyCommands(
      COMMANDS.map(c => ({ command: c.command, description: c.description }))
    ).catch(err => console.warn('[Network Warn] Failed to sync commands to Telegram UI:', err));
  };

  try {
    const domain = process.env.WEBHOOK_DOMAIN;
    let launchPromise;
    
    if (domain) {
      const port = parseInt(process.env.PORT || '3000', 10);
      // We use a secret path to prevent unauthorized POST requests
      const hookPath = `/telegraf/${bot.secretPathComponent()}`;
      
      console.log(`[Network Success] Webhook server starting on port ${port} mapping to ${domain}${hookPath}`);
      // Start webhook server using Telegraf's built-in support
      launchPromise = bot.launch({
        webhook: {
          domain,
          hookPath,
          port,
        },
      }, onLaunch);
    } else {
      console.log(`[Network Success] Polling method starting (No WEBHOOK_DOMAIN provided)`);
      // Fallback to long polling if no domain is provided
      launchPromise = bot.launch(onLaunch);
    }

    launchPromise.catch((err) => {
      // Catch fatal errors (like an invalid token) and crash the container
      console.error(`[Network Fatal] Telegram rejected the connection:`, err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
  } catch (err) {
    console.error(`[Network Fatal] Telegram rejected the connection:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
};

start();

// Graceful Shutdown (catches Docker signals)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));