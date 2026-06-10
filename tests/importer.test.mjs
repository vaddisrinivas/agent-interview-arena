import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("import app idea emits draft task JSON without writing", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-import-"));
  const source = path.join(temp, "idea.md");
  fs.writeFileSync(source, "# Tiny Timer\n\nBuild a timer with start and pause.");
  const output = execFileSync(
    process.execPath,
    [
      path.join(root, "scripts/import-app-idea.mjs"),
      "https://example.test/timer.md",
      "--task-id",
      "arena-timer-draft-v0",
      "--title",
      "Timer Draft",
      "--source-file",
      source
    ],
    { cwd: root, encoding: "utf8" }
  );
  const task = JSON.parse(output);
  assert.equal(task.task_id, "arena-timer-draft-v0");
  assert.equal(task.source.url, "https://example.test/timer.md");
  assert.equal(fs.existsSync(path.join(root, "tasks/arena-timer-draft-v0.json")), false);
});
