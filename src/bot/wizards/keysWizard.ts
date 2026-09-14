import { Scenes, Markup } from 'telegraf';
import { BotContext } from '../../types/bot.js';
import { storeEmployeeKey } from '../../services/supabase/vault.js';
import { spawn, ChildProcess } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';

// In-memory store for active agy login processes
const activeProcesses = new Map<number, { process: ChildProcess; tempHome: string; isKilled?: boolean }>();

export const keysWizard = new Scenes.WizardScene<BotContext>(
  'KEYS_WIZARD',
  // Step 1: Prompt for authentication method
  async (ctx) => {
    await ctx.reply(
      "How would you like to authenticate?",
      Markup.inlineKeyboard([
        [Markup.button.callback('Gemini API Key', 'auth_api_key')],
        [Markup.button.callback('Gemini CLI (Antigravity)', 'auth_cli')],
        [Markup.button.callback('Quit', 'quit_wizard')]
      ])
    );
    return ctx.wizard.next();
  },
  // Step 2: Handle button choice
  async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      await ctx.reply("Please use the buttons above to select an authentication method.");
      return;
    }

    const choice = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    // Gracefully attempt to clear the inline keyboard to prevent double-clicks
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch (e) {
      console.warn("Could not remove inline keyboard", e);
    }

    if (choice === 'quit_wizard') {
      await ctx.reply("Authentication canceled.");
      return ctx.scene.leave();
    }

    // Store the choice in wizard state
    (ctx.wizard.state as any).authMode = choice;

    if (choice === 'auth_api_key') {
      const msg = await ctx.reply(
        "Please provide your Gemini API key. This will be stored securely in the Vault.",
        Markup.inlineKeyboard([[Markup.button.callback('Quit', 'quit_wizard')]])
      );
      (ctx.wizard.state as any).promptMessageId = msg.message_id;
      return ctx.wizard.next();

    } else if (choice === 'auth_cli') {
      const telegramId = ctx.from!.id;
      
      // Clean up any existing process for this user
      if (activeProcesses.has(telegramId)) {
        const existing = activeProcesses.get(telegramId)!;
        existing.process.kill();
        fs.rm(existing.tempHome, { recursive: true, force: true }).catch(() => {});
        activeProcesses.delete(telegramId);
      }

      const initMsg = await ctx.reply(
        "Initiating secure authentication with Antigravity...",
        Markup.inlineKeyboard([[Markup.button.callback('Quit', 'quit_wizard')]])
      );

      // Use a custom HOME directory to avoid race conditions with other users
      const tempHome = path.join(os.tmpdir(), `agy_auth_${telegramId}_${Date.now()}`);
      await fs.mkdir(tempHome, { recursive: true });

      /**
       * ARCHITECTURE NOTE FOR FUTURE DEVELOPERS / AGENTS (e.g., Claude):
       * We spawn 'script' instead of running 'agy' directly because 'agy' requires
       * a valid TTY (Terminal) to initiate the OAuth flow. The 'script' command wraps
       * the process in a pseudo-terminal. We pass `--print ping` so it exits immediately
       * after authenticating rather than launching an interactive TTY UI.
       * 
       * ENVIRONMENT VARIABLES:
       * - GEMINI_FORCE_FILE_STORAGE: Crucial for headless Docker containers. It short-circuits
       *   the OS keyring check (Apple Keychain/GNOME Keyring) which fails in our container,
       *   and forces the CLI to dump the raw OAuth tokens into a local plaintext file.
       * - TZ=UTC: Workaround for an agy bug where local timezone offsets cause the 
       *   newly written file-storage token to expire immediately.
       */
      const agyProcess = spawn('script', ['-q', '-c', 'agy --print ping', '/dev/null'], {
        env: { 
          ...process.env,
          HOME: tempHome, 
          BROWSER: 'none', 
          NO_BROWSER: '1',
          SSH_CLIENT: '127.0.0.1 22 22',
          SSH_TTY: '/dev/pts/0',
          TERM: 'dumb',
          GEMINI_FORCE_FILE_STORAGE: 'true',
          TZ: 'UTC'
        }
      });

      activeProcesses.set(telegramId, { process: agyProcess, tempHome });

      let urlSent = false;
      let buffer = '';

      // Listen for the Google Sign-in URL on stdout/stderr
      const handleOutput = (data: Buffer) => {
        const output = data.toString();
        buffer += output;

        // agy will print the auth URL directly to stderr
        if (!urlSent && output.includes('http')) {
          const urlMatch = output.match(/https:\/\/[^\s]+/);
          if (urlMatch) {
            // Remove the Quit button from the 'Initiating...' message to prevent duplicates
            ctx.telegram.editMessageReplyMarkup(ctx.chat!.id, initMsg.message_id, undefined, undefined).catch(() => {});
            
            ctx.reply(
              `Please log in using this link:\n\n${urlMatch[0]}\n\nAfter logging in, you will be given an alphanumeric auth code in your browser. Paste that code here.`,
              Markup.inlineKeyboard([[Markup.button.callback('Quit', 'quit_wizard')]])
            ).then(msg => {
              (ctx.wizard.state as any).promptMessageId = msg.message_id;
            }).catch(() => {});
            urlSent = true;
          }
        }
      };

      agyProcess.stdout?.on('data', handleOutput);
      agyProcess.stderr?.on('data', handleOutput);

      agyProcess.on('error', async (err) => {
        console.error(`[Agy Spawn Error] ${err.message}`);
        await ctx.reply(`❌ Failed to initiate authentication process: ${err.message}`);
        fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
        activeProcesses.delete(telegramId);
        try { await ctx.scene.leave(); } catch (e) {}
      });

      agyProcess.on('close', async (code) => {
        const activeData = activeProcesses.get(telegramId);
        if (activeData?.isKilled) return; // Ignore if we killed it intentionally

        if (!urlSent) {
          console.error(`[Agy Spawn Error] Process exited prematurely with code ${code}`);
          await ctx.reply(`❌ Authentication process exited unexpectedly. Ensure the CLI is installed.`);
          fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
          activeProcesses.delete(telegramId);
          try { await ctx.scene.leave(); } catch (e) {}
        }
      });

      return ctx.wizard.next();

    } else {
      await ctx.reply("Unknown selection.");
      return ctx.scene.leave();
    }
  },
  // Step 3: Capture Input and Process
  async (ctx) => {
    const telegramId = ctx.from!.id;

    // Handle Quit button
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery && ctx.callbackQuery.data === 'quit_wizard') {
      await ctx.answerCbQuery();
      try { await ctx.editMessageReplyMarkup(undefined); } catch (e) {}
      
      const activeData = activeProcesses.get(telegramId);
      if (activeData) {
        activeData.isKilled = true;
        activeData.process.kill();
        fs.rm(activeData.tempHome, { recursive: true, force: true }).catch(() => {});
        activeProcesses.delete(telegramId);
      }
      
      await ctx.reply("Authentication canceled.");
      return ctx.scene.leave();
    }

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply("Invalid input. Please send text, or use the Quit button to cancel.");
      return;
    }

    const authMode = (ctx.wizard.state as any).authMode;
    const inputText = ctx.message.text.trim();

    // Immediately delete the user's message from Telegram chat for security
    try {
      await ctx.deleteMessage(ctx.message.message_id);
    } catch (e) {
      console.warn("Could not delete message. Bot might lack message deletion permissions.");
    }

    // Delete the prompt message (which contains the Quit button) to clean up the chat
    const promptMessageId = (ctx.wizard.state as any).promptMessageId;
    if (promptMessageId) {
      try {
        await ctx.deleteMessage(promptMessageId);
      } catch (e) {
        console.warn("Could not delete prompt message.", e);
      }
    }

    if (authMode === 'auth_api_key') {
      try {
        // Send a quick message so the user knows it's being checked
        const validationMsg = await ctx.reply("Validating API key...");

        // Make a lightweight test request to verify the key
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${inputText}`);
        
        // Remove the validation message to keep chat clean
        try {
          await ctx.deleteMessage(validationMsg.message_id);
        } catch (e) {
          // Ignore if unable to delete
        }

        if (!response.ok) {
          await ctx.reply("❌ That API key appears to be invalid or expired. Please try again with a valid key.");
          return ctx.scene.leave();
        }

        // Key is valid, store it
        const success = await storeEmployeeKey(telegramId, 'gemini', 'api_key', inputText);
        if (success) {
          await ctx.reply("✅ API Key verified, securely encrypted, and stored.\n\n⚠️ Important: You must now run the /model command to choose an AI model before you can start chatting.");
        } else {
          await ctx.reply("❌ Failed to store key. Please contact the administrator.");
        }
      } catch (error) {
        console.error(`[API Key Validation Error]`, error);
        await ctx.reply("❌ Network error validating API key. Please try again later.");
      }
      return ctx.scene.leave();

    } else if (authMode === 'auth_cli') {
      const activeData = activeProcesses.get(telegramId);
      if (!activeData) {
        await ctx.reply("Session expired or process not found. Please run the wizard again.");
        return ctx.scene.leave();
      }

      const { process: agyProcess, tempHome } = activeData;

      await ctx.reply("Processing auth code...");

      // Write the auth code to the agy process's stdin
      try {
        agyProcess.stdin!.write(inputText + '\n');
      } catch (err) {
        console.error(`[Agy Stdin Error] ${err}`);
        await ctx.reply("❌ Failed to communicate with authentication process.");
        fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
        activeProcesses.delete(telegramId);
        return ctx.scene.leave();
      }
      
      // Wait for the process to complete and generate the credentials
      return new Promise<void>((resolve) => {
        agyProcess.on('close', async (exitCode) => {
          activeProcesses.delete(telegramId);

          if (exitCode === 0) {
            /**
             * Because we passed GEMINI_FORCE_FILE_STORAGE='true', agy writes the tokens 
             * to 'antigravity-oauth-token' instead of the OS keyring.
             */
            const credPath = path.join(tempHome, '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
            
            try {
              const credContent = await fs.readFile(credPath, 'utf8');
              
              // Route the credential to Supabase via storeEmployeeKey
              const success = await storeEmployeeKey(telegramId, 'agy', 'cli_oauth', credContent);
              
              if (success) {
                await ctx.reply("✅ Authentication successful. Session securely encrypted and stored.\n\n⚠️ Important: You must now run the /model command to choose an AI model before you can start chatting.");
              } else {
                await ctx.reply("❌ Failed to securely store session in Vault. Please contact the administrator.");
              }
            } catch (err) {
              console.error(`[Credential Read Error]`, err);
              await ctx.reply("❌ Failed to read generated credentials. The CLI might have saved it in an unexpected location.");
            }
          } else {
            await ctx.reply(`❌ Authentication failed. Process exited with code ${exitCode}.`);
          }

          // Cleanup temp directory
          await fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
          
          ctx.scene.leave();
          resolve();
        });
      });

    } else {
      await ctx.reply("Unknown state.");
      return ctx.scene.leave();
    }
  }
);
