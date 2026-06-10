import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadTasks, readJson, validateSubmission, validateTask } from "../scripts/arena-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("all task files satisfy task.v0", () => {
  const tasks = loadTasks(root);
  assert.equal(tasks.length >= 3, true);
  for (const { file, task } of tasks) {
    assert.deepEqual(validateTask(task, path.relative(root, file)), []);
  }
});

test("sample submission satisfies submission.v0", () => {
  const taskMap = new Map(loadTasks(root).map(({ task }) => [task.task_id, task]));
  const sample = readJson(path.join(root, "tests/fixtures/sample-submission.json"));
  assert.deepEqual(validateSubmission(sample, taskMap, "sample-submission.json"), []);
});

test("task validator declaration is constrained to trusted node validators", () => {
  const task = readJson(path.join(root, "tasks/arena-csv-json-tool-v0.json"));
  assert.deepEqual(validateTask(task, "csv-task.json"), []);
  const badPath = structuredClone(task);
  badPath.evaluation.validator.path = "submissions/evil.mjs";
  assert.equal(validateTask(badPath, "bad-task.json").some((problem) => problem.path === "evaluation.validator.path"), true);
  const badType = structuredClone(task);
  badType.evaluation.validator.type = "shell";
  assert.equal(validateTask(badType, "bad-task.json").some((problem) => problem.path === "evaluation.validator.type"), true);
});

test("submission.v1 stored artifact paths reject traversal", () => {
  const taskMap = new Map(loadTasks(root).map(({ task }) => [task.task_id, task]));
  const sample = readJson(path.join(root, "tests/fixtures/sample-submission.json"));
  const v1 = {
    ...sample,
    schema_version: "submission.v1",
    artifacts: [{ path: "x", stored_path: "../x", exists: true, size_bytes: 1, sha256: "x", media_type: "text/plain" }]
  };
  assert.equal(validateSubmission(v1, taskMap, "bad-v1.json").some((problem) => problem.path === "artifacts.0.stored_path"), true);
});

test("dashboard entry files exist or are buildable targets", () => {
  for (const file of ["public/index.html", "public/dashboard.html", "public/app.js", "public/styles.css"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});
