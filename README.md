# Pantheon

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill that pits frontier AI models against each other on your coding tasks. Each model produces a solution, all judge each other anonymously, and the best implementation wins.

```
┌───────┐ ┌─────┐ ┌──────┐
│ Opus  │ │ GPT │ │Gemini│    2-4 models solve in parallel
│  4.6  │ │ 5.2 │ │  3   │    (~60-120s, all concurrent)
└───┬───┘ └──┬──┘ └──┬───┘
    │        │       │
    ▼        ▼       ▼
┌──────────────────────────────────┐
│    CROSS-MODEL EVALUATION        │   Each model judges ALL solutions
│    (anonymized, no self-grading) │   anonymously. Self-scores excluded.
└──────────────┬───────────────────┘
               ▼
         Best solution
         + cherry-picks
         + tech spec
```

## How It Works

1. **You describe a task** — "add bulk actions to the pipeline page"
2. **Pantheon gathers context** — reads your files, conventions, file tree
3. **Your chosen models solve it in parallel** — each produces complete, implementable code
4. **All models judge all solutions anonymously** — scores on precision, accuracy, creativity, simplicity
5. **Self-scores are excluded** — Opus can't grade Opus, GPT can't grade GPT
6. **You review the verdict** — score table, approach summaries, full tech spec, or raw code
7. **You choose what to implement** — winner, runner-up, or cherry-pick the best of each

## Install

```bash
# Clone into your Claude Code skills directory
git clone https://github.com/zachjxyz/pantheon.git ~/.claude/skills/pantheon

# Install dependencies
cd ~/.claude/skills/pantheon/scripts && npm install
```

Or if you prefer keeping the repo separate:

```bash
# Clone wherever you like
git clone https://github.com/zachjxyz/pantheon.git ~/Projects/pantheon

# Symlink into skills
ln -s ~/Projects/pantheon ~/.claude/skills/pantheon

# Install dependencies
cd ~/Projects/pantheon/scripts && npm install
```

## Setup

On first use, Pantheon walks you through a guided setup wizard right inside Claude Code:

1. **Choose a strategy** — The Big Three, Double Trouble +1, Flash Round, or Mix and Match
2. **Select providers** — Anthropic, OpenAI, Google (with models shown as subtext)
3. **Confirm your lineup** — review and optionally swap models
4. **Enter your API key** — one Vercel AI Gateway key for all providers

All models route through [Vercel AI Gateway](https://sdk.vercel.ai/docs/ai-sdk-core/gateway) — one API key, no per-provider keys needed. Get yours at [sdk.vercel.ai/docs/ai-sdk-core/gateway](https://sdk.vercel.ai/docs/ai-sdk-core/gateway).

Config is saved to `~/.claude/pantheon.json`. Reconfigure anytime with `/pantheon models`.

You can also run setup manually in your terminal:

```bash
cd ~/.claude/skills/pantheon/scripts && npx tsx setup.ts
```

## Usage

In any Claude Code session:

```
> /pantheon
> use the pantheon for this
> compete on this task
```

Or just mention it naturally — "summon the pantheon to add a search bar to the accounts page."

### Commands

| Command | What It Does |
|---------|-------------|
| `/pantheon` | Run the full workflow on a task |
| `/pantheon models` | Change your model lineup |

### Review Modes

After the models compete and cross-evaluate, you can review results in several ways:

| Command | What It Shows |
|---------|---------------|
| `rationales` | Each model's approach summary + files touched (compact) |
| `winner` | Full code for the winning solution |
| `spec` | Structured tech spec: overview, files changed, scores, cherry-picks, risks, implementation |
| `all` | Every solution's complete code |
| `{model-name}` | A specific model's solution (e.g., `gpt-5.2`) |
| `spec {model-name}` | Tech spec for a specific model |

## Model Catalog

18 models available across 3 providers and 2 tiers. Pick 2-4 during setup.

### Frontier (latest flagships)

| Model | Provider | Model ID |
|-------|----------|----------|
| Claude Opus 4.6 | Anthropic | `anthropic/claude-opus-4-6` |
| Claude Sonnet 4.5 | Anthropic | `anthropic/claude-sonnet-4-5` |
| Claude Opus 4.5 | Anthropic | `anthropic/claude-opus-4-5` |
| GPT 5.2 | OpenAI | `openai/gpt-5.2` |
| GPT 5.1 | OpenAI | `openai/gpt-5.1` |
| GPT 5 | OpenAI | `openai/gpt-5` |
| Gemini 3 Pro | Google | `google/gemini-3-pro-preview` |
| Gemini 2.5 Pro | Google | `google/gemini-2.5-pro` |
| Gemini 1.5 Pro | Google | `google/gemini-1.5-pro` |

### Flash (fast + cheap)

| Model | Provider | Model ID |
|-------|----------|----------|
| Claude Haiku 4.5 | Anthropic | `anthropic/claude-haiku-4-5` |
| Claude Sonnet 4.0 | Anthropic | `anthropic/claude-sonnet-4-0` |
| Claude Haiku 3.5 | Anthropic | `anthropic/claude-3-5-haiku-latest` |
| GPT 5 Mini | OpenAI | `openai/gpt-5-mini` |
| GPT 4.1 Mini | OpenAI | `openai/gpt-4.1-mini` |
| GPT 4.1 Nano | OpenAI | `openai/gpt-4.1-nano` |
| Gemini 3 Flash | Google | `google/gemini-3-flash-preview` |
| Gemini 2.5 Flash | Google | `google/gemini-2.5-flash` |
| Gemini 2.0 Flash | Google | `google/gemini-2.0-flash` |

Custom models can be added during setup — any model available on AI Gateway works.

## Unbiased Evaluation

The key insight: **no model grades itself**.

```
                   Judges
             Opus   GPT   Gemini
Solutions ┌─────────────────────────┐
  Opus    │  [x]    4.2    3.8    │  avg = 4.0  (2 judges)
  GPT     │  3.5    [x]    4.0    │  avg = 3.75 (2 judges)
  Gemini  │  3.8    3.6    [x]    │  avg = 3.70 (2 judges)
          └─────────────────────────┘
```

Solutions are **anonymized** ("Solution 1", "Solution 2", etc.) before judging. After scoring, the orchestrator maps labels back to models and drops self-scores.

### Scoring Rubric

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| Precision | 35% | Solves the exact problem. No scope creep. |
| Accuracy | 30% | Logic correct. Edge cases handled. Type-safe. |
| Creativity | 20% | Elegant approach. Right abstractions. |
| Simplicity | 15% | Readable. Minimal complexity. Maintainable. |

## Cost

Depends on which models you pick:

| Strategy | Models | Est. Cost/Run | Wall-Clock |
|----------|--------|---------------|------------|
| The Big Three (frontier) | 3 flagships | ~$1.50-2.00 | 60-120s |
| Double Trouble +1 | 3 frontier | ~$1.50-2.00 | 60-120s |
| Flash Round | 3 flash | ~$0.20-0.40 | 20-40s |

## Project Structure

```
pantheon/
├── SKILL.md                     # Claude Code skill definition
├── TECH-SPEC.md                 # Full architecture spec
├── scripts/
│   ├── config.ts                # Config loading/saving (~/.claude/pantheon.json)
│   ├── setup.ts                 # Interactive terminal setup wizard
│   ├── models.ts                # Model management (list/add/remove)
│   ├── solve.ts                 # Parallel dispatch to frontier models
│   ├── evaluate.ts              # Cross-model judging with self-exclusion
│   ├── display.ts               # Output formatting (rationales, spec, code)
│   ├── utils.ts                 # Prompt builders, parser, scorer
│   ├── types.ts                 # Shared TypeScript interfaces
│   ├── providers/
│   │   └── registry.ts          # 18-model catalog + AI Gateway helpers
│   └── package.json             # ai + @ai-sdk/gateway + tsx
└── .gitignore
```

## License

MIT
