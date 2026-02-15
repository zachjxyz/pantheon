import { gateway } from '@ai-sdk/gateway';
import type { ModelEntry } from '../types.js';
import { getActiveModels, getApiKey } from '../config.js';
export { getActiveModels, getApiKey, loadConfig, saveConfig, isConfigured } from '../config.js';

// Full model catalog — 18 models across 3 providers, frontier + flash tiers.
// Model IDs use AI Gateway format: 'provider/model-id'

export interface ModelGroup {
  provider: string;
  tier: 'frontier' | 'flash';
  models: ModelEntry[];
}

export const MODEL_CATALOG: ModelGroup[] = [
  // ── Anthropic ──────────────────────────────────────────
  {
    provider: 'Anthropic',
    tier: 'frontier',
    models: [
      { name: 'opus-4.6', modelId: 'anthropic/claude-opus-4-6' },
      { name: 'sonnet-4.5', modelId: 'anthropic/claude-sonnet-4-5' },
      { name: 'opus-4.5', modelId: 'anthropic/claude-opus-4-5' },
    ],
  },
  {
    provider: 'Anthropic',
    tier: 'flash',
    models: [
      { name: 'haiku-4.5', modelId: 'anthropic/claude-haiku-4-5' },
      { name: 'sonnet-4.0', modelId: 'anthropic/claude-sonnet-4-0' },
      { name: 'haiku-3.5', modelId: 'anthropic/claude-3-5-haiku-latest' },
    ],
  },
  // ── OpenAI ─────────────────────────────────────────────
  {
    provider: 'OpenAI',
    tier: 'frontier',
    models: [
      { name: 'gpt-5.2', modelId: 'openai/gpt-5.2' },
      { name: 'gpt-5.1', modelId: 'openai/gpt-5.1' },
      { name: 'gpt-5', modelId: 'openai/gpt-5' },
    ],
  },
  {
    provider: 'OpenAI',
    tier: 'flash',
    models: [
      { name: 'gpt-5-mini', modelId: 'openai/gpt-5-mini' },
      { name: 'gpt-4.1-mini', modelId: 'openai/gpt-4.1-mini' },
      { name: 'gpt-4.1-nano', modelId: 'openai/gpt-4.1-nano' },
    ],
  },
  // ── Google ─────────────────────────────────────────────
  {
    provider: 'Google',
    tier: 'frontier',
    models: [
      { name: 'gemini-3-pro', modelId: 'google/gemini-3-pro-preview' },
      { name: 'gemini-2.5-pro', modelId: 'google/gemini-2.5-pro' },
      { name: 'gemini-1.5-pro', modelId: 'google/gemini-1.5-pro' },
    ],
  },
  {
    provider: 'Google',
    tier: 'flash',
    models: [
      { name: 'gemini-3-flash', modelId: 'google/gemini-3-flash-preview' },
      { name: 'gemini-2.5-flash', modelId: 'google/gemini-2.5-flash' },
      { name: 'gemini-2.0-flash', modelId: 'google/gemini-2.0-flash' },
    ],
  },
];

// Default selection: one flagship per provider
export const DEFAULT_SELECTION = ['opus-4.6', 'gpt-5.2', 'gemini-3-pro'];

// Flat list for lookups
const ALL_CATALOG_MODELS = MODEL_CATALOG.flatMap((g) => g.models);

export function findModelByName(name: string): ModelEntry | undefined {
  return ALL_CATALOG_MODELS.find((m) => m.name === name);
}

export function getModel(modelId: string) {
  return gateway(modelId);
}

export function validateApiKey(): string | null {
  const key = getApiKey();
  if (!key) {
    return 'No API key found. Run setup first:\n  cd ~/.claude/skills/pantheon/scripts && npx tsx setup.ts\n\nOr set the env var:\n  export AI_GATEWAY_API_KEY=your-key-here';
  }
  process.env.AI_GATEWAY_API_KEY = key;
  return null;
}
