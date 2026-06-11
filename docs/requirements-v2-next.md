# Agent Interview Arena V2 Next Requirements

## Product Frame

Arena measures operator skill in AI-assisted work. The unit is not "which model wins"; the unit is "how well a person steers an agent through a locked task into reviewable artifacts."

V2 must stay no-backend:

- GitHub repo is database.
- GitHub PR is submission API.
- GitHub Actions is deterministic evaluator.
- GitHub Pages is dashboard.
- Codex and Claude plugins are interview rooms.

## Personas

- Candidate: completes locked task with Codex or Claude, submits artifact package by PR.
- Interviewer: defines task, allowed answers, skills, artifacts, rubric, optional trusted validator.
- Reviewer: inspects PR diff, transcript snippets, metrics, artifacts, validator results, and dashboard ranking.
- Maintainer: grows task bank, writes validators, keeps CI secretless.

## Interview Flow

1. Candidate selects task from dashboard.
2. Task page shows locked prompt, expected output, required artifacts, skills, rubric, and allowed questions.
3. Interviewer bot answers only task-defined questions.
4. Candidate runs `/arena:start <task_id>` in Codex or Claude.
5. Plugin captures session metrics and system snapshots.
6. Candidate runs `submit --dry-run --artifact <path>` before PR.
7. Candidate acknowledges public data with `--ack-public-data` for PR path.
8. Plugin writes `submission.v1` folder and opens PR.
9. Actions validate contracts, scan secrets, run trusted validators, compute deterministic score, and rebuild indexes.
10. Dashboard shows score, validator status/details, artifact metadata, cost, time, tokens, tools, and security state.

## Task Bank Requirements

Tasks stay `task.v0` and MVPy-style:

- `task_id`, `title`, `difficulty`, `tags`
- `skills[]` with names and weights
- locked `prompt`
- `expected_output.description`
- `expected_output.must_include[]`
- `artifacts[]` with path/type/required/description
- `evaluation.mode`
- `evaluation.weights`
- optional `evaluation.validator`
- `evaluation.rubric[]`
- `interviewer.allowed_questions[]`
- `interviewer.answers`
- `security_notes[]`

Task bank should prefer small bounded app/tool tasks:

- one clear user outcome
- deterministic fixture data
- required artifact paths
- no private or external data
- static validator possible where useful
- human-quality rubric still present

## Submission Contract

Plugin writes only `submission.v1`:

```text
submissions/<submission_id>/
  submission.json
  artifacts/...
```

Legacy `submission.v0` flat files remain read-only supported.

Each artifact record must include:

- `path`: task/logical artifact path
- `stored_path`: safe relative path under `artifacts/`
- `exists`
- `size_bytes`
- `sha256`
- `media_type`

Relative artifact paths under current working directory preserve relative structure. Absolute or outside paths store under `artifacts/external/<basename>`.

## Validator Contract

Task-owned validator metadata is optional:

```json
{
  "id": "csv_json_tool_v0",
  "type": "node",
  "path": "validators/tasks/csv-json-tool-v0.mjs",
  "timeout_seconds": 10
}
```

Rules:

- only `type: "node"` in v2
- path must resolve under `validators/tasks/*.mjs`
- submission PR cannot provide validator code
- validator failure or timeout returns failed `validator_result.v1`, not CI crash
- validators are deterministic/static in v2; no network, no secrets, no Playwright

## Dashboard Requirements

Dashboard must be useful without a backend:

- task list with skill/search filters
- LeetCode-style task detail plus interviewer chat
- Try dialog with Codex/Claude links and copyable CLI commands
- public data warning before submit flow
- submissions table with validator status and failed check messages
- artifact metadata display: path, stored path, media type, size, hash prefix
- leaderboard sort by deterministic score
- filters for task/model/security/token/time/tool/cost dimensions as submissions grow
- generated JSON only; no hidden evaluation in frontend

## Privacy Requirements

Public repo means public submission data.

PRs may expose:

- submission JSON
- artifact files copied under `submissions/<id>/artifacts/`
- artifact paths, sizes, hashes, media types
- model/host/chat metadata
- wall time, token buckets, cost estimate, tool counts
- notes and self-review
- redacted transcript snippets

Plugin must require `--ack-public-data` before PR creation. `--dry-run` and `--no-pr` remain local-safe and may run without the ack.

Redaction is best effort. Reviewer must inspect diff before publish.

## PR Eval Requirements

Default PR eval stays secretless:

- no repo secrets
- no `pull_request_target`
- validate task schema
- validate submission schema
- load legacy and v1 submissions
- verify task exists
- verify required artifacts are present
- scan submission JSON and text-like artifact files for likely secrets
- run trusted validator if declared
- compute deterministic score and component scores
- write `public/data/tasks.json`
- write `public/data/submissions.json`
- print concise eval summary

LLM judge remains future/manual workflow.

## Acceptance Criteria

- `npm run check` passes.
- `python3 -m py_compile plugin/scripts/arena.py plugin/scripts/arena_mcp.py` passes.
- `claude plugin validate plugin` passes.
- Dashboard renders overview, task page, submissions, leaderboard.
- `submit --dry-run` writes nothing and prints expected files, artifact copy plan, missing artifacts, security count, and public warning.
- `submit --no-pr` writes a folder package without requiring public ack.
- PR path refuses without `--ack-public-data`.
- Validator results appear in generated index and dashboard.
- Artifact secret scan catches common secret patterns in copied text artifacts.

## Non-Goals

- no DB
- no Lambda/server write API
- no hidden auth layer
- no automatic LLM judge in fork PR eval
- no evaluator code from submissions
- no private transcript upload by default
- no Playwright validator in default CI

## Next Sprint Backlog

- Add sample synthetic submission package for dashboard demo state.
- Add more validators for redaction and README triage tasks.
- Add task-bank importer review checklist.
- Add submission detail drawer with full component scores.
- Add leaderboard sort controls for score, cost, time, tokens, tool calls, security.
- Add maintainer-only manual LLM judge workflow.
- Add validator authoring template and fixture convention.
