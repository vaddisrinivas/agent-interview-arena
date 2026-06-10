#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import io
import json
import sys
from typing import Any

import arena

TOOLS = [
    {
        "name": "arena_tasks",
        "description": "List Agent Interview Arena tasks.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "arena_start",
        "description": "Start an Agent Interview Arena task.",
        "inputSchema": {
            "type": "object",
            "properties": {"task_id": {"type": "string"}},
            "required": ["task_id"],
        },
    },
    {
        "name": "arena_status",
        "description": "Show active Agent Interview Arena task status.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "arena_submit",
        "description": "Submit active Agent Interview Arena task.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "artifact": {"type": "array", "items": {"type": "string"}},
                "notes": {"type": "string"},
                "no_pr": {"type": "boolean"},
            },
        },
    },
]


def run_cli(args: list[str]) -> str:
    stdout = io.StringIO()
    stderr = io.StringIO()
    code = 0
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        try:
            code = arena.main(args)
        except SystemExit as exc:
            code = int(exc.code or 0)
    text = stdout.getvalue()
    err = stderr.getvalue()
    if err:
        text += err
    if code:
        text += f"\nexit_code={code}"
    return text.strip()


def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name == "arena_tasks":
        text = run_cli(["tasks"])
    elif name == "arena_start":
        text = run_cli(["start", arguments["task_id"]])
    elif name == "arena_status":
        text = run_cli(["status"])
    elif name == "arena_submit":
        args = ["submit"]
        for artifact in arguments.get("artifact") or []:
            args.extend(["--artifact", artifact])
        if arguments.get("notes"):
            args.extend(["--notes", arguments["notes"]])
        if arguments.get("no_pr", False):
            args.append("--no-pr")
        text = run_cli(args)
    else:
        raise ValueError(f"unknown tool {name}")
    return {"content": [{"type": "text", "text": text}]}


def respond(message_id: Any, result: Any = None, error: Any = None) -> None:
    payload = {"jsonrpc": "2.0", "id": message_id}
    if error is not None:
        payload["error"] = error
    else:
        payload["result"] = result
    print(json.dumps(payload), flush=True)


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        method = request.get("method")
        message_id = request.get("id")
        try:
            if method == "initialize":
                respond(
                    message_id,
                    {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "arena", "version": "0.1.0"},
                    },
                )
            elif method == "tools/list":
                respond(message_id, {"tools": TOOLS})
            elif method == "tools/call":
                params = request.get("params") or {}
                respond(message_id, call_tool(params.get("name"), params.get("arguments") or {}))
            elif method in {"notifications/initialized", "$/cancelRequest"}:
                continue
            else:
                respond(message_id, error={"code": -32601, "message": f"method not found: {method}"})
        except Exception as exc:
            respond(message_id, error={"code": -32000, "message": str(exc)})


if __name__ == "__main__":
    main()
