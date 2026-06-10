import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildIndexes, loadSubmissions, loadTasks, readJson } from "../scripts/arena-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function baseSubmission(taskId, artifacts) {
  return {
    schema_version: "submission.v1",
    submission_id: `${taskId}-test`,
    task_id: taskId,
    created_at: "2026-06-10T00:00:00Z",
    host: { app: "test", hostname: "test", repo_root: "/tmp/test" },
    agent: { type: "test", model: "test-model", models_seen: ["test-model"] },
    chat: { id: "test", source_path: null },
    metrics: {
      wall_time_seconds: 60,
      tokens: { prompt: 1, completion: 1, cached: 0, reasoning: 0, total: 2 },
      cost_usd_estimate: 0,
      pricing: { source: "test" },
      tool_calls: { total: 0, by_name: {} },
      reprompts: 0,
      user_messages: 1,
      assistant_messages: 1,
      events_seen: 2,
      system: { start: {}, end: {} }
    },
    skills: [],
    artifacts,
    quality: { self_review: "test", human_quality_score: null, llm_judge_score: null },
    security: { redaction: "test", findings: [], blocked: false },
    transcript: { capture: "redacted_snippets", events: [] }
  };
}

function writePackage(temp, taskId, files) {
  fs.cpSync(path.join(root, "tasks"), path.join(temp, "tasks"), { recursive: true });
  fs.cpSync(path.join(root, "validators"), path.join(temp, "validators"), { recursive: true });
  fs.mkdirSync(path.join(temp, "public/data"), { recursive: true });
  const submissionDir = path.join(temp, "submissions", `${taskId}-test`);
  fs.mkdirSync(path.join(submissionDir, "artifacts"), { recursive: true });
  const artifacts = [];
  for (const [artifactPath, content] of Object.entries(files)) {
    const stored = path.join(submissionDir, "artifacts", artifactPath);
    fs.mkdirSync(path.dirname(stored), { recursive: true });
    fs.writeFileSync(stored, content);
    artifacts.push({
      path: artifactPath,
      stored_path: `artifacts/${artifactPath}`,
      exists: true,
      size_bytes: Buffer.byteLength(content),
      sha256: "test",
      media_type: artifactPath.endsWith(".json") ? "application/json" : "text/plain"
    });
  }
  fs.writeFileSync(path.join(submissionDir, "submission.json"), `${JSON.stringify(baseSubmission(taskId, artifacts), null, 2)}\n`);
}

test("loads legacy and package submissions", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-load-"));
  fs.mkdirSync(path.join(temp, "submissions/packaged"), { recursive: true });
  fs.copyFileSync(path.join(root, "tests/fixtures/sample-submission.json"), path.join(temp, "submissions/legacy.json"));
  fs.copyFileSync(path.join(root, "tests/fixtures/sample-submission.json"), path.join(temp, "submissions/packaged/submission.json"));
  const entries = loadSubmissions(temp);
  assert.equal(entries.length, 2);
  assert.equal(entries.some((entry) => entry.legacy), true);
  assert.equal(entries.some((entry) => !entry.legacy), true);
});

test("csv validator passes valid artifact and fails malformed JSON", async () => {
  const valid = fs.mkdtempSync(path.join(os.tmpdir(), "arena-csv-valid-"));
  writePackage(valid, "arena-csv-json-tool-v0", {
    "csv-json-tool/output.json": JSON.stringify([
      { name: "Ada Lovelace", email: "ada@example.test", role: "admin" },
      { name: "Grace Hopper", email: "grace@example.test", role: "maintainer" },
      { name: "Margaret Hamilton", email: "margaret@example.test", role: "reviewer" }
    ]),
    "csv-json-tool/README.md": "run"
  });
  const validResult = await buildIndexes(valid);
  const validEval = validResult.submissionIndex.submissions[0].evaluation_result;
  assert.equal(validEval.validator_result.passed, true);
  assert.equal(validEval.task_validator_score > 0.9, true);

  const bad = fs.mkdtempSync(path.join(os.tmpdir(), "arena-csv-bad-"));
  writePackage(bad, "arena-csv-json-tool-v0", {
    "csv-json-tool/output.json": "{bad",
    "csv-json-tool/README.md": "run"
  });
  const badResult = await buildIndexes(bad);
  assert.equal(badResult.submissionIndex.submissions[0].evaluation_result.validator_result.passed, false);
});

test("markdown and password validators lower score for missing safety requirements", async () => {
  const markdown = fs.mkdtempSync(path.join(os.tmpdir(), "arena-md-bad-"));
  writePackage(markdown, "arena-markdown-preview-v0", {
    "markdown-preview/index.html": "<textarea></textarea><div id='preview'></div># markdown",
    "markdown-preview/README.md": "run it"
  });
  const mdEval = (await buildIndexes(markdown)).submissionIndex.submissions[0].evaluation_result;
  assert.equal(mdEval.validator_result.passed, false);
  assert.equal(mdEval.task_validator_score < 1, true);

  const password = fs.mkdtempSync(path.join(os.tmpdir(), "arena-pw-bad-"));
  writePackage(password, "arena-password-generator-v0", {
    "password-generator/index.html": "<input name='length'><button>copy</button><script>Math.random()</script>",
    "password-generator/security-review.md": "uppercase lowercase number symbol not stored"
  });
  const pwEval = (await buildIndexes(password)).submissionIndex.submissions[0].evaluation_result;
  assert.equal(pwEval.validator_result.passed, false);
  assert.equal(pwEval.validator_result.checks.some((check) => check.id === "no_math_random_only" && !check.passed), true);
});

test("validator timeout returns failed validator result", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-timeout-"));
  fs.cpSync(path.join(root, "validators"), path.join(temp, "validators"), { recursive: true });
  fs.mkdirSync(path.join(temp, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(temp, "public/data"), { recursive: true });
  fs.writeFileSync(
    path.join(temp, "validators/tasks/slow-v0.mjs"),
    "export async function validate(){ await new Promise((resolve) => setTimeout(resolve, 50)); return {passed:true,score:1,checks:[]}; }\n"
  );
  const task = structuredClone(loadTasks(root).find(({ task }) => task.task_id === "arena-csv-json-tool-v0").task);
  task.task_id = "slow-task-v0";
  task.evaluation.validator = { id: "slow_v0", type: "node", path: "validators/tasks/slow-v0.mjs", timeout_seconds: 0.001 };
  fs.writeFileSync(path.join(temp, "tasks/slow-task-v0.json"), `${JSON.stringify(task, null, 2)}\n`);
  writePackage(temp, "slow-task-v0", {
    "csv-json-tool/output.json": "[]",
    "csv-json-tool/README.md": "run"
  });
  const evalResult = (await buildIndexes(temp)).submissionIndex.submissions[0].evaluation_result.validator_result;
  assert.equal(evalResult.passed, false);
  assert.equal(evalResult.checks[0].id, "validator_error");
});
