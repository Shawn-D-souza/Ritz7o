import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface ModelOption {
  id: string;
  name: string;
}

export async function fetchGeminiApiModels(apiKey: string): Promise<ModelOption[]> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    if (!data.models || !Array.isArray(data.models)) {
      return [];
    }
    
    return data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => {
        // Remove the 'models/' prefix from the name field if it exists to get the actual ID
        const id = m.name.replace('models/', '');
        return {
          id: id,
          name: m.displayName || id
        };
      });
  } catch (error) {
    console.error('[Model Fetcher] Failed to fetch Gemini API models:', error);
    return [];
  }
}

export async function fetchAgyModels(oauthToken: string): Promise<ModelOption[]> {
  const tempHome = path.join(os.tmpdir(), `agy_fetch_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  
  try {
    // Recreate the file structure agy expects for file-based storage
    const geminiDir = path.join(tempHome, '.gemini', 'antigravity-cli');
    await fs.mkdir(geminiDir, { recursive: true });
    
    // Write the stored oauth token back to the file
    await fs.writeFile(path.join(geminiDir, 'antigravity-oauth-token'), oauthToken, 'utf8');

    // Execute the command with the custom HOME and file storage forced
    const { stdout } = await execAsync('agy models', {
      env: {
        ...process.env,
        HOME: tempHome,
        GEMINI_FORCE_FILE_STORAGE: 'true',
        TZ: 'UTC'
      }
    });

    const lines = stdout.split('\n').filter(line => line.trim() !== '');
    
    return lines.map(line => {
      // The output format is: `model-id    Display Name`
      // We'll split by a tab or at least two spaces to separate the ID from the name
      const parts = line.trim().split(/\t|\s{2,}/);
      const id = parts[0] ?? 'unknown';
      const name = parts.length > 1 ? parts.slice(1).join(' ').trim() : id;
      
      return {
        id,
        name
      };
    });
  } catch (error) {
    console.error('[Model Fetcher] Failed to fetch agy models:', error);
    return [];
  } finally {
    // Always clean up the temporary directory to avoid leaving secrets on disk
    await fs.rm(tempHome, { recursive: true, force: true }).catch(() => {});
  }
}
