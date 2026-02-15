import { readFileSync, writeFileSync } from 'fs';
import { generateText } from 'ai';
import { getModel } from './providers/registry.js';
import { getActiveModels, getApiKey } from './config.js';
import {
  buildEvaluatePrompt,
  shuffleAndAnonymize,
  parseJudgeResponse,
  weightedScore,
  averageDimensions,
} from './utils.js';
import type {
  ContextPackage,
  SolutionsFile,
  DimensionScores,
  EvaluationFile,
  RankedSolution,
} from './types.js';

async function main() {
  // Ensure the env var is set for the gateway SDK
  const apiKey = getApiKey();
  if (apiKey) {
    process.env.AI_GATEWAY_API_KEY = apiKey;
  }

  // 1. Read inputs
  let ctx: ContextPackage;
  let solFile: SolutionsFile;
  try {
    ctx = JSON.parse(readFileSync('.context.json', 'utf-8'));
    solFile = JSON.parse(readFileSync('.solutions.json', 'utf-8'));
  } catch {
    console.error('ERROR: Could not read .context.json or .solutions.json');
    process.exit(1);
  }

  // Filter to successful solutions only
  const successfulSolutions = solFile.solutions.filter((s) => s.status === 'success');
  if (successfulSolutions.length < 2) {
    console.error('ERROR: Need at least 2 successful solutions to evaluate.');
    process.exit(1);
  }

  // 2. Anonymize
  const { anonymized, map: anonMap } = shuffleAndAnonymize(successfulSolutions);
  console.log('Anonymization map (internal):');
  for (const [label, model] of Object.entries(anonMap)) {
    console.log(`  ${label} → ${model}`);
  }

  // 3. Build judge prompt
  const judgePrompt = buildEvaluatePrompt(ctx, anonymized);

  // 4. Only use models that successfully solved (they also judge)
  const activeModels = getActiveModels();
  const successfulModelNames = new Set(successfulSolutions.map((s) => s.model));
  const judgingModels = activeModels.filter((m) => successfulModelNames.has(m.name));
  console.log(`\nDispatching evaluation to ${judgingModels.length} judges via AI Gateway...`);

  // 5. Dispatch judges in parallel
  const startTime = Date.now();
  const judgeResults = await Promise.allSettled(
    judgingModels.map(async (model) => {
      const modelStart = Date.now();
      console.log(`  [${model.name}] Judging...`);

      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await generateText({
            model: getModel(model.modelId),
            prompt:
              attempt === 0
                ? judgePrompt
                : judgePrompt +
                  '\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY a JSON object, no other text.',
            maxTokens: 4096,
          });

          const parsed = parseJudgeResponse(result.text);
          if (parsed) {
            const elapsed = ((Date.now() - modelStart) / 1000).toFixed(1);
            console.log(`  [${model.name}] Done in ${elapsed}s`);
            return { judgeName: model.name, result: parsed };
          }

          console.warn(
            `  [${model.name}] Attempt ${attempt + 1}: malformed JSON, retrying...`,
          );
          lastError = new Error('Malformed JSON response');
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError;
    }),
  );

  // 6. Collect successful judge results
  const validJudgments = judgeResults
    .filter(
      (r): r is PromiseFulfilledResult<{ judgeName: string; result: NonNullable<ReturnType<typeof parseJudgeResponse>> }> =>
        r.status === 'fulfilled' && r.value.result !== null,
    )
    .map((r) => r.value);

  judgeResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`  [${judgingModels[i].name}] JUDGE FAILED: ${err}`);
    }
  });

  if (validJudgments.length < 2) {
    console.error('\nERROR: Fewer than 2 judges produced valid results.');
    process.exit(1);
  }

  // 7. De-anonymize and exclude self-scores
  const scoresByModel: Record<string, { judge: string; scores: DimensionScores }[]> = {};
  for (const sol of successfulSolutions) {
    scoresByModel[sol.model] = [];
  }

  for (const judgment of validJudgments) {
    for (const score of judgment.result.scores) {
      const solutionLabel = `Solution ${score.solution}`;
      const solutionModel = anonMap[solutionLabel];
      if (!solutionModel) continue;

      // Skip self-scores
      if (judgment.judgeName === solutionModel) {
        console.log(`  Excluding self-score: ${judgment.judgeName} judging ${solutionLabel} (itself)`);
        continue;
      }

      scoresByModel[solutionModel]?.push({
        judge: judgment.judgeName,
        scores: {
          precision: score.precision,
          accuracy: score.accuracy,
          creativity: score.creativity,
          simplicity: score.simplicity,
        },
      });
    }
  }

  // 8. Aggregate and rank
  const ranking: RankedSolution[] = Object.entries(scoresByModel)
    .map(([model, judgeScores]) => {
      const dims = judgeScores.map((j) => j.scores);
      const avg = averageDimensions(dims);
      const scoresByJudge: Record<string, DimensionScores> = {};
      for (const j of judgeScores) {
        scoresByJudge[j.judge] = j.scores;
      }
      return {
        model,
        weighted_score: Math.round(weightedScore(avg) * 100) / 100,
        dimension_averages: avg,
        scores_by_judge: scoresByJudge,
      };
    })
    .sort((a, b) => {
      if (b.weighted_score !== a.weighted_score) return b.weighted_score - a.weighted_score;
      if (b.dimension_averages.precision !== a.dimension_averages.precision)
        return b.dimension_averages.precision - a.dimension_averages.precision;
      return b.dimension_averages.accuracy - a.dimension_averages.accuracy;
    });

  // 9. Collect cherry picks and risks
  const cherryPicks = validJudgments
    .map((j) => j.result.cherry_picks)
    .filter((c) => c && c.trim() !== '' && c.toLowerCase() !== 'none');
  const risks = validJudgments
    .map((j) => j.result.risks)
    .filter((r) => r && r.trim() !== '' && r.toLowerCase() !== 'none');

  // 10. Write evaluation
  const evaluation: EvaluationFile = {
    ranking,
    cherry_picks: cherryPicks,
    risks,
    winner: ranking[0]?.model ?? '',
    anonymization_map: anonMap,
  };

  writeFileSync('.evaluation.json', JSON.stringify(evaluation, null, 2));

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nEvaluation complete in ${totalTime}s`);
  console.log(`Winner: ${evaluation.winner} (${ranking[0]?.weighted_score})`);
  console.log('Results written to .evaluation.json');
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
