# Task Bank Sources

Agent Interview Arena needs short, bounded tasks that can be completed inside a live agent session and evaluated from artifacts. The best seed source found so far is a "many small apps in one repo" style project list, then we convert each app idea into an interview task.

## Current GitHub Scans

Stored scans:

- `/Users/srinivasvaddi/Projects/repos-exploration/arena-small-app-task-bank`
- `/Users/srinivasvaddi/Projects/repos-exploration/arena-monorepo-mini-apps`
- `/Users/srinivasvaddi/Projects/repos-exploration/florinpop17-app-ideas-full`

Useful result:

- `florinpop17/app-ideas` - one public repo with beginner, intermediate, and advanced small app specifications. The repo describes each project with an objective, user stories, bonus features, and resources. This maps cleanly to locked task prompts, expected outputs, artifacts, skills, and rubrics.

Noisy results:

- Generic searches for "small" and "frontend" returned major frameworks, small libraries, and unrelated "small footprint" projects. These are useful for inspiration, but weak as direct task-bank sources.

## Conversion Model

Do not import external project text wholesale. Convert app ideas into arena-native tasks:

1. Keep the task scope small enough for a 20-60 minute interview.
2. Lock the prompt and allowed interviewer answers.
3. Require artifacts that can be inspected without running a full production service.
4. Score the operator's workflow, not only the final app.
5. Prefer deterministic checks first: file presence, schema, static HTML smoke, unit tests, screenshot existence, redaction.
6. Keep model, tokens, dollars, time, and tool calls as context filters.

## Seed Task Families

### Frontend Artifact Tasks

Source patterns: calculator, markdown previewer, notes app, pomodoro clock, quiz app, recipe app, to-do app.

Arena task shape:

- Build one small UI in a new folder.
- Produce `README.md`, source files, and a screenshot.
- Include basic empty/error states.
- Add minimal tests or a manual verification checklist.

Skills measured:

- prompt decomposition
- UI implementation
- state handling
- accessibility basics
- artifact packaging

### Data Transform Tasks

Source patterns: CSV2JSON, JSON2CSV, word frequency, roman numeral converter, binary-to-decimal converter.

Arena task shape:

- Implement a tiny CLI or single-page tool.
- Include fixtures.
- Produce output JSON/CSV and a validation report.

Skills measured:

- input parsing
- edge-case discovery
- deterministic testing
- concise artifact writing

### API/Integration Tasks

Source patterns: GitHub profiles, weather app, currency converter, book finder.

Arena task shape:

- Build against fixture data for PR-safe CI.
- Optional live API support must be isolated behind config.
- Include loading, empty, error, and rate-limit states.

Skills measured:

- API boundary design
- mocking/fixtures
- graceful failure handling
- data privacy judgment

### Security/Quality Tasks

Source patterns: password generator, regex helper, input validation, notes storage.

Arena task shape:

- Implement or review a small tool with explicit misuse cases.
- Produce security notes and tests.
- Redact sensitive sample data.

Skills measured:

- threat modeling
- validation
- redaction
- reviewer-quality explanations

## Starter Backlog

Seeded conversions now in `tasks/`:

- `arena-csv-json-tool-v0` - convert messy CSV to normalized JSON with fixtures and validation report.
- `arena-markdown-preview-v0` - build a markdown previewer from a locked UI spec and screenshot the result.
- `arena-password-generator-v0` - implement a password generator and produce a security review.

Good next conversions:

- `arena-pomodoro-ui-v0` - implement a timer UI with start/pause/reset and state notes.
- `arena-notes-redaction-v0` - create a notes app artifact that stores redacted notes and documents privacy choices.
- `arena-github-profile-fixture-v0` - render a GitHub profile card from fixture JSON with loading/error states.

## Source Links

- `florinpop17/app-ideas`: https://github.com/florinpop17/app-ideas
- CSV2JSON app spec: https://raw.githubusercontent.com/florinpop17/app-ideas/master/Projects/1-Beginner/CSV2JSON-App.md
- Notes app spec: https://raw.githubusercontent.com/florinpop17/app-ideas/master/Projects/1-Beginner/Notes-App.md
- Pomodoro clock spec: https://raw.githubusercontent.com/florinpop17/app-ideas/master/Projects/1-Beginner/Pomodoro-Clock.md
- Markdown previewer spec: https://raw.githubusercontent.com/florinpop17/app-ideas/master/Projects/2-Intermediate/Markdown-Previewer.md
- To-do app spec: https://raw.githubusercontent.com/florinpop17/app-ideas/master/Projects/2-Intermediate/To-Do-App.md
- Password generator spec: https://raw.githubusercontent.com/florinpop17/app-ideas/master/Projects/2-Intermediate/Password-Generator.md
