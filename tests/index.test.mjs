import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildIndexes, readJson } from "../scripts/arena-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("builds dashboard indexes from tasks and submissions", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-index-"));
  fs.mkdirSync(path.join(temp, "public/data"), { recursive: true });
  fs.cpSync(path.join(root, "tasks"), path.join(temp, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(temp, "submissions"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "tests/fixtures/sample-submission.json"),
    path.join(temp, "submissions/sample-submission.json")
  );
  const result = buildIndexes(temp);
  assert.equal(result.problems.length, 0);
  const taskIndex = readJson(path.join(temp, "public/data/tasks.json"));
  const submissionIndex = readJson(path.join(temp, "public/data/submissions.json"));
  assert.equal(taskIndex.tasks.length >= 3, true);
  assert.equal(submissionIndex.submissions.length, 1);
  assert.equal(submissionIndex.submissions[0].evaluation_result.deterministic_score > 0, true);
});
