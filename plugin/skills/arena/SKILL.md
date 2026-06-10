---
name: arena
description: Run Agent Interview Arena tasks from Codex or Claude, capture local session metrics, and submit via GitHub PR.
---

# Arena

Use this skill when user asks to run, start, status, or submit an Agent Interview Arena challenge.

## Commands

- List tasks: `python3 plugin/scripts/arena.py tasks`
- Start task: `python3 plugin/scripts/arena.py start <task_id>`
- Status: `python3 plugin/scripts/arena.py status`
- Submit: `python3 plugin/scripts/arena.py submit --artifact <path> --notes "Done"`

## Rules

- Keep task prompt locked.
- Ask interviewer only questions listed in task JSON.
- Produce required artifacts before submit.
- Do not include secrets in artifacts or submission notes.
- Review the generated PR diff before merge.
