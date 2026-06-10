# Agent Interview Arena V2

Plugin-first arena for measuring how well a human operator can complete real tasks with an AI agent. The repo is the database, GitHub Pages is the UI, and GitHub pull requests are the submission API.

## What exists

- Static LeetCode-style dashboard in `public/`.
- MVPy-style task JSON in `tasks/`.
- Folder-based `submission.v1` packages in `submissions/`, with legacy `submission.v0` JSON still readable.
- Hybrid Codex/Claude plugin in `plugin/`.
- Secretless PR evaluation in `.github/workflows/validate.yml`.
- Loosely coupled contracts, validators, importers, deterministic tests, and index builder in `scripts/`, `validators/`, and `tests/`.

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

## Interview model

Agent Interview Arena is an interview format for AI-native work:

1. The candidate receives a locked task, expected output, required artifacts, skills, and rubric.
2. The interviewer bot can answer only the allowed questions inside the task definition.
3. The candidate works in Codex or Claude with the arena plugin installed.
4. The plugin captures the attempt: session id, model, prompts, re-prompts, tool calls, wall time, token buckets, estimated cost, artifacts, system metrics, and redaction flags.
5. The candidate submits by opening a GitHub PR containing one submission folder with JSON plus artifact files.
6. GitHub Actions validates schema, required artifacts, redaction, task-owned validators, and deterministic scoring.
7. The dashboard compares attempts by task completion, output quality, security, time, tokens, cost, tools, and model context.

This is not a hidden AI detector and not a pure model benchmark. The point is to make AI use visible, structured, and reviewable.

## Why interviews are changing

Real engineering work increasingly includes AI assistants. Some companies are experimenting with AI-enabled coding interviews because banning AI can make interviews less realistic and harder to police. The better path is to define where AI is allowed, log the work, score the human steering loop, and keep humans responsible for hiring decisions.

Companies can do better by:

- testing realistic agent collaboration instead of pretending candidates never use AI
- publishing allowed AI use before the interview starts
- measuring prompt quality, re-prompts, recovery, testing, security, and artifact quality
- keeping human review and candidate context in the final decision
- avoiding secret collection, opaque scoring, and unreviewable transcript capture
- using repeatable tasks, rubrics, and PR-style audit trails

Relevant public guidance: the U.S. Department of Labor AI best-practices roadmap emphasizes meaningful human oversight, transparency, worker input, rights, training, and data protection. EEOC materials emphasize that AI and automated employment tools still need civil-rights compliance and adverse-impact review.

## Task bank strategy

The seed bank should come from short, bounded app specs rather than giant production repos. A good source is a "one repo, many small apps" collection, then each app idea becomes arena-native JSON with a locked task, expected artifacts, skills, rubric, allowed interviewer answers, and deterministic checks.

Current source notes live in `docs/task-bank-sources.md`. Best first source found: `florinpop17/app-ideas`, which has beginner, intermediate, and advanced app ideas such as CSV converters, notes, pomodoro clocks, markdown previewers, to-do apps, and password generators.

Good starter conversions:

- CSV to JSON tool with fixtures and validation report
- Markdown previewer with screenshot artifact
- Pomodoro timer UI with state checklist
- Notes app with privacy/redaction notes
- GitHub profile card from fixture JSON
- Password generator with security review

## Demo video

Framecraft config lives in `demo/arena-demo.scenes.json`.

```bash
uv run --project /Users/srinivasvaddi/Projects/framecraft python /Users/srinivasvaddi/Projects/framecraft/framecraft.py render demo/arena-demo.scenes.json --auto-duration
```

Output: `public/agent-interview-arena-demo.mp4`.

## V2 architecture

V2 is intentionally loose coupled. Each layer speaks JSON or filesystem contracts:

- tasks declare prompts, artifacts, rubrics, and optional trusted validator metadata
- plugin runtime captures sessions and writes `submission.v1` folder packages
- validators live in repo-owned `validators/tasks/` modules and return `validator_result.v1`
- PR eval orchestrates contracts but does not contain task-specific branches
- dashboard reads generated JSON only
- importers draft task JSON without directly mutating the task bank by default

See `docs/architecture-v2.md`.

## Sources and references

- Department of Labor AI best practices: https://www.dol.gov/newsroom/releases/osec/osec20241016
- EEOC 2023 AI and algorithmic fairness work: https://www.eeoc.gov/2023-annual-performance-report
- Meta hiring process: https://www.metacareers.com/hiring-process
- WIRED reporting on Meta AI-enabled coding interviews: https://www.wired.com/story/meta-ai-job-interview-coding/
- App Ideas source bank: https://github.com/florinpop17/app-ideas
- Framecraft demo-video tool: https://github.com/vaddisrinivas/framecraft

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
python3 plugin/scripts/arena.py submit --dry-run --artifact path/to/output.md
python3 plugin/scripts/arena.py submit --ack-public-data --artifact path/to/output.md --notes "Done"
```

## Submission flow

The plugin writes `submissions/<submission_id>/submission.json`, copies artifacts into `submissions/<submission_id>/artifacts/`, creates a branch, commits the folder, pushes it, and opens a PR with `gh`. The submission represents the operator attempt: prompts, re-prompts, artifacts, metrics, and safety posture around a locked task.

```bash
python3 plugin/scripts/arena.py submit --ack-public-data --artifact path/to/output.md --notes "Finished"
```

Use `--dry-run` to preview without writing files. Use `--no-pr` to write a local submission package without opening a PR.

## Data sharing and privacy

Public repo means public PRs, public submission metadata, and public dashboard data.

Submission PRs may include task ids, model names, host/app metadata, wall time, token buckets, estimated cost, tool-call counts, artifact files, artifact paths, artifact sizes, hashes, notes, self-review text, system metrics, and redacted transcript snippets.

Redaction is best-effort, not a guarantee. Do not submit proprietary code, customer data, personal data, secrets, credentials, private prompts, or sensitive transcripts. Review every generated PR diff before opening or merging it. Use a private fork/repo for sensitive interviews.

## PR evaluation

PR CI is secretless:

- validates task and submission JSON
- verifies `task_id`
- checks required artifact names
- runs trusted task validators when declared
- scans for likely secrets
- computes task-completion, artifact, security, and metadata scores
- builds dashboard indexes
- writes a PR/job summary

LLM judging is intentionally not part of default PR CI.

## GitHub Pages

Set Pages source to the repository branch and `/public`. After submissions merge, `public/data/tasks.json` and `public/data/submissions.json` drive the dashboard.
