#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import glob
import hashlib
import json
import os
import platform
import re
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any

TASK_SCHEMA_VERSION = "task.v0"
SUBMISSION_SCHEMA_VERSION = "submission.v0"
STATE_DIR = Path.home() / ".agent-interview-arena"
STATE_FILE = STATE_DIR / "state.json"

SECRET_PATTERNS = [
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("github_token", re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}")),
    ("anthropic_key", re.compile(r"sk-ant-[A-Za-z0-9_-]{16,}")),
    ("api_key", re.compile(r"sk-[A-Za-z0-9_-]{16,}")),
    ("aws_access_key", re.compile(r"AKIA[0-9A-Z]{12,}")),
    ("password_assignment", re.compile(r"\b(password|passwd|pwd)\s*[:=]\s*[\"']?[^\"'\s,;]+", re.I)),
    ("api_key_assignment", re.compile(r"\b(api[_-]?key|token|secret)\s*[:=]\s*[\"']?[^\"'\s,;]+", re.I)),
]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_time(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def repo_root() -> Path:
    env = os.environ.get("ARENA_REPO")
    if env:
        return Path(env).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


def state_load() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {}
    return json.loads(STATE_FILE.read_text())


def state_save(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2) + "\n")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def task_files(root: Path) -> list[Path]:
    return sorted((root / "tasks").glob("*.json"))


def load_tasks(root: Path) -> list[dict[str, Any]]:
    return [read_json(path) for path in task_files(root)]


def load_task(root: Path, task_id: str) -> dict[str, Any]:
    for task in load_tasks(root):
        if task.get("task_id") == task_id:
            return task
    raise SystemExit(f"unknown task_id: {task_id}")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def redact_text(text: str) -> str:
    text = re.sub(r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "[REDACTED_PRIVATE_KEY]", text)
    text = re.sub(r"gh[pousr]_[A-Za-z0-9_]{20,}", "[REDACTED_GITHUB_TOKEN]", text)
    text = re.sub(r"sk-ant-[A-Za-z0-9_-]{16,}", "[REDACTED_ANTHROPIC_KEY]", text)
    text = re.sub(r"sk-[A-Za-z0-9_-]{16,}", "[REDACTED_API_KEY]", text)
    text = re.sub(r"AKIA[0-9A-Z]{12,}", "[REDACTED_AWS_KEY]", text)
    text = re.sub(r"\b(password|passwd|pwd)\s*[:=]\s*[\"']?[^\"'\s,;]+", r"\1=[REDACTED]", text, flags=re.I)
    text = re.sub(r"\b(api[_-]?key|token|secret)\s*[:=]\s*[\"']?[^\"'\s,;]+", r"\1=[REDACTED]", text, flags=re.I)
    return text


def scan_text(text: str, location: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for kind, pattern in SECRET_PATTERNS:
        for match in pattern.finditer(text):
            findings.append(
                {
                    "type": kind,
                    "path": location,
                    "severity": "high",
                    "fingerprint": sha256_text(match.group(0))[:12],
                }
            )
    return findings


def scan_value(value: Any, location: str = "$") -> list[dict[str, Any]]:
    if isinstance(value, str):
        return scan_text(value, location)
    if isinstance(value, list):
        out: list[dict[str, Any]] = []
        for index, item in enumerate(value):
            out.extend(scan_value(item, f"{location}[{index}]"))
        return out
    if isinstance(value, dict):
        out = []
        for key, item in value.items():
            out.extend(scan_value(item, f"{location}.{key}"))
        return out
    return []


def latest_file(patterns: list[str]) -> Path | None:
    files: list[Path] = []
    for pattern in patterns:
        files.extend(Path(path) for path in glob.glob(os.path.expanduser(pattern), recursive=True))
    files = [path for path in files if path.is_file()]
    if not files:
        return None
    return max(files, key=lambda path: path.stat().st_mtime)


def detect_session() -> dict[str, Any]:
    codex = latest_file(["~/.codex/sessions/**/*.jsonl"])
    claude = latest_file(["~/.claude/projects/**/*.jsonl"])
    candidates = [item for item in [("codex", codex), ("claude", claude)] if item[1]]
    if not candidates:
        return {"host": "unknown", "path": None, "chat_id": None}
    host, path = max(candidates, key=lambda item: item[1].stat().st_mtime)
    chat_id = extract_chat_id(path, host)
    return {"host": host, "path": str(path), "chat_id": chat_id}


def extract_chat_id(path: Path | None, host: str) -> str | None:
    if not path or not path.exists():
        return None
    try:
        for line in path.read_text(errors="ignore").splitlines()[:40]:
            if not line.strip():
                continue
            event = json.loads(line)
            if host == "codex":
                payload = event.get("payload") or {}
                if event.get("type") == "session_meta" and payload.get("id"):
                    return str(payload["id"])
            if host == "claude":
                for key in ("sessionId", "session_id", "conversation_id", "uuid"):
                    if event.get(key):
                        return str(event[key])
    except Exception:
        pass
    return path.stem


def walk_metrics(value: Any, metrics: dict[str, Any]) -> None:
    if isinstance(value, list):
        for item in value:
            walk_metrics(item, metrics)
        return
    if not isinstance(value, dict):
        return
    typ = str(value.get("type", ""))
    if re.search(r"function_call|tool_use|tool_call", typ, re.I):
        metrics["tool_calls"]["total"] += 1
        name = value.get("name") or value.get("tool_name")
        if name:
            metrics["tool_calls"]["by_name"][str(name)] = metrics["tool_calls"]["by_name"].get(str(name), 0) + 1
    for key, child in value.items():
        if isinstance(child, (int, float)) and re.search(r"tokens?$", key, re.I):
            if re.search(r"cached", key, re.I):
                metrics["tokens"]["cached"] += int(child)
            elif re.search(r"reasoning", key, re.I):
                metrics["tokens"]["reasoning"] += int(child)
            elif re.search(r"input|prompt", key, re.I):
                metrics["tokens"]["prompt"] += int(child)
            elif re.search(r"output|completion", key, re.I):
                metrics["tokens"]["completion"] += int(child)
            elif re.search(r"total", key, re.I):
                metrics["tokens"]["total"] += int(child)
        if key.lower() == "model" and isinstance(child, str):
            metrics["models"].add(child)
        walk_metrics(child, metrics)


def text_fragments(value: Any) -> list[str]:
    fragments: list[str] = []
    if isinstance(value, str):
        if len(value) > 2:
            fragments.append(value)
    elif isinstance(value, list):
        for item in value:
            fragments.extend(text_fragments(item))
    elif isinstance(value, dict):
        for key in ("text", "content", "message", "msg", "prompt"):
            if isinstance(value.get(key), str):
                fragments.append(value[key])
        for item in value.values():
            if isinstance(item, (dict, list)):
                fragments.extend(text_fragments(item))
    return fragments


def parse_session_log(path: str | None, started_at: str | None) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "tokens": {"prompt": 0, "completion": 0, "cached": 0, "reasoning": 0, "total": 0},
        "tool_calls": {"total": 0, "by_name": {}},
        "models": set(),
        "user_messages": 0,
        "assistant_messages": 0,
        "events_seen": 0,
    }
    transcript_events: list[dict[str, Any]] = []
    start_dt = parse_time(started_at)
    source = Path(path).expanduser() if path else None
    if not source or not source.exists():
        return {"metrics": normalize_metrics(metrics), "events": transcript_events, "source_path": path}

    for line in source.read_text(errors="ignore").splitlines():
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        ts = event.get("timestamp") or event.get("created_at")
        event_dt = parse_time(ts)
        if start_dt and event_dt and event_dt < start_dt:
            continue
        blob = json.dumps(event)
        metrics["events_seen"] += 1
        if re.search(r'"role"\s*:\s*"user"|"type"\s*:\s*"user"', blob):
            metrics["user_messages"] += 1
        if re.search(r'"role"\s*:\s*"assistant"|"type"\s*:\s*"assistant"', blob):
            metrics["assistant_messages"] += 1
        walk_metrics(event, metrics)
        fragments = text_fragments(event)
        if fragments and len(transcript_events) < 120:
            text = redact_text(" ".join(fragments))
            transcript_events.append(
                {
                    "timestamp": ts,
                    "type": event.get("type") or event.get("role") or "event",
                    "text": text[:1200],
                }
            )
    return {"metrics": normalize_metrics(metrics), "events": transcript_events, "source_path": str(source)}


def normalize_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    tokens = metrics["tokens"]
    if not tokens["total"]:
        tokens["total"] = tokens["prompt"] + tokens["completion"] + tokens["cached"] + tokens["reasoning"]
    return {
        "tokens": tokens,
        "tool_calls": metrics["tool_calls"],
        "models": sorted(metrics["models"]),
        "user_messages": metrics["user_messages"],
        "assistant_messages": metrics["assistant_messages"],
        "events_seen": metrics["events_seen"],
        "reprompts": max(0, metrics["user_messages"] - 1),
    }


def estimate_cost(tokens: dict[str, int]) -> tuple[float, dict[str, Any]]:
    input_per_mtok = float(os.environ.get("ARENA_PRICE_INPUT_PER_MTOK", "0"))
    output_per_mtok = float(os.environ.get("ARENA_PRICE_OUTPUT_PER_MTOK", "0"))
    cost = (tokens.get("prompt", 0) / 1_000_000 * input_per_mtok) + (
        tokens.get("completion", 0) / 1_000_000 * output_per_mtok
    )
    return round(cost, 6), {
        "source": "env:ARENA_PRICE_INPUT_PER_MTOK/ARENA_PRICE_OUTPUT_PER_MTOK",
        "input_per_mtok": input_per_mtok,
        "output_per_mtok": output_per_mtok,
    }


def system_snapshot() -> dict[str, Any]:
    snapshot: dict[str, Any] = {
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "loadavg": list(os.getloadavg()) if hasattr(os, "getloadavg") else [],
    }
    try:
        snapshot["cpu_count"] = os.cpu_count()
    except Exception:
        pass
    try:
        memsize = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()
        snapshot["memory_bytes"] = int(memsize)
    except Exception:
        pass
    return snapshot


def summarize_artifact(path_text: str, cwd: Path) -> dict[str, Any]:
    path = Path(path_text).expanduser()
    if not path.is_absolute():
        path = cwd / path
    exists = path.exists()
    summary = {
        "path": path_text,
        "exists": exists,
        "size_bytes": path.stat().st_size if exists and path.is_file() else 0,
        "sha256": None,
    }
    if exists and path.is_file():
        summary["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    return summary


def safe_id(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-")
    return value[:90] or "submission"


def cmd_tasks(args: argparse.Namespace) -> int:
    root = repo_root()
    for task in load_tasks(root):
        skills = ", ".join(skill.get("name", skill.get("skill_id", "")) for skill in task.get("skills", []))
        print(f"{task['task_id']} | D{task['difficulty']} | {task['title']} | {skills}")
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    root = repo_root()
    task = load_task(root, args.task_id)
    session = detect_session()
    state = {
        "task_id": task["task_id"],
        "title": task["title"],
        "started_at": utc_now(),
        "repo_root": str(root),
        "session": session,
        "system_start": system_snapshot(),
    }
    state_save(state)
    print(f"started {task['task_id']}")
    print(f"host={session.get('host')} chat_id={session.get('chat_id')} log={session.get('path')}")
    print("required artifacts:")
    for artifact in task.get("artifacts", []):
        if artifact.get("required"):
            print(f"- {artifact['path']} ({artifact['type']})")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    state = state_load()
    if not state:
        print("no active arena task")
        return 1
    started = parse_time(state.get("started_at"))
    elapsed = 0
    if started:
        elapsed = int((dt.datetime.now(dt.timezone.utc) - started).total_seconds())
    print(f"task={state.get('task_id')} title={state.get('title')}")
    print(f"started_at={state.get('started_at')} elapsed_seconds={elapsed}")
    print(f"host={state.get('session', {}).get('host')} chat_id={state.get('session', {}).get('chat_id')}")
    print(f"log={state.get('session', {}).get('path')}")
    return 0


def create_pr(root: Path, submission_path: Path, submission_id: str, task_id: str) -> None:
    branch = f"submission/{safe_id(submission_id)}"
    relative = submission_path.relative_to(root)
    subprocess.run(["git", "switch", "-c", branch], cwd=root, check=True)
    subprocess.run(["git", "add", str(relative)], cwd=root, check=True)
    subprocess.run(["git", "commit", "-m", f"Add arena submission {submission_id}"], cwd=root, check=True)
    subprocess.run(["git", "push", "-u", "origin", "HEAD"], cwd=root, check=True)
    subprocess.run(
        [
            "gh",
            "pr",
            "create",
            "--title",
            f"Submission: {task_id}",
            "--body",
            (
                f"Agent Interview Arena submission `{submission_id}` for task `{task_id}`.\n\n"
                "Data sharing note: this PR may include metrics, notes, artifact paths, hashes, and redacted transcript snippets. "
                "Redaction is best-effort. Review the diff before publishing sensitive work."
            ),
        ],
        cwd=root,
        check=True,
    )


def cmd_submit(args: argparse.Namespace) -> int:
    state = state_load()
    if not state:
        print("no active arena task; run arena.py start <task_id>", file=sys.stderr)
        return 1
    root = Path(state.get("repo_root") or repo_root()).resolve()
    task = load_task(root, state["task_id"])
    started_at = state.get("started_at")
    started = parse_time(started_at)
    wall_time = int((dt.datetime.now(dt.timezone.utc) - started).total_seconds()) if started else 0
    session = state.get("session") or detect_session()
    parsed = parse_session_log(session.get("path"), started_at)
    parsed_metrics = parsed["metrics"]
    models = parsed_metrics.get("models") or []
    cost, pricing = estimate_cost(parsed_metrics["tokens"])
    artifacts = [summarize_artifact(item, Path.cwd()) for item in args.artifact]
    security_findings = scan_value({"events": parsed["events"], "notes": args.notes})
    chat_id = session.get("chat_id") or "no-chat"
    created = utc_now()
    submission_id = safe_id(f"{task['task_id']}-{chat_id}-{created.replace(':', '').replace('-', '')}")
    submission = {
        "schema_version": SUBMISSION_SCHEMA_VERSION,
        "submission_id": submission_id,
        "task_id": task["task_id"],
        "created_at": created,
        "host": {
            "app": session.get("host") or "unknown",
            "hostname": socket.gethostname(),
            "repo_root": str(root),
        },
        "agent": {
            "type": session.get("host") or "unknown",
            "model": models[0] if models else "unknown",
            "models_seen": models,
        },
        "chat": {
            "id": chat_id,
            "source_path": parsed.get("source_path"),
        },
        "metrics": {
            "wall_time_seconds": wall_time,
            "tokens": parsed_metrics["tokens"],
            "cost_usd_estimate": cost,
            "pricing": pricing,
            "tool_calls": parsed_metrics["tool_calls"],
            "reprompts": parsed_metrics["reprompts"],
            "user_messages": parsed_metrics["user_messages"],
            "assistant_messages": parsed_metrics["assistant_messages"],
            "events_seen": parsed_metrics["events_seen"],
            "system": {
                "start": state.get("system_start"),
                "end": system_snapshot(),
            },
        },
        "skills": task.get("skills", []),
        "artifacts": artifacts,
        "quality": {
            "self_review": redact_text(args.notes or ""),
            "human_quality_score": None,
            "llm_judge_score": None,
        },
        "security": {
            "redaction": "common_secret_patterns_v0",
            "findings": security_findings,
            "blocked": bool(security_findings),
        },
        "transcript": {
            "capture": "redacted_snippets",
            "events": parsed["events"],
        },
    }
    submission_path = root / "submissions" / f"{submission_id}.json"
    write_json(submission_path, submission)
    print(f"wrote {submission_path}")
    if args.no_pr or os.environ.get("ARENA_NO_PR") == "1":
        print("skipped PR")
        return 0
    create_pr(root, submission_path, submission_id, task["task_id"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="arena.py")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("tasks").set_defaults(func=cmd_tasks)
    start = sub.add_parser("start")
    start.add_argument("task_id")
    start.set_defaults(func=cmd_start)
    sub.add_parser("status").set_defaults(func=cmd_status)
    submit = sub.add_parser("submit")
    submit.add_argument("--artifact", action="append", default=[], help="Artifact path to include in submission")
    submit.add_argument("--notes", default="", help="Self-review notes")
    submit.add_argument("--no-pr", action="store_true", help="Write submission JSON but do not create a GitHub PR")
    submit.set_defaults(func=cmd_submit)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
