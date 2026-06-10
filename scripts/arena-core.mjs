import fs from "node:fs";
import path from "node:path";
import {
  INDEX_SCHEMA_VERSION,
  SUBMISSION_SCHEMA_VERSION,
  SUBMISSION_SCHEMA_VERSION_V1,
  TASK_SCHEMA_VERSION,
  VALIDATOR_RESULT_SCHEMA_VERSION,
  jsonFiles,
  readJson,
  repoRootFromMeta,
  sha256,
  validateSubmission,
  validateTask,
  writeJson
} from "./lib/contracts.mjs";
import { redactString, redactValue, scanSecrets } from "./lib/redaction.mjs";
import { loadSubmissions, loadTasks, storedArtifactPath } from "./lib/submissions.mjs";
import { scoreSubmission } from "./lib/evaluation.mjs";

export {
  INDEX_SCHEMA_VERSION,
  SUBMISSION_SCHEMA_VERSION,
  SUBMISSION_SCHEMA_VERSION_V1,
  TASK_SCHEMA_VERSION,
  VALIDATOR_RESULT_SCHEMA_VERSION,
  jsonFiles,
  loadSubmissions,
  loadTasks,
  readJson,
  redactString,
  redactValue,
  repoRootFromMeta,
  scanSecrets,
  scoreSubmission,
  sha256,
  validateSubmission,
  validateTask,
  writeJson
};

function shouldScanArtifact(artifact, artifactPath) {
  const mediaType = String(artifact?.media_type || "").toLowerCase();
  if (
    mediaType.startsWith("text/") ||
    ["application/json", "application/javascript", "application/xml", "application/x-yaml"].includes(mediaType)
  ) {
    return true;
  }
  return /\.(md|txt|json|jsonl|csv|tsv|html|css|js|mjs|cjs|xml|yml|yaml|log)$/i.test(artifactPath);
}

function addToken(metrics, key, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (/cached/i.test(key)) metrics.tokens.cached += value;
  else if (/reasoning/i.test(key)) metrics.tokens.reasoning += value;
  else if (/(input|prompt)/i.test(key)) metrics.tokens.prompt += value;
  else if (/(output|completion)/i.test(key)) metrics.tokens.completion += value;
  else if (/total/i.test(key)) metrics.tokens.total += value;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function walkMetric(value, metrics) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkMetric(item, metrics));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "number" && /tokens?$/i.test(key)) addToken(metrics, key, child);
    if (typeof child === "string" && key.toLowerCase() === "model") metrics.models.add(child);
    if (key === "name" && typeof child === "string" && /tool|function/i.test(String(value.type || ""))) {
      metrics.toolNames[child] = (metrics.toolNames[child] || 0) + 1;
    }
    walkMetric(child, metrics);
  }
}

export function parseJsonlMetrics(text) {
  const metrics = {
    events: 0,
    user_messages: 0,
    assistant_messages: 0,
    tool_calls: 0,
    toolNames: {},
    models: new Set(),
    tokens: {
      prompt: 0,
      completion: 0,
      cached: 0,
      reasoning: 0,
      total: 0
    }
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    metrics.events += 1;
    const eventText = JSON.stringify(event);
    if (/"role"\s*:\s*"user"/.test(eventText) || /"type"\s*:\s*"user"/.test(eventText)) metrics.user_messages += 1;
    if (/"role"\s*:\s*"assistant"/.test(eventText) || /"type"\s*:\s*"assistant"/.test(eventText)) metrics.assistant_messages += 1;
    if (/function_call|tool_use|tool_call/i.test(eventText)) metrics.tool_calls += 1;
    walkMetric(event, metrics);
  }
  if (!metrics.tokens.total) {
    metrics.tokens.total = metrics.tokens.prompt + metrics.tokens.completion + metrics.tokens.cached + metrics.tokens.reasoning;
  }
  return {
    events: metrics.events,
    user_messages: metrics.user_messages,
    assistant_messages: metrics.assistant_messages,
    tool_calls_total: metrics.tool_calls,
    tool_calls_by_name: metrics.toolNames,
    models: [...metrics.models].sort(),
    tokens: metrics.tokens
  };
}

export async function buildIndexes(root) {
  const taskEntries = loadTasks(root);
  const submissionEntries = loadSubmissions(root);
  const taskProblems = taskEntries.flatMap(({ file, task }) => validateTask(task, path.relative(root, file)));
  const taskMap = new Map(taskEntries.map(({ task }) => [task.task_id, task]));
  const submissionProblems = submissionEntries.flatMap(({ file, submission }) =>
    validateSubmission(submission, taskMap, path.relative(root, file))
  );
  const taskIndex = {
    schema_version: INDEX_SCHEMA_VERSION,
    tasks: taskEntries.map(({ task }) => task).sort((a, b) => a.task_id.localeCompare(b.task_id))
  };
  const scored = [];
  for (const entry of submissionEntries) {
    const task = taskMap.get(entry.submission.task_id);
    scored.push({
      ...entry.submission,
      submission_package: entry.legacy ? "legacy-json" : "folder-v1",
      evaluation_result: task
        ? await scoreSubmission(entry.submission, task, {
            root,
            submissionDir: entry.submissionDir
          })
        : null
    });
  }
  const submissionIndex = {
    schema_version: INDEX_SCHEMA_VERSION,
    submissions: scored.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  };
  writeJson(path.join(root, "public/data/tasks.json"), taskIndex);
  writeJson(path.join(root, "public/data/submissions.json"), submissionIndex);
  return {
    taskCount: taskEntries.length,
    submissionCount: submissionEntries.length,
    problems: [...taskProblems, ...submissionProblems],
    taskIndex,
    submissionIndex
  };
}

export function validateRepo(root) {
  const taskEntries = loadTasks(root);
  const taskMap = new Map(taskEntries.map(({ task }) => [task.task_id, task]));
  const problems = [];
  for (const { file, task } of taskEntries) {
    problems.push(...validateTask(task, path.relative(root, file)));
    const allowSyntheticSecrets = task.fixture_safety?.allow_secret_like_values === true;
    for (const finding of scanSecrets(task)) {
      if (allowSyntheticSecrets && finding.path.startsWith("$.prompt")) continue;
      problems.push({ file: path.relative(root, file), path: finding.path, message: `secret-like value: ${finding.type}` });
    }
  }
  for (const { file, submission, submissionDir } of loadSubmissions(root)) {
    problems.push(...validateSubmission(submission, taskMap, path.relative(root, file)));
    const findings = scanSecrets(submission);
    for (const finding of findings) {
      problems.push({ file: path.relative(root, file), path: finding.path, message: `secret-like value: ${finding.type}` });
    }
    for (const [index, artifact] of (submission.artifacts || []).entries()) {
      if (!artifact?.stored_path) continue;
      const artifactPath = storedArtifactPath(submissionDir, artifact);
      if (!artifactPath || !fs.existsSync(artifactPath) || !shouldScanArtifact(artifact, artifactPath)) continue;
      const stat = fs.statSync(artifactPath);
      if (!stat.isFile() || stat.size > 1024 * 1024) continue;
      for (const finding of scanSecrets(fs.readFileSync(artifactPath, "utf8"))) {
        problems.push({
          file: path.relative(root, artifactPath),
          path: `$.artifacts[${index}].content${finding.path}`,
          message: `secret-like value: ${finding.type}`
        });
      }
    }
  }
  return {
    taskCount: taskEntries.length,
    submissionCount: loadSubmissions(root).length,
    problems
  };
}
