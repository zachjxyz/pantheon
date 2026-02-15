import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ModelEntry } from './types.js';

export interface PantheonConfig {
  apiKey: string;
  models: ModelEntry[];
}

export const CONFIG_PATH = join(homedir(), '.claude', 'pantheon.json');

const DEFAULT_FALLBACK: ModelEntry[] = [
  { name: 'opus-4.6', modelId: 'anthropic/claude-opus-4-6' },
  { name: 'gpt-5.2', modelId: 'openai/gpt-5.2' },
  { name: 'gemini-3-pro', modelId: 'google/gemini-3-pro-preview' },
];

export function loadConfig(): PantheonConfig | null {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.apiKey === 'string' &&
      Array.isArray(parsed.models) &&
      parsed.models.length >= 2 &&
      parsed.models.every(
        (m: unknown) =>
          typeof m === 'object' &&
          m !== null &&
          typeof (m as ModelEntry).name === 'string' &&
          typeof (m as ModelEntry).modelId === 'string',
      )
    ) {
      return parsed as PantheonConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveConfig(config: PantheonConfig): void {
  const dir = join(homedir(), '.claude');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_PATH, 0o600);
}

export function getActiveModels(): ModelEntry[] {
  const config = loadConfig();
  if (config?.models && config.models.length >= 2) {
    return config.models;
  }
  return DEFAULT_FALLBACK;
}

export function getApiKey(): string | null {
  const config = loadConfig();
  if (config?.apiKey) {
    return config.apiKey;
  }
  return process.env.AI_GATEWAY_API_KEY ?? null;
}

export function isConfigured(): boolean {
  const config = loadConfig();
  return config !== null && !!config.apiKey && config.models.length >= 2;
}
