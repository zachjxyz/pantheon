import { readFileSync } from 'fs';
import { parseSolutionFiles } from './utils.js';
import type { SolutionsFile, EvaluationFile, ContextPackage } from './types.js';

function loadFiles() {
  const solutions: SolutionsFile = JSON.parse(readFileSync('.solutions.json', 'utf-8'));
  let evaluation: EvaluationFile | null = null;
  try {
    evaluation = JSON.parse(readFileSync('.evaluation.json', 'utf-8'));
  } catch {
    // Evaluation may not exist yet
  }
  return { solutions, evaluation };
}

function fileExtension(path: string): string {
  const ext = path.split('.').pop() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    sql: 'sql',
    py: 'python',
  };
  return langMap[ext] || ext;
}

function displaySolution(modelName: string, content: string, score?: number) {
  const parsed = parseSolutionFiles(content);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${modelName}${score !== undefined ? ` (score: ${score})` : ''}`);
  console.log(`  ${parsed.files.length} file(s)`);
  console.log(`${'='.repeat(70)}\n`);

  for (const file of parsed.files) {
    const lang = fileExtension(file.path);
    console.log(`### ${file.path}\n`);
    console.log(`\`\`\`${lang}`);
    console.log(file.content);
    console.log('```\n');
  }

  if (parsed.rationale) {
    console.log(`### Rationale\n`);
    console.log(parsed.rationale);
    console.log('');
  }

  if (parsed.files.length === 0) {
    // Some models don't follow the === FILE === format perfectly — show raw content
    console.log('(Raw output — model did not use expected file format)\n');
    console.log(content.substring(0, 5000));
    if (content.length > 5000) {
      console.log(`\n... (${content.length - 5000} more characters, use model name to see full)`);
    }
    console.log('');
  }
}

function displayRationales(solutions: SolutionsFile, evaluation: EvaluationFile | null) {
  const successful = solutions.solutions.filter((s) => s.status === 'success');
  const rankMap = new Map(evaluation?.ranking.map((r) => [r.model, r.weighted_score]) ?? []);

  console.log('\n## Solution Approaches (rationale only)\n');

  // Sort by score if available
  const sorted = [...successful].sort((a, b) => {
    const scoreA = rankMap.get(a.model) ?? 0;
    const scoreB = rankMap.get(b.model) ?? 0;
    return scoreB - scoreA;
  });

  for (const sol of sorted) {
    const parsed = parseSolutionFiles(sol.content);
    const score = rankMap.get(sol.model);
    const winner = evaluation?.winner === sol.model ? ' [WINNER]' : '';
    const fileList = parsed.files.map((f) => f.path).join(', ');

    console.log(`### ${sol.model}${winner}${score !== undefined ? ` (${score})` : ''}\n`);
    console.log(`**Files:** ${fileList || '(none parsed)'}\n`);
    console.log(parsed.rationale || '(No rationale section found)');
    console.log(`\n${'─'.repeat(50)}\n`);
  }
}

function loadContext(): ContextPackage | null {
  try {
    return JSON.parse(readFileSync('.context.json', 'utf-8'));
  } catch {
    return null;
  }
}

function displaySpec(solutions: SolutionsFile, evaluation: EvaluationFile, modelName?: string) {
  const ctx = loadContext();
  const targetModel = modelName ?? evaluation.winner;
  const sol = solutions.solutions.find((s) => s.model === targetModel);
  if (!sol) {
    console.error(`ERROR: Model "${targetModel}" not found in solutions.`);
    process.exit(1);
  }

  const parsed = parseSolutionFiles(sol.content);
  const rank = evaluation.ranking.find((r) => r.model === targetModel);
  const judges = rank ? Object.keys(rank.scores_by_judge).join(', ') : 'N/A';

  // --- Header ---
  console.log(`# Tech Spec — ${ctx?.task?.split('.')[0] || 'Implementation'}\n`);
  console.log(`**Winner:** ${targetModel} (score: ${rank?.weighted_score ?? '?'}, judged by ${judges})\n`);

  // --- Overview ---
  console.log(`## Overview\n`);
  if (ctx?.task) {
    console.log(ctx.task);
  }
  if (parsed.rationale) {
    console.log(`\n**Approach:** ${parsed.rationale}`);
  }
  console.log('');

  // --- Files Changed ---
  console.log(`## Files Changed\n`);
  console.log(`| File | Action | Description |`);
  console.log(`|------|--------|-------------|`);
  const existingFiles = ctx?.files ? new Set(Object.keys(ctx.files)) : new Set<string>();
  for (const file of parsed.files) {
    const action = existingFiles.has(file.path) ? 'Modified' : '**New**';
    // Extract a one-line summary from the first meaningful line of the file
    const lines = file.content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('import') && !l.trim().startsWith('//') && !l.trim().startsWith("'use"));
    const summary = lines[0]?.trim().substring(0, 80) || '—';
    console.log(`| \`${file.path}\` | ${action} | ${summary} |`);
  }
  console.log('');

  // --- Score Breakdown ---
  if (rank) {
    console.log(`## Score Breakdown\n`);
    console.log(`| Dimension | Weight | Score |`);
    console.log(`|-----------|--------|-------|`);
    console.log(`| Precision | 35% | ${rank.dimension_averages.precision}/5 |`);
    console.log(`| Accuracy | 30% | ${rank.dimension_averages.accuracy}/5 |`);
    console.log(`| Creativity | 20% | ${rank.dimension_averages.creativity}/5 |`);
    console.log(`| Simplicity | 15% | ${rank.dimension_averages.simplicity}/5 |`);
    console.log(`| **Weighted Total** | | **${rank.weighted_score}** |`);
    console.log('');

    // Per-judge scores
    console.log(`### Per-Judge Scores\n`);
    console.log(`| Judge | Precision | Accuracy | Creativity | Simplicity |`);
    console.log(`|-------|-----------|----------|------------|------------|`);
    for (const [judge, scores] of Object.entries(rank.scores_by_judge)) {
      console.log(`| ${judge} | ${scores.precision} | ${scores.accuracy} | ${scores.creativity} | ${scores.simplicity} |`);
    }
    console.log('');
  }

  // --- Runner-up comparison ---
  const others = evaluation.ranking.filter((r) => r.model !== targetModel);
  if (others.length > 0) {
    console.log(`## Runner-Up Comparison\n`);
    console.log(`| Model | Score | Precision | Accuracy | Creativity | Simplicity |`);
    console.log(`|-------|-------|-----------|----------|------------|------------|`);
    console.log(`| **${targetModel}** | **${rank?.weighted_score}** | ${rank?.dimension_averages.precision} | ${rank?.dimension_averages.accuracy} | ${rank?.dimension_averages.creativity} | ${rank?.dimension_averages.simplicity} |`);
    for (const other of others) {
      const otherSol = solutions.solutions.find((s) => s.model === other.model);
      const otherParsed = otherSol ? parseSolutionFiles(otherSol.content) : null;
      const fileCount = otherParsed?.files.length ?? '?';
      console.log(`| ${other.model} (${fileCount} files) | ${other.weighted_score} | ${other.dimension_averages.precision} | ${other.dimension_averages.accuracy} | ${other.dimension_averages.creativity} | ${other.dimension_averages.simplicity} |`);
    }
    console.log('');
  }

  // --- Cherry-picks ---
  if (evaluation.cherry_picks.length > 0) {
    console.log(`## Cherry-Picks\n`);
    for (const pick of evaluation.cherry_picks) {
      console.log(`- ${pick}\n`);
    }
  }

  // --- Risks ---
  if (evaluation.risks.length > 0) {
    console.log(`## Risks\n`);
    for (const risk of evaluation.risks) {
      console.log(`- ${risk}\n`);
    }
  }

  // --- Implementation (file contents) ---
  console.log(`## Implementation\n`);
  for (const file of parsed.files) {
    const lang = fileExtension(file.path);
    const action = existingFiles.has(file.path) ? 'Modified' : 'New file';
    console.log(`### \`${file.path}\` (${action})\n`);
    console.log(`\`\`\`${lang}`);
    console.log(file.content);
    console.log('```\n');
  }
}

function main() {
  const mode = process.argv[2] ?? 'winner';
  const { solutions, evaluation } = loadFiles();

  if (mode === 'spec' || mode === 'techspec' || mode === 'tech-spec') {
    if (!evaluation) {
      console.error('ERROR: No .evaluation.json found. Run evaluate.ts first.');
      process.exit(1);
    }
    // Optional: npx tsx display.ts spec gpt-5.2
    const targetModel = process.argv[3] ?? undefined;
    displaySpec(solutions, evaluation, targetModel);
    return;
  }

  if (mode === 'rationales') {
    displayRationales(solutions, evaluation);
    return;
  }

  if (mode === 'all') {
    const successful = solutions.solutions.filter((s) => s.status === 'success');
    const rankMap = new Map(evaluation?.ranking.map((r) => [r.model, r.weighted_score]) ?? []);
    for (const sol of successful) {
      displaySolution(sol.model, sol.content, rankMap.get(sol.model));
    }
    return;
  }

  if (mode === 'winner') {
    if (!evaluation) {
      console.error('ERROR: No .evaluation.json found. Run evaluate.ts first.');
      process.exit(1);
    }
    const winnerModel = evaluation.winner;
    const sol = solutions.solutions.find((s) => s.model === winnerModel);
    if (!sol) {
      console.error(`ERROR: Winner "${winnerModel}" not found in solutions.`);
      process.exit(1);
    }
    const score = evaluation.ranking.find((r) => r.model === winnerModel)?.weighted_score;
    displaySolution(sol.model, sol.content, score);
    return;
  }

  // Treat mode as a model name
  const sol = solutions.solutions.find((s) => s.model === mode);
  if (!sol) {
    const available = solutions.solutions.map((s) => s.model).join(', ');
    console.error(`ERROR: Model "${mode}" not found. Available: ${available}`);
    process.exit(1);
  }
  const score = evaluation?.ranking.find((r) => r.model === mode)?.weighted_score;
  displaySolution(sol.model, sol.content, score);
}

main();
