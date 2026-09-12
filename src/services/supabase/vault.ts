import { supabaseAdmin } from './client.js';

export async function storeEmployeeKey(telegramId: number, provider: string, authMode: string, apiKey: string): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc('set_employee_secret', {
    p_telegram_id: telegramId,
    p_provider: provider,
    p_auth_mode: authMode,
    p_secret_value: apiKey
  });

  if (error) {
    console.error(`[Vault Error] Failed to store key for ${telegramId}:`, error.message);
    return false;
  }
  return true;
}
