import { supabaseAdmin } from './client.js';

export interface EmployeeRouting {
  provider: string;
  auth_mode: string;
  secret_value: string;
  selected_model: string;
  thinking_effort: string;
}

export async function storeEmployeeKey(telegramId: number, provider: string, authMode: string, apiKey: string): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc('set_employee_credential', {
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

export async function getEmployeeActiveRouting(telegramId: number): Promise<EmployeeRouting | null> {
  const { data, error } = await supabaseAdmin.rpc('get_employee_active_routing', {
    p_telegram_id: telegramId
  });

  if (error) {
    console.error(`[Vault Error] Failed to get active routing for ${telegramId}:`, error.message);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as EmployeeRouting;
}

export async function updateEmployeePreferences(telegramId: number, model: string | null, effort: string | null): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc('update_employee_preferences', {
    p_telegram_id: telegramId,
    p_model: model,
    p_effort: effort
  });

  if (error) {
    console.error(`[Vault Error] Failed to update preferences for ${telegramId}:`, error.message);
    return false;
  }
  return true;
}
