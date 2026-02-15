---
name: pantheon
description: Summon the Pantheon — dispatch a task to multiple frontier models in parallel (Opus, GPT, Gemini, and more), cross-evaluate with no self-grading, and implement the best solution. Use when user says "pantheon", "compete on this", "multi-model", or "/pantheon". For model management, use "/pantheon models".
allowed-tools: Bash(pantheon:*)
---

# Pantheon

A council of frontier models deliberates on your task. Each produces a solution, all judge each other anonymously, and the best implementation rises to the top.

## When to Use

- Complex implementation tasks where solution quality matters
- Tasks with multiple valid approaches
- When the user explicitly requests the pantheon

Do NOT use for trivial tasks (typo fixes, one-line changes, simple renames).

## Model Management (`/pantheon models`)

If the user says "/pantheon models", asks to change models, or wants to see available models, run the same guided wizard from Phase 0 (skip the API key step if one already exists in the config). Write the updated config to `~/.claude/pantheon.json` using the Write tool, preserving the existing `apiKey`.

## Workflow

### Phase 0: Setup Check

Before anything else, check if Pantheon is configured:

1. Try to read `~/.claude/pantheon.json` using the Read tool
2. If the file exists and contains a valid `apiKey` (non-empty string) and `models` array (2+ entries each with `name` and `modelId`), proceed to Phase 1

If the config is missing or invalid, run the setup wizard conversationally. Use AskUserQuestion for each step.

---

**Step 1 — Choose a strategy**

Use AskUserQuestion with these options:

| Option | Label | Description |
|--------|-------|-------------|
| 1 | The Big Three (Recommended) | One flagship per provider. Best diversity. ~$2/run |
| 2 | Double Trouble +1 | Go deep on one provider + a wildcard. ~$2/run |
| 3 | Flash Round | Fast & cheap flash models. ~$0.30/run |
| 4 | Mix and Match | Hand-pick any 2-4 from the full catalog |

---

**Step 2 — Select providers / models** (depends on strategy)

**If "The Big Three":**

Use AskUserQuestion with `multiSelect: true`. The user picks 2-3 providers. Each option shows the flagship model as subtext:

| Option | Label | Description |
|--------|-------|-------------|
| 1 | Anthropic | Opus 4.6 (anthropic/claude-opus-4-6) |
| 2 | OpenAI | GPT 5.2 (openai/gpt-5.2) |
| 3 | Google | Gemini 3 Pro (google/gemini-3-pro-preview) |

Auto-load the top frontier model from each selected provider. Model mapping:
- Anthropic → `{ "name": "opus-4.6", "modelId": "anthropic/claude-opus-4-6" }`
- OpenAI → `{ "name": "gpt-5.2", "modelId": "openai/gpt-5.2" }`
- Google → `{ "name": "gemini-3-pro", "modelId": "google/gemini-3-pro-preview" }`

If the user selects fewer than 2, ask them to pick at least 2.

**If "Double Trouble +1":**

First AskUserQuestion — "Which provider to double up on?":

| Option | Label | Description |
|--------|-------|-------------|
| 1 | Anthropic | Opus 4.6 + Sonnet 4.5 |
| 2 | OpenAI | GPT 5.2 + GPT 5.1 |
| 3 | Google | Gemini 3 Pro + Gemini 2.5 Pro |

Then second AskUserQuestion — "Which provider for the +1?" Show only the remaining 2 providers with their flagship as subtext.

Model mapping for the "double" provider (top 2 frontier):
- Anthropic → opus-4.6 (`anthropic/claude-opus-4-6`) + sonnet-4.5 (`anthropic/claude-sonnet-4-5`)
- OpenAI → gpt-5.2 (`openai/gpt-5.2`) + gpt-5.1 (`openai/gpt-5.1`)
- Google → gemini-3-pro (`google/gemini-3-pro-preview`) + gemini-2.5-pro (`google/gemini-2.5-pro`)

Model mapping for the "+1" provider (top 1 frontier):
- Anthropic → opus-4.6 (`anthropic/claude-opus-4-6`)
- OpenAI → gpt-5.2 (`openai/gpt-5.2`)
- Google → gemini-3-pro (`google/gemini-3-pro-preview`)

**If "Flash Round":**

Use AskUserQuestion with `multiSelect: true`. The user picks 2-3 providers:

| Option | Label | Description |
|--------|-------|-------------|
| 1 | Anthropic | Haiku 4.5 (anthropic/claude-haiku-4-5) |
| 2 | OpenAI | GPT 5 Mini (openai/gpt-5-mini) |
| 3 | Google | Gemini 3 Flash (google/gemini-3-flash-preview) |

Model mapping:
- Anthropic → `{ "name": "haiku-4.5", "modelId": "anthropic/claude-haiku-4-5" }`
- OpenAI → `{ "name": "gpt-5-mini", "modelId": "openai/gpt-5-mini" }`
- Google → `{ "name": "gemini-3-flash", "modelId": "google/gemini-3-flash-preview" }`

If the user selects fewer than 2, ask them to pick at least 2.

**If "Mix and Match":**

Show the full catalog by running:

```bash
cd ~/.claude/skills/pantheon/scripts && npx tsx models.ts list
```

Then ask the user to pick 2-4 models by number or name. They can also provide a custom model ID in `provider/model-id` format. For custom models, the name is the part after `/` (e.g., `xai/grok-3` → name: `grok-3`).

---

**Step 3 — Confirm lineup**

Present the selected models in a clear summary, e.g.:

> Your Pantheon lineup:
> - **Opus 4.6** — anthropic/claude-opus-4-6
> - **GPT 5.2** — openai/gpt-5.2
> - **Gemini 3 Pro** — google/gemini-3-pro-preview

Use AskUserQuestion:

| Option | Label | Description |
|--------|-------|-------------|
| 1 | Looks good | Lock in this lineup |
| 2 | Swap a model | Replace one model with a different one |

If "Swap a model", ask which model to replace and what to replace it with (show alternatives from same provider or full catalog), then show the updated lineup again for confirmation.

---

**Step 4 — API Key**

Use AskUserQuestion:

| Option | Label | Description |
|--------|-------|-------------|
| 1 | I have my key ready | I'll paste it next |
| 2 | I need to get one first | Save models now, add key later |

If "I have my key ready", ask them to paste it (they'll type it as a free-text response).

If "I need to get one first", save the config with an empty `apiKey` and tell them:
> Get your key at https://sdk.vercel.ai/docs/ai-sdk-core/gateway — one key for all providers, no per-provider keys needed. Run `/pantheon models` when you're ready to add it.

---

**Step 5 — Save config**

Write `~/.claude/pantheon.json` using the Write tool:

```json
{
  "apiKey": "the-key-or-empty-string",
  "models": [
    { "name": "opus-4.6", "modelId": "anthropic/claude-opus-4-6" },
    { "name": "gpt-5.2", "modelId": "openai/gpt-5.2" },
    { "name": "gemini-3-pro", "modelId": "google/gemini-3-pro-preview" }
  ]
}
```

Confirm: "Pantheon is set up! Your lineup: **{model names}**. {If apiKey is empty: 'Add your API key with /pantheon models when ready.'}"

If this was triggered by `/pantheon` (not `/pantheon models`), and the API key is set, proceed to Phase 1.

### Phase 1: Context Gathering

Before running the scripts, gather all context the models will need:

1. Read all files relevant to the task using Glob/Grep/Read
2. Read CLAUDE.md if it exists (project conventions)
3. Get a file tree of the target directory via `ls -la`
4. Build a context JSON object and write it to `~/.claude/skills/pantheon/scripts/.context.json`:

```json
{
  "task": "The user's task description, verbatim",
  "files": {
    "relative/path/file.ts": "full file contents..."
  },
  "conventions": "Contents of CLAUDE.md or empty string",
  "fileTree": "Output of ls -la for the target directory"
}
```

### Phase 2: Parallel Solve

Run the solve script:

```bash
cd ~/.claude/skills/pantheon/scripts && npx tsx solve.ts
```

This dispatches the task to all configured models in parallel and writes `.solutions.json`.

Check the exit code. If it fails, read the error output and inform the user (likely a missing API key or config issue — suggest running setup again).

### Phase 3: Cross-Model Evaluation

Run the evaluation script:

```bash
cd ~/.claude/skills/pantheon/scripts && npx tsx evaluate.ts
```

This sends all anonymized solutions to all models for judging, excludes self-scores, and writes `.evaluation.json`.

### Phase 4: Review + Verdict

**Step 1: Show scores**

Read `~/.claude/skills/pantheon/scripts/.evaluation.json` and present the score table:

```
## Pantheon Results (cross-evaluated)

| Model | Precision | Accuracy | Creativity | Simplicity | Score | Judged By |
|-------|-----------|----------|------------|------------|-------|-----------|
| ...   | ...       | ...      | ...        | ...        | ...   | ...       |

Winner: **{model}** (scored by {judges} — no self-grading)

Cherry-picks from other solutions:
- {list any cherry-picks from the evaluation}

Risks:
- {list any risks identified}
```

**Step 2: Show approaches**

Run the display script to show each model's approach summary:

```bash
cd ~/.claude/skills/pantheon/scripts && npx tsx display.ts rationales
```

Present the output to the user. This shows each model's rationale and file list — enough to understand the approach without seeing all the code.

**Step 3: Ask user what to review**

Ask the user with these options:
- "Show the tech spec" — run `npx tsx display.ts spec` and present the full structured spec (overview, files changed, scores, cherry-picks, risks, implementation code)
- "Show the winning solution's code" — run `npx tsx display.ts winner` and present the full code
- "Show a specific model's code" — run `npx tsx display.ts {model-name}` (e.g., `gpt-5.2`)
- "Show a specific model's tech spec" — run `npx tsx display.ts spec {model-name}`
- "Show all solutions" — run `npx tsx display.ts all`
- "Implement the winner now" — skip to Step 5

The user may ask to see multiple solutions before deciding. Keep showing code until they're ready.

**Step 4: Confirm implementation**

After the user has reviewed the code, ask: "Implement this solution?" with options:
- Implement the winner as-is
- Pick a different model's solution
- Merge cherry-picks into the winner first

Do NOT implement until the user explicitly confirms.

**Step 5: Implement**

Once confirmed:
1. Run `npx tsx display.ts {chosen-model}` to get the solution
2. Parse each `=== FILE: path ===` block from the output
3. For each file, use Write to create/overwrite the file at the correct path
4. If the user requested cherry-pick merging, apply those improvements after writing the base files

## Setup

All models route through Vercel AI Gateway — one API key for everything.

**First-time setup** happens conversationally during Phase 0 of the first `/pantheon` run. Claude Code will ask you to pick models and enter your API key.

**Manual setup** (outside Claude Code, in your own terminal):

```bash
cd ~/.claude/skills/pantheon/scripts && npx tsx setup.ts
```

**Reconfigure models** anytime with `/pantheon models`, or manually:

```bash
cd ~/.claude/skills/pantheon/scripts && npx tsx models.ts
```

Config is stored at `~/.claude/pantheon.json`. No per-provider keys needed — AI Gateway handles all routing. Get your key at https://sdk.vercel.ai/docs/ai-sdk-core/gateway

## Model Catalog

Frontier (latest flagships):
- **Claude Opus 4.6** — `anthropic/claude-opus-4-6`
- **Claude Sonnet 4.5** — `anthropic/claude-sonnet-4-5`
- **Claude Opus 4.5** — `anthropic/claude-opus-4-5`
- **GPT 5.2** — `openai/gpt-5.2`
- **GPT 5.1** — `openai/gpt-5.1`
- **GPT 5** — `openai/gpt-5`
- **Gemini 3 Pro** — `google/gemini-3-pro-preview`
- **Gemini 2.5 Pro** — `google/gemini-2.5-pro`
- **Gemini 1.5 Pro** — `google/gemini-1.5-pro`

Flash (fast + cheap):
- **Claude Haiku 4.5** — `anthropic/claude-haiku-4-5`
- **Claude Sonnet 4.0** — `anthropic/claude-sonnet-4-0`
- **Claude Haiku 3.5** — `anthropic/claude-3-5-haiku-latest`
- **GPT 5 Mini** — `openai/gpt-5-mini`
- **GPT 4.1 Mini** — `openai/gpt-4.1-mini`
- **GPT 4.1 Nano** — `openai/gpt-4.1-nano`
- **Gemini 3 Flash** — `google/gemini-3-flash-preview`
- **Gemini 2.5 Flash** — `google/gemini-2.5-flash`
- **Gemini 2.0 Flash** — `google/gemini-2.0-flash`

Custom models can be added during setup or `/pantheon models` — any model available on AI Gateway works.

## Evaluation

Solutions are scored on 4 dimensions (precision 35%, accuracy 30%, creativity 20%, simplicity 15%) by every model except the one that produced the solution. This eliminates self-grading bias.
