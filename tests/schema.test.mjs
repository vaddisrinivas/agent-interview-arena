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

test("dashboard entry files exist or are buildable targets", () => {
  for (const file of ["public/index.html", "public/dashboard.html", "public/app.js", "public/styles.css"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});
