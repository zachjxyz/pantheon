import type {
  ContextPackage,
  DimensionScores,
  JudgeResult,
  SolutionResult,
} from './types.js';

// --- Prompt Builders ---

export function buildSolvePrompt(ctx: ContextPackage): string {
  const filesFormatted = Object.entries(ctx.files)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  return `You are solving a coding task. Produce a complete, implementable solution.

## Task
${ctx.task}

## Existing Code
${filesFormatted}

## Project Conventions
${ctx.conventions || 'None provided.'}

## File Tree
\`\`\`
${ctx.fileTree}
\`\`\`

## Instructions
- Output complete file contents for every file you create or modify.
- Use this exact format for each file:
  === FILE: path/to/file.ts ===
  (full file content here)
  === END FILE ===
- After all files, write a ## Rationale section (3-5 sentences) explaining your approach, tradeoffs considered, and why this is the right solution.
- Do NOT over-engineer. Solve exactly what was asked.
- Do NOT include test files unless the task specifically asks for tests.
- Do NOT wrap file contents in markdown code fences — the === delimiters are sufficient.`;
}

export function buildEvaluatePrompt(
  ctx: ContextPackage,
  anonymizedSolutions: { label: string; content: string }[],
): string {
  const filesFormatted = Object.entries(ctx.files)
    .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  const solutionsFormatted = anonymizedSolutions
    .map((s) => `### ${s.label}\n${s.content}`)
    .join('\n\n---\n\n');

  return `You are evaluating coding solutions. Score each on the rubric below.

## Original Task
${ctx.task}

## Existing Code Context
${filesFormatted}

## Solutions to Evaluate

${solutionsFormatted}

## Rubric
Score each solution 1-5 (integers only) on:
- Precision (35%): Solves the exact problem. No scope creep. No over/under-solving.
- Accuracy (30%): Logic correct. Edge cases handled. Type-safe. No bugs.
- Creativity (20%): Elegant approach. Right abstractions. Good patterns.
- Simplicity (15%): Readable. Minimal moving parts. Easy to maintain.

## Required Output Format
Respond with ONLY valid JSON, no markdown fences, no explanation before or after:
{
  "scores": [
    {
      "solution": 1,
      "precision": 4,
      "accuracy": 5,
      "creativity": 3,
      "simplicity": 4,
      "notes": "Brief reasoning"
    }
  ],
  "cherry_picks": "Ideas from any solution worth incorporating into the winner",
  "risks": "Any concerns about any solution"
}`;
}

// --- Anonymizer ---

export function shuffleAndAnonymize(
  solutions: SolutionResult[],
): {
  anonymized: { label: string; content: string }[];
  map: Record<string, string>; // "Solution 1" -> model name
} {
  // Fisher-Yates shuffle
  const indices = solutions.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const anonymized: { label: string; content: string }[] = [];
  const map: Record<string, string> = {};

  indices.forEach((origIdx, newIdx) => {
    const label = `Solution ${newIdx + 1}`;
    anonymized.push({ label, content: solutions[origIdx].content });
    map[label] = solutions[origIdx].model;
  });

  return { anonymized, map };
}

// --- Scorer ---

const WEIGHTS = {
  precision: 0.35,
  accuracy: 0.3,
  creativity: 0.2,
  simplicity: 0.15,
};

export function weightedScore(scores: DimensionScores): number {
  return (
    scores.precision * WEIGHTS.precision +
    scores.accuracy * WEIGHTS.accuracy +
    scores.creativity * WEIGHTS.creativity +
    scores.simplicity * WEIGHTS.simplicity
  );
}

export function averageDimensions(
  scoresList: DimensionScores[],
): DimensionScores {
  const n = scoresList.length;
  if (n === 0) {
    return { precision: 0, accuracy: 0, creativity: 0, simplicity: 0 };
  }

  const sum = scoresList.reduce(
    (acc, s) => ({
      precision: acc.precision + s.precision,
      accuracy: acc.accuracy + s.accuracy,
      creativity: acc.creativity + s.creativity,
      simplicity: acc.simplicity + s.simplicity,
    }),
    { precision: 0, accuracy: 0, creativity: 0, simplicity: 0 },
  );

  return {
    precision: round2(sum.precision / n),
    accuracy: round2(sum.accuracy / n),
    creativity: round2(sum.creativity / n),
    simplicity: round2(sum.simplicity / n),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Solution Parser ---

export interface ParsedSolution {
  files: { path: string; content: string }[];
  rationale: string;
}

export function parseSolutionFiles(content: string): ParsedSolution {
  const files: { path: string; content: string }[] = [];
  let rationale = '';

  // Extract === FILE: path === ... === END FILE === blocks
  const fileRegex = /=== FILE:\s*(.+?)\s*===\n([\s\S]*?)(?:=== END FILE ===)/g;
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    files.push({ path: match[1].trim(), content: match[2].trimEnd() });
  }

  // Extract ## Rationale section (everything after the last === END FILE === or ## Rationale header)
  const rationaleMatch = content.match(/##\s*Rationale\s*\n([\s\S]*?)$/);
  if (rationaleMatch) {
    rationale = rationaleMatch[1].trim();
  }

  return { files, rationale };
}

// --- JSON Parser ---

export function parseJudgeResponse(text: string): JudgeResult | null {
  // Try to extract JSON from the response, handling markdown fences
  let jsonStr = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Try to find JSON object
  const objStart = jsonStr.indexOf('{');
  const objEnd = jsonStr.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1) {
    jsonStr = jsonStr.slice(objStart, objEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!Array.isArray(parsed.scores) || parsed.scores.length === 0) {
      return null;
    }

    for (const score of parsed.scores) {
      if (
        typeof score.solution !== 'number' ||
        typeof score.precision !== 'number' ||
        typeof score.accuracy !== 'number' ||
        typeof score.creativity !== 'number' ||
        typeof score.simplicity !== 'number'
      ) {
        return null;
      }
      // Clamp to 1-5
      score.precision = Math.max(1, Math.min(5, Math.round(score.precision)));
      score.accuracy = Math.max(1, Math.min(5, Math.round(score.accuracy)));
      score.creativity = Math.max(1, Math.min(5, Math.round(score.creativity)));
      score.simplicity = Math.max(1, Math.min(5, Math.round(score.simplicity)));
    }

    return {
      scores: parsed.scores,
      cherry_picks: parsed.cherry_picks || '',
      risks: parsed.risks || '',
    };
  } catch {
    return null;
  }
}
