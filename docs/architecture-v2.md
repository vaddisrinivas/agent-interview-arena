# Agent Interview Arena V2 Architecture

V2 keeps every subsystem replaceable. The repo is still the database, GitHub PRs are still the submission API, and GitHub Pages is still the UI. The difference is that each part now talks through small contracts instead of shared assumptions.

## Contracts

- `task.v0`: locked task definition, expected artifacts, skills, rubric, allowed interviewer answers, and optional `evaluation.validator`.
- `submission.v1`: folder package at `submissions/<submission_id>/submission.json` plus copied files in `submissions/<submission_id>/artifacts/`.
- `validator_result.v1`: trusted validator output with `passed`, `score`, and `checks`.
- `arena.index.v0`: generated dashboard data under `public/data/`.

Legacy `submission.v0` files at `submissions/*.json` remain readable so old submissions do not break.

## Boundaries

- Task bank owns task intent and optional validator metadata.
- Plugin owns local capture, artifact packaging, data-sharing acknowledgement, and PR creation.
- Core scripts own schema validation, secret scanning, generic scoring, validator orchestration, and index generation.
- Validators own task-specific checks and live only in `validators/tasks/`.
- Dashboard owns display only; it never evaluates submissions.
- Importers draft task JSON and do not write to the task bank unless explicitly asked.

## Validator Rules

- Only `type: "node"` validators are supported in v2.
- Validator paths must resolve under `validators/tasks/*.mjs`.
- Submission PRs cannot provide evaluator code.
- Validator failure or timeout becomes a failed `validator_result.v1`; it must not crash the whole PR eval.
- V2 validators are static/deterministic. No Playwright, secrets, or network.

## Submission Package

Plugin submit copies each `--artifact` into the package:

```text
submissions/<submission_id>/
  submission.json
  artifacts/
    ...
```

Relative artifact paths under the working directory are preserved. Absolute or outside-working-directory artifacts are stored under `artifacts/external/<basename>`.

Public PR submissions require `--ack-public-data` unless `--no-pr` is used. `--dry-run` writes nothing and previews expected files.

## Scoring

`evaluation_result.deterministic_score` remains the dashboard-compatible score. V2 adds:

- `component_scores`
- `task_validator_score`
- `validator_result`
- `missing_artifacts`
- `scoring_notes`

If a task declares unavailable weights, scoring renormalizes over deterministic components that exist.
