import * as readline from 'readline';
import { MODEL_CATALOG } from './providers/registry.js';
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

function listModels() {
  console.log('\n  Pantheon Model Catalog\n');
  let n = 1;
  let lastProvider = '';
  const allModels = MODEL_CATALOG.flatMap((g) => g.models);
  const maxNameLen = Math.max(...allModels.map((m) => m.name.length));

  for (const group of MODEL_CATALOG) {
    if (group.provider !== lastProvider) {
      if (lastProvider) console.log('');
      console.log(`  ${group.provider}`);
      lastProvider = group.provider;
    }
    for (const model of group.models) {
      const pad = ' '.repeat(maxNameLen - model.name.length + 2);
      console.log(`    ${String(n).padStart(2)}. ${model.name}${pad}${model.modelId}  [${group.tier}]`);
      n++;
    }
  }

  const config = loadConfig();
  if (config) {
    console.log(`\n  Active: ${config.models.map((m) => m.name).join(', ')}`);
    const customs = config.models.filter(
      (m) => !MODEL_CATALOG.flatMap((g) => g.models).some((c) => c.name === m.name),
    );
    if (customs.length) {
      console.log(`  Custom: ${customs.map((m) => `${m.name} (${m.modelId})`).join(', ')}`);
    }
  }
  console.log();
}

function addModel(modelId: string) {
  const config = loadConfig();
  if (!config) {
    console.log('\n  No config found. Run setup first:\n    cd ~/.claude/skills/pantheon/scripts && npx tsx setup.ts\n');
    return;
  }
  if (!modelId.includes('/')) {
    console.log('\n  Invalid format. Must be provider/model-id (e.g. xai/grok-3)\n');
    return;
  }
  if (config.models.some((m) => m.modelId === modelId)) {
    console.log(`\n  ${modelId} is already configured.\n`);
    return;
  }
  if (config.models.length >= 4) {
    console.log('\n  Maximum 4 models. Remove one first.\n');
    return;
  }
  const name = modelId.split('/').pop() ?? modelId;
  config.models.push({ name, modelId });
  saveConfig(config);
  console.log(`\n  Added: ${name} (${modelId})`);
  console.log(`  Active: ${config.models.map((m) => m.name).join(', ')}\n`);
}

function removeModel(name: string) {
  const config = loadConfig();
  if (!config) {
    console.log('\n  No config found.\n');
    return;
  }
  const idx = config.models.findIndex((m) => m.name === name);
  if (idx === -1) {
    console.log(`\n  "${name}" not found. Current: ${config.models.map((m) => m.name).join(', ')}\n`);
    return;
  }
  if (config.models.length <= 2) {
    console.log('\n  Cannot remove — minimum 2 models required.\n');
    return;
  }
  config.models.splice(idx, 1);
  saveConfig(config);
  console.log(`\n  Removed: ${name}`);
  console.log(`  Active: ${config.models.map((m) => m.name).join(', ')}\n`);
}

async function main() {
  const args = process.argv.slice(2);

  // Subcommands (non-interactive)
  if (args[0] === 'list') {
    listModels();
    rl.close();
    return;
  }
  if (args[0] === 'add' && args[1]) {
    addModel(args[1]);
    rl.close();
    return;
  }
  if (args[0] === 'remove' && args[1]) {
    removeModel(args[1]);
    rl.close();
    return;
  }

  // Interactive mode
  console.log('\n┌─────────────────────────────────────┐');
  console.log('│       Pantheon Model Selection       │');
  console.log('└─────────────────────────────────────┘');

  const existing = loadConfig();
  if (existing) {
    console.log(`\n  Current models: ${existing.models.map((m) => m.name).join(', ')}`);
  }

  const { numbered, total } = printCatalog();

  // Build default from existing config
  const existingNames = (existing?.models ?? []).map((m) => m.name);
  const defaultNums: number[] = [];
  for (const [num, model] of numbered) {
    if (existingNames.includes(model.name)) defaultNums.push(num);
  }
  const defaultStr = defaultNums.length >= 2 ? defaultNums.join(',') : '1,7,13';

  let models: ModelEntry[] = [];
  while (true) {
    const input = await ask(`\n  Select models [${defaultStr}]: `);
    const raw = input.trim() || defaultStr;
    const nums = parseSelections(raw, total);
    const unique = [...new Set(nums)];
    models = unique.map((n) => numbered.get(n)).filter((m): m is ModelEntry => !!m);

    if (models.length < 2) {
      console.log('  Need at least 2 models. Try again.');
      continue;
    }
    if (models.length > 4) {
      console.log('  Maximum 4 models. Try again.');
      continue;
    }
    break;
  }

  // Custom model input
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

  // Preserve existing API key, or prompt if none exists
  let apiKey = existing?.apiKey ?? '';
  if (!apiKey) {
    while (!apiKey) {
      const input = await ask('\n  AI Gateway API Key: ');
      apiKey = input.trim();
      if (!apiKey) {
        console.log('  API key is required. Get yours at https://sdk.vercel.ai/docs/ai-sdk-core/gateway');
      }
    }
  }

  saveConfig({ apiKey, models });

  console.log(`\n  Models updated: ${models.map((m) => m.name).join(', ')}`);
  console.log(`  Config saved to ${CONFIG_PATH}\n`);

  rl.close();
}

main().catch((e) => {
  console.error('Error:', e);
  rl.close();
  process.exit(1);
});
