export interface ContextPackage {
  task: string;
  files: Record<string, string>;
  conventions: string;
  fileTree: string;
}

export interface ModelEntry {
  name: string;
  modelId: string; // AI Gateway format: 'provider/model-id'
}

export interface SolutionResult {
  model: string;
  content: string;
  tokens: number;
  status: 'success' | 'failed';
  error?: string;
}

export interface SolutionsFile {
  solutions: SolutionResult[];
}

export interface DimensionScores {
  precision: number;
  accuracy: number;
  creativity: number;
  simplicity: number;
}

export interface SolutionScore extends DimensionScores {
  solution: number;
  notes: string;
}

export interface JudgeResult {
  scores: SolutionScore[];
  cherry_picks: string;
  risks: string;
}

export interface RankedSolution {
  model: string;
  weighted_score: number;
  dimension_averages: DimensionScores;
  scores_by_judge: Record<string, DimensionScores>;
}

export interface EvaluationFile {
  ranking: RankedSolution[];
  cherry_picks: string[];
  risks: string[];
  winner: string;
  anonymization_map: Record<string, string>;
}
