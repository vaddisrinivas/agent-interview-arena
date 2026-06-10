import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TASK_SCHEMA_VERSION = "task.v0";
export const SUBMISSION_SCHEMA_VERSION = "submission.v0";
export const INDEX_SCHEMA_VERSION = "arena.index.v0";

const SECRET_PATTERNS = [
  ["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["github_token", /gh[pousr]_[A-Za-z0-9_]{20,}/g],
  ["openai_key", /sk-[A-Za-z0-9_-]{16,}/g],
  ["anthropic_key", /sk-ant-[A-Za-z0-9_-]{16,}/g],
  ["aws_access_key", /AKIA[0-9A-Z]{12,}/g],
  ["password_assignment", /\b(password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]+/gi],
  ["api_key_assignment", /\b(api[_-]?key|token|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi]
];

export function repoRootFromMeta(importMetaUrl) {
  return path.resolve(path.dirname(new URL(importMetaUrl).pathname), "..");
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(dir, name))
    .sort();
}

export function loadTasks(root) {
  return jsonFiles(path.join(root, "tasks")).map((file) => ({
    file,
    task: readJson(file)
  }));
}

export function loadSubmissions(root) {
  return jsonFiles(path.join(root, "submissions")).map((file) => ({
    file,
    submission: readJson(file)
  }));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function push(problemList, file, pathName, message) {
  problemList.push({ file, path: pathName, message });
}

export function validateTask(task, file = "<task>") {
  const problems = [];
  if (!isObject(task)) {
    push(problems, file, "$", "task must be an object");
    return problems;
  }
  for (const key of ["schema_version", "task_id", "title", "prompt"]) {
    if (typeof task[key] !== "string" || !task[key].trim()) {
      push(problems, file, key, "required non-empty string");
    }
  }
  if (task.schema_version !== TASK_SCHEMA_VERSION) {
    push(problems, file, "schema_version", `must be ${TASK_SCHEMA_VERSION}`);
  }
  if (!Number.isInteger(task.difficulty) || task.difficulty < 1 || task.difficulty > 5) {
    push(problems, file, "difficulty", "must be integer 1-5");
  }
  if (!Array.isArray(task.skills) || task.skills.length === 0) {
    push(problems, file, "skills", "must be non-empty array");
  } else {
    task.skills.forEach((skill, index) => {
      if (!isObject(skill)) push(problems, file, `skills.${index}`, "must be object");
      if (typeof skill?.skill_id !== "string") push(problems, file, `skills.${index}.skill_id`, "required string");
      if (typeof skill?.name !== "string") push(problems, file, `skills.${index}.name`, "required string");
    });
  }
  if (!isObject(task.expected_output) || typeof task.expected_output.description !== "string") {
    push(problems, file, "expected_output.description", "required string");
  }
  if (!Array.isArray(task.artifacts)) {
    push(problems, file, "artifacts", "must be array");
  } else {
    task.artifacts.forEach((artifact, index) => {
      if (!isObject(artifact)) push(problems, file, `artifacts.${index}`, "must be object");
      for (const key of ["artifact_id", "path", "type", "description"]) {
        if (typeof artifact?.[key] !== "string") push(problems, file, `artifacts.${index}.${key}`, "required string");
      }
      if (typeof artifact?.required !== "boolean") push(problems, file, `artifacts.${index}.required`, "required boolean");
    });
  }
  if (!isObject(task.evaluation) || !isObject(task.evaluation.weights)) {
    push(problems, file, "evaluation.weights", "required object");
  }
  if (!isObject(task.interviewer) || !Array.isArray(task.interviewer.allowed_questions)) {
    push(problems, file, "interviewer.allowed_questions", "required array");
  }
  return problems;
}

export function validateSubmission(submission, taskMap = new Map(), file = "<submission>") {
  const problems = [];
  if (!isObject(submission)) {
    push(problems, file, "$", "submission must be an object");
    return problems;
  }
  for (const key of ["schema_version", "submission_id", "task_id", "created_at"]) {
    if (typeof submission[key] !== "string" || !submission[key].trim()) {
      push(problems, file, key, "required non-empty string");
    }
  }
  if (submission.schema_version !== SUBMISSION_SCHEMA_VERSION) {
    push(problems, file, "schema_version", `must be ${SUBMISSION_SCHEMA_VERSION}`);
  }
  if (taskMap.size > 0 && !taskMap.has(submission.task_id)) {
    push(problems, file, "task_id", `unknown task_id ${submission.task_id}`);
  }
  if (!isObject(submission.host)) push(problems, file, "host", "required object");
  if (!isObject(submission.agent)) push(problems, file, "agent", "required object");
  if (!isObject(submission.chat)) push(problems, file, "chat", "required object");
  if (!isObject(submission.metrics)) {
    push(problems, file, "metrics", "required object");
  } else {
    if (typeof submission.metrics.wall_time_seconds !== "number") {
      push(problems, file, "metrics.wall_time_seconds", "required number");
    }
    if (!isObject(submission.metrics.tokens)) push(problems, file, "metrics.tokens", "required object");
    if (!isObject(submission.metrics.tool_calls)) push(problems, file, "metrics.tool_calls", "required object");
  }
  if (!Array.isArray(submission.artifacts)) push(problems, file, "artifacts", "required array");
  if (!isObject(submission.security)) push(problems, file, "security", "required object");
  return problems;
}

export function scanSecrets(value, currentPath = "$", findings = []) {
  if (typeof value === "string") {
    for (const [type, pattern] of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      for (const match of value.matchAll(regex)) {
        findings.push({
          type,
          path: currentPath,
          severity: type.includes("password") || type.includes("key") || type.includes("token") ? "high" : "medium",
          fingerprint: sha256(match[0]).slice(0, 12)
        });
      }
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecrets(item, `${currentPath}[${index}]`, findings));
    return findings;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      scanSecrets(child, `${currentPath}.${key}`, findings);
    }
  }
  return findings;
}

export function redactString(text) {
  let output = text;
  output = output.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
  output = output.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]");
  output = output.replace(/sk-ant-[A-Za-z0-9_-]{16,}/g, "[REDACTED_ANTHROPIC_KEY]");
  output = output.replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_API_KEY]");
  output = output.replace(/AKIA[0-9A-Z]{12,}/g, "[REDACTED_AWS_KEY]");
  output = output.replace(/\b(password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED]");
  output = output.replace(/\b(api[_-]?key|token|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED]");
  return output;
}

export function redactValue(value) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactValue(child)]));
  }
  return value;
}

function requiredArtifactNames(task) {
  return (task.artifacts || []).filter((artifact) => artifact.required).map((artifact) => artifact.path);
}

export function scoreSubmission(submission, task) {
  const provided = new Set((submission.artifacts || []).map((artifact) => artifact.path || artifact.artifact_id));
  const required = requiredArtifactNames(task);
  const artifactScore = required.length === 0 ? 1 : required.filter((name) => provided.has(name)).length / required.length;
  const securityFindings = submission.security?.findings || [];
  const securityScore = securityFindings.length === 0 ? 1 : Math.max(0, 1 - securityFindings.length * 0.25);
  const metrics = submission.metrics || {};
  const metadataChecks = [
    Boolean(submission.agent?.model),
    typeof metrics.wall_time_seconds === "number",
    Boolean(metrics.tokens),
    Boolean(metrics.tool_calls),
    Array.isArray(submission.transcript?.events)
  ];
  const metadataScore = metadataChecks.filter(Boolean).length / metadataChecks.length;
  const deterministicScore = Math.round((artifactScore * 0.6 + securityScore * 0.25 + metadataScore * 0.15) * 100);
  return {
    deterministic_score: deterministicScore,
    artifact_score: Number(artifactScore.toFixed(3)),
    security_score: Number(securityScore.toFixed(3)),
    metadata_score: Number(metadataScore.toFixed(3)),
    required_artifacts: required,
    missing_artifacts: required.filter((name) => !provided.has(name))
  };
}

function addToken(metrics, key, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (/cached/i.test(key)) metrics.tokens.cached += value;
  else if (/reasoning/i.test(key)) metrics.tokens.reasoning += value;
  else if (/(input|prompt)/i.test(key)) metrics.tokens.prompt += value;
  else if (/(output|completion)/i.test(key)) metrics.tokens.completion += value;
  else if (/total/i.test(key)) metrics.tokens.total += value;
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

export function buildIndexes(root) {
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
  const submissionIndex = {
    schema_version: INDEX_SCHEMA_VERSION,
    submissions: submissionEntries
      .map(({ submission }) => {
        const task = taskMap.get(submission.task_id);
        return {
          ...submission,
          evaluation_result: task ? scoreSubmission(submission, task) : null
        };
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
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
  for (const { file, submission } of loadSubmissions(root)) {
    problems.push(...validateSubmission(submission, taskMap, path.relative(root, file)));
    const findings = scanSecrets(submission);
    for (const finding of findings) {
      problems.push({ file: path.relative(root, file), path: finding.path, message: `secret-like value: ${finding.type}` });
    }
  }
  return {
    taskCount: taskEntries.length,
    submissionCount: loadSubmissions(root).length,
    problems
  };
}
