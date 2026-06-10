# Agent Interview Arena V0

Plugin-first arena for measuring how well a human operator can complete real tasks with an AI agent. The repo is the database, GitHub Pages is the UI, and GitHub pull requests are the submission API.

## What exists

- Static LeetCode-style dashboard in `public/`.
- MVPy-style task JSON in `tasks/`.
- One JSON file per submission in `submissions/`.
- Hybrid Codex/Claude plugin in `plugin/`.
- Secretless PR evaluation in `.github/workflows/validate.yml`.
- Deterministic tests and index builder in `scripts/` and `tests/`.

## What is being measured

The main subject is the operator loop, not only the model. A submission should show how well someone can:

- understand the locked task
- ask only allowed clarifying questions
- prompt and re-prompt cleanly
- recover from weak or wrong outputs
- produce the required artifacts
- spend time, tokens, dollars, and tool calls intentionally
- avoid leaking secrets or sensitive data

The model, host, token buckets, cost, and wall time are recorded as context and filters for comparing attempts.

## Local loop

```bash
npm test
npm run build:index
npm run validate
npm run pr:eval
```

Open `public/dashboard.html` directly, or serve it:

```bash
python3 -m http.server 8787 --directory public
```

## Try a challenge

From the dashboard, open a task and click `Try this challenge`. It shows Codex and Claude launch links plus fallback commands.

Codex local plugin flow:

```bash
cd /path/to/agent-interview-arena
codex plugin marketplace add "$(pwd)"
codex plugin add arena@agent-interview-arena
/arena:start arena-readme-triage-v0
```

Claude local plugin flow:

```bash
cd /path/to/agent-interview-arena
claude plugin validate plugin
claude --plugin-dir "$(pwd)/plugin"
/arena:start arena-readme-triage-v0
```

Direct CLI fallback:

```bash
python3 plugin/scripts/arena.py tasks
python3 plugin/scripts/arena.py start arena-readme-triage-v0
python3 plugin/scripts/arena.py status
python3 plugin/scripts/arena.py submit --notes "Done"
```

## Submission flow

The plugin writes `submissions/<submission_id>.json`, creates a branch, commits that file, pushes it, and opens a PR with `gh`. The submission represents the operator attempt: prompts, re-prompts, artifacts, metrics, and safety posture around a locked task.

```bash
python3 plugin/scripts/arena.py submit --artifact path/to/output.md --notes "Finished"
```

Use `--no-pr` for local-only dry runs.

## Data sharing and privacy

Public repo means public PRs, public submission metadata, and public dashboard data.

Submission PRs may include task ids, model names, host/app metadata, wall time, token buckets, estimated cost, tool-call counts, artifact paths, artifact sizes, hashes, notes, self-review text, system metrics, and redacted transcript snippets.

Redaction is best-effort, not a guarantee. Do not submit proprietary code, customer data, personal data, secrets, credentials, private prompts, or sensitive transcripts. Review every generated PR diff before opening or merging it. Use a private fork/repo for sensitive interviews.

## PR evaluation

PR CI is secretless:

- validates task and submission JSON
- verifies `task_id`
- checks required artifact names
- scans for likely secrets
- computes task-completion, artifact, security, and metadata scores
- builds dashboard indexes
- writes a PR/job summary

LLM judging is intentionally not part of default PR CI.

## GitHub Pages

Set Pages source to the repository branch and `/public`. After submissions merge, `public/data/tasks.json` and `public/data/submissions.json` drive the dashboard.
