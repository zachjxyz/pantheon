import { readFileSync, writeFileSync } from 'fs';
import { generateText } from 'ai';
import { getModel } from './providers/registry.js';
import { getActiveModels, getApiKey } from './config.js';
import { buildSolvePrompt } from './utils.js';
import type { ContextPackage, SolutionResult, SolutionsFile } from './types.js';

async function main() {
  // 1. Validate API key
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(
      'ERROR: No API key found. Run setup first:\n  cd ~/.claude/skills/pantheon/scripts && npx tsx setup.ts\n\nOr set the environment variable:\n  export AI_GATEWAY_API_KEY=your-key-here',
    );
    process.exit(1);
  }
  // Ensure the env var is set for the gateway SDK
  process.env.AI_GATEWAY_API_KEY = apiKey;

  // 2. Read context
  let ctx: ContextPackage;
  try {
    ctx = JSON.parse(readFileSync('.context.json', 'utf-8'));
  } catch {
    console.error('ERROR: Could not read .context.json. Did Phase 1 run?');
    process.exit(1);
  }

  if (!ctx.task) {
    console.error('ERROR: .context.json has no "task" field.');
    process.exit(1);
  }

  // 3. Get active models from config
  const models = getActiveModels();

  // 4. Build prompt
  const prompt = buildSolvePrompt(ctx);
  console.log(`Dispatching task to ${models.length} models via AI Gateway...`);
  console.log(`Models: ${models.map((m) => m.name).join(', ')}`);
  console.log(`Prompt length: ~${Math.round(prompt.length / 4)} tokens`);

  // 5. Dispatch in parallel via AI Gateway
  const startTime = Date.now();
  const results = await Promise.allSettled(
    models.map(async (model) => {
      const modelStart = Date.now();
      console.log(`  [${model.name}] Starting...`);

      const result = await generateText({
        model: getModel(model.modelId),
        prompt,
        maxTokens: 16384,
      });

      const elapsed = ((Date.now() - modelStart) / 1000).toFixed(1);
      console.log(
        `  [${model.name}] Done in ${elapsed}s (${result.usage?.totalTokens ?? '?'} tokens)`,
      );

      return {
        model: model.name,
        content: result.text,
        tokens: result.usage?.totalTokens ?? 0,
      };
    }),
  );

  // 6. Collect results
  const solutions: SolutionResult[] = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return { ...result.value, status: 'success' as const };
    }
    const err = result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.error(`  [${models[i].name}] FAILED: ${err}`);
    return {
      model: models[i].name,
      content: '',
      tokens: 0,
      status: 'failed' as const,
      error: err,
    };
  });

  const successCount = solutions.filter((s) => s.status === 'success').length;
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  if (successCount < 2) {
    console.error(`\nERROR: Only ${successCount} model(s) succeeded. Need at least 2.`);
    process.exit(1);
  }

  // 7. Write solutions
  const output: SolutionsFile = { solutions };
  writeFileSync('.solutions.json', JSON.stringify(output, null, 2));
  console.log(`\nDone! ${successCount}/${models.length} models succeeded in ${totalTime}s`);
  console.log('Solutions written to .solutions.json');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
