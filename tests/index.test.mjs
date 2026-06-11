import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildIndexes, readJson, validateRepo } from "../scripts/arena-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function submissionWithArtifacts(taskId, artifacts) {
  return {
    schema_version: "submission.v1",
    submission_id: `${taskId}-indexed-test`,
    task_id: taskId,
    created_at: "2026-06-10T00:00:00Z",
    host: { app: "test", hostname: "test-host", repo_root: "/tmp/arena" },
    agent: { type: "test", model: "test-model", models_seen: ["test-model"] },
    chat: { id: "test-chat", source_path: null },
    metrics: {
      wall_time_seconds: 45,
      tokens: { prompt: 10, completion: 5, cached: 0, reasoning: 0, total: 15 },
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
    security: { redaction: "common_secret_patterns_v0", findings: [], blocked: false },
    transcript: { capture: "redacted_snippets", events: [] }
  };
}

function setupPackage(files) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-index-v2-"));
  fs.mkdirSync(path.join(temp, "public/data"), { recursive: true });
  fs.cpSync(path.join(root, "tasks"), path.join(temp, "tasks"), { recursive: true });
  fs.cpSync(path.join(root, "validators"), path.join(temp, "validators"), { recursive: true });
  const submissionDir = path.join(temp, "submissions/arena-csv-json-tool-v0-indexed-test");
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
      media_type: artifactPath.endsWith(".json") ? "application/json" : "text/markdown"
    });
  }
  fs.writeFileSync(
    path.join(submissionDir, "submission.json"),
    `${JSON.stringify(submissionWithArtifacts("arena-csv-json-tool-v0", artifacts), null, 2)}\n`
  );
  return temp;
}

function validCsvFiles(extraReadme = "") {
  return {
    "csv-json-tool/output.json": JSON.stringify([
      { name: "Ada Lovelace", email: "ada@example.test", role: "admin" },
      { name: "Grace Hopper", email: "grace@example.test", role: "maintainer" },
      { name: "Margaret Hamilton", email: "margaret@example.test", role: "reviewer" }
    ]),
    "csv-json-tool/README.md": `run instructions\n${extraReadme}`
  };
}

test("builds dashboard indexes from tasks and submissions", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-index-"));
  fs.mkdirSync(path.join(temp, "public/data"), { recursive: true });
  fs.cpSync(path.join(root, "tasks"), path.join(temp, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(temp, "submissions"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "tests/fixtures/sample-submission.json"),
    path.join(temp, "submissions/sample-submission.json")
  );
  const result = await buildIndexes(temp);
  assert.equal(result.problems.length, 0);
  const taskIndex = readJson(path.join(temp, "public/data/tasks.json"));
  const submissionIndex = readJson(path.join(temp, "public/data/submissions.json"));
  assert.equal(taskIndex.tasks.length >= 3, true);
  assert.equal(submissionIndex.submissions.length, 1);
  assert.equal(submissionIndex.submissions[0].evaluation_result.deterministic_score > 0, true);
});

test("buildIndexes writes validator_result into generated submission index", async () => {
  const temp = setupPackage(validCsvFiles());
  const result = await buildIndexes(temp);
  assert.equal(result.problems.length, 0);
  const memoryResult = result.submissionIndex.submissions[0].evaluation_result.validator_result;
  assert.equal(memoryResult.schema_version, "validator_result.v1");
  assert.equal(memoryResult.id, "csv_json_tool_v0");
  assert.equal(memoryResult.passed, true);
  assert.equal(memoryResult.checks.length > 0, true);

  const generated = readJson(path.join(temp, "public/data/submissions.json"));
  const persistedResult = generated.submissions[0].evaluation_result.validator_result;
  assert.deepEqual(persistedResult, memoryResult);
});

test("repo validation scans copied artifact file contents for secrets", () => {
  const temp = setupPackage(validCsvFiles("token=ghp_1234567890abcdefghij"));
  const result = validateRepo(temp);
  assert.equal(
    result.problems.some(
      (problem) =>
        problem.file.endsWith("artifacts/csv-json-tool/README.md") &&
        problem.path === "$.artifacts[1].content$" &&
        problem.message === "secret-like value: github_token"
    ),
    true
  );
});
