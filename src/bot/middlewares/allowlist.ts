import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../../types/bot.js';

// Parse once on startup, not on every message
const ALLOWED_IDS = new Set(
  (process.env.ALLOWED_TELEGRAM_IDS || '').split(',').map(id => parseInt(id.trim(), 10))
);

export const allowlistMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const userId = ctx.from?.id;

  if (!userId || !ALLOWED_IDS.has(userId)) {
    console.warn(`[Security] Unauthorized access attempt from ID: ${userId}`);
    // Silently drop the update. Do not reply to unauthorized users to avoid probing.
    return;
  }

  return next();
};