import { supabaseAdmin } from './client.js';

export interface EmployeeRouting {
  provider: string;
  auth_mode: string;
  secret_value: string;
  selected_model: string;
  thinking_effort: string;
}

export async function storeEmployeeKey(telegramId: number, provider: string, authMode: string, apiKey: string): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc('set_user_key', {
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
  const { data, error } = await supabaseAdmin.rpc('get_active_user_key', {
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

export async function updateEmployeePreferences(telegramId: number, provider: string, authMode: string, model: string | null, effort: string | null): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc('update_user_key_settings', {
    p_telegram_id: telegramId,
    p_provider: provider,
    p_auth_mode: authMode,
    p_model: model,
    p_effort: effort
  });

  if (error) {
    console.error(`[Vault Error] Failed to update preferences for ${telegramId}:`, error.message);
    return false;
  }
  return true;
}

export interface EmployeeCredentialInfo {
  id: string;
  provider: string;
  auth_mode: string;
}

export async function getAvailableProviders(telegramId: number): Promise<EmployeeCredentialInfo[]> {
  const { data, error } = await supabaseAdmin
    .from('user_keys')
    .select('id, provider, auth_mode')
    .eq('telegram_id', telegramId);
    
  if (error) {
    console.error(`[Vault Error] Failed to get available providers for ${telegramId}:`, error.message);
    return [];
  }
  
  return data as EmployeeCredentialInfo[];
}

export async function setActiveProvider(telegramId: number, provider: string, authMode: string): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc('set_active_user_key', {
    p_telegram_id: telegramId,
    p_provider: provider,
    p_auth_mode: authMode
  });
    
  if (error) {
    console.error(`[Vault Error] Failed to set active provider for ${telegramId}:`, error.message);
    return false;
  }
  return true;
}
