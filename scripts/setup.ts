import * as readline from 'readline';
import { MODEL_CATALOG, findModelByName } from './providers/registry.js';
import { loadConfig, saveConfig, CONFIG_PATH } from './config.js';
import type { ModelEntry } from './types.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function printCatalog(): { numbered: Map<number, ModelEntry>; total: number } {
  const numbered = new Map<number, ModelEntry>();
  let n = 1;

  console.log('\n  Available models (pick 2-4):\n');

  let lastProvider = '';
  for (const group of MODEL_CATALOG) {
    if (group.provider !== lastProvider) {
      if (lastProvider) console.log('');
      console.log(`  ${group.provider}`);
      lastProvider = group.provider;
    }
    for (const model of group.models) {
      const tier = group.tier === 'frontier' ? 'frontier' : 'flash';
      const num = String(n).padStart(4);
      const name = model.name.padEnd(20);
      const id = model.modelId.padEnd(38);
      console.log(`  ${num}. ${name} ${id} [${tier}]`);
      numbered.set(n, model);
      n++;
    }
  }

  return { numbered, total: n - 1 };
}

function parseSelections(input: string, total: number): number[] {
  return input
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= total);
}

async function selectModels(numbered: Map<number, ModelEntry>, total: number, existing: ModelEntry[]): Promise<ModelEntry[]> {
  const existingNames = existing.map((m) => m.name);
  const defaultNums: number[] = [];
  for (const [num, model] of numbered) {
    if (existingNames.includes(model.name)) defaultNums.push(num);
  }
  const defaultStr = defaultNums.length >= 2 ? defaultNums.join(',') : '1,7,13';

  while (true) {
    const input = await ask(`\n  Select models [${defaultStr}]: `);
    const raw = input.trim() || defaultStr;
    const nums = parseSelections(raw, total);
    const unique = [...new Set(nums)];
    const models = unique.map((n) => numbered.get(n)).filter((m): m is ModelEntry => !!m);

    if (models.length < 2) {
      console.log('  Need at least 2 models. Try again.');
      continue;
    }
    if (models.length > 4) {
      console.log('  Maximum 4 models. Try again.');
      continue;
    }
    return models;
  }
}

async function addCustomModels(selected: ModelEntry[]): Promise<ModelEntry[]> {
  const models = [...selected];

  while (models.length < 4) {
    const input = await ask('\n  Add a custom model? (provider/model-id or Enter to skip): ');
    const trimmed = input.trim();
    if (!trimmed) break;

    if (!trimmed.includes('/')) {
      console.log('  Model ID must be in provider/model-id format (e.g., xai/grok-3).');
      continue;
    }

    if (models.some((m) => m.modelId === trimmed)) {
      console.log('  That model is already selected.');
      continue;
    }

    const name = trimmed.split('/').pop() ?? trimmed;
    models.push({ name, modelId: trimmed });
    console.log(`  Added: ${name} (${trimmed})`);

    if (models.length >= 4) {
      console.log('  Maximum 4 models reached.');
      break;
    }
  }

  return models;
}

async function getApiKeyInput(existing: string | undefined): Promise<string> {
  const mask = existing ? `[${existing.slice(0, 6)}...${existing.slice(-4)}]` : '';

  while (true) {
    const prompt = mask
      ? `\n  AI Gateway API Key ${mask}: `
      : '\n  AI Gateway API Key: ';
    const input = await ask(prompt);
    const trimmed = input.trim();

    if (!trimmed && existing) return existing;
    if (trimmed) return trimmed;

    console.log('  API key is required. Get yours at https://sdk.vercel.ai/docs/ai-sdk-core/gateway');
  }
}

async function main() {
  console.log('\n┌─────────────────────────────────────┐');
  console.log('│         Pantheon Setup               │');
  console.log('└─────────────────────────────────────┘');

  const existing = loadConfig();
  if (existing) {
    console.log(`\n  Existing config found. Current models: ${existing.models.map((m) => m.name).join(', ')}`);
  }

  const { numbered, total } = printCatalog();

  let models = await selectModels(numbered, total, existing?.models ?? []);
  models = await addCustomModels(models);

  console.log(`\n  Selected: ${models.map((m) => m.name).join(', ')}`);

  const apiKey = await getApiKeyInput(existing?.apiKey);

  saveConfig({ apiKey, models });

  console.log(`\n  Config saved to ${CONFIG_PATH}`);
  console.log(`  Pantheon ready — ${models.length} models configured.\n`);

  rl.close();
}

main().catch((e) => {
  console.error('Setup error:', e);
  rl.close();
  process.exit(1);
});
