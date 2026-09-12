import { supabaseAdmin } from './client.js';

export async function storeEmployeeKey(telegramId: number, apiKey: string): Promise<boolean> {
  const secretName = `api_key_${telegramId}`;
  
  const { error } = await supabaseAdmin.rpc('set_employee_secret', {
    p_secret_name: secretName,
    p_secret_value: apiKey,
    p_description: `API key for TG user ${telegramId}`
  });

  if (error) {
    console.error(`[Vault Error] Failed to store key for ${telegramId}:`, error.message);
    return false;
  }
  return true;
}
