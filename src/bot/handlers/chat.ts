import { BotContext } from '../../types/bot.js';
import { getEmployeeActiveRouting } from '../../services/supabase/vault.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

async function sendLongMessage(ctx: BotContext, text: string) {
  const MAX_LENGTH = 4000;
  let index = 0;
  while (index < text.length) {
    const chunk = text.slice(index, index + MAX_LENGTH);
    await ctx.reply(chunk);
    index += MAX_LENGTH;
  }
}

export async function handleChatMessage(ctx: BotContext) {
  if (!ctx.message || !('text' in ctx.message)) return;
  
  const telegramId = ctx.from!.id;
  const inputText = ctx.message.text;

  // 1. Get active routing
  const routing = await getEmployeeActiveRouting(telegramId);
  if (!routing) {
    await ctx.reply("You haven't set up an active connection. Use /keys to authenticate.");
    return;
  }

  if (!routing.selected_model) {
    await ctx.reply("You haven't selected a model yet. Use /model to choose one.");
    return;
  }

  // Send typing action
  await ctx.sendChatAction('typing');

  try {
    if (routing.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${routing.selected_model}:generateContent?key=${routing.secret_value}`;
      const payload = {
        contents: [{ parts: [{ text: inputText }] }]
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Gemini API error! status: ${response.status}`);
      }

      const data = await response.json();
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (replyText) {
        await sendLongMessage(ctx, replyText);
      } else {
        await ctx.reply("Received an empty response from the model.");
      }

    } else if (routing.provider === 'agy') {
      const tempHome = path.join(os.tmpdir(), `agy_chat_${Date.now()}_${Math.random().toString(36).substring(7)}`);
      
      try {
        const geminiDir = path.join(tempHome, '.gemini', 'antigravity-cli');
        await fs.mkdir(geminiDir, { recursive: true });
        await fs.writeFile(path.join(geminiDir, 'antigravity-oauth-token'), routing.secret_value, 'utf8');

        const actualModelId = (routing.selected_model.split('\t')[0] || '').trim();
        const args = ['--print', inputText, '--model', actualModelId];
        if (routing.thinking_effort) {
          args.push('--effort', routing.thinking_effort);
        }
        
        const { stdout } = await execFileAsync('agy', args, {
          env: {
            ...process.env,
            HOME: tempHome,
            GEMINI_FORCE_FILE_STORAGE: 'true',
            TZ: 'UTC'
          }
        });

        const replyText = stdout.trim();
        if (replyText) {
          await sendLongMessage(ctx, replyText);
        } else {
          await ctx.reply("Received an empty response from the model.");
        }

      } finally {
        await fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
      }
    } else {
      await ctx.reply("Unsupported provider configuration.");
    }
  } catch (error) {
    console.error(`[Chat Handler Error]`, error);
    await ctx.reply("An error occurred while generating the response. Please try again later.");
  }
}
