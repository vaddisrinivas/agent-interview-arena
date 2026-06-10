import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const TASK_SCHEMA_VERSION = "task.v0";
export const SUBMISSION_SCHEMA_VERSION = "submission.v0";
export const SUBMISSION_SCHEMA_VERSION_V1 = "submission.v1";
export const VALIDATOR_RESULT_SCHEMA_VERSION = "validator_result.v1";
export const INDEX_SCHEMA_VERSION = "arena.index.v0";

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

export function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function push(problemList, file, pathName, message) {
  problemList.push({ file, path: pathName, message });
}

export function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  if (path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  return normalized !== "." && !normalized.startsWith("../") && normalized !== "..";
}

export function isTrustedValidatorPath(value) {
  if (!isSafeRelativePath(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  return normalized.startsWith("validators/tasks/") && normalized.endsWith(".mjs");
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
  } else if (task.evaluation.validator !== undefined) {
    const validator = task.evaluation.validator;
    if (!isObject(validator)) {
      push(problems, file, "evaluation.validator", "must be object");
    } else {
      if (typeof validator.id !== "string" || !validator.id.trim()) {
        push(problems, file, "evaluation.validator.id", "required non-empty string");
      }
      if (validator.type !== "node") {
        push(problems, file, "evaluation.validator.type", "must be node");
      }
      if (!isTrustedValidatorPath(validator.path)) {
        push(problems, file, "evaluation.validator.path", "must stay under validators/tasks/*.mjs");
      }
      if (
        validator.timeout_seconds !== undefined &&
        (!Number.isFinite(Number(validator.timeout_seconds)) || Number(validator.timeout_seconds) <= 0)
      ) {
        push(problems, file, "evaluation.validator.timeout_seconds", "must be positive number");
      }
    }
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
  if (![SUBMISSION_SCHEMA_VERSION, SUBMISSION_SCHEMA_VERSION_V1].includes(submission.schema_version)) {
    push(problems, file, "schema_version", `must be ${SUBMISSION_SCHEMA_VERSION} or ${SUBMISSION_SCHEMA_VERSION_V1}`);
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
  if (!Array.isArray(submission.artifacts)) {
    push(problems, file, "artifacts", "required array");
  } else {
    submission.artifacts.forEach((artifact, index) => {
      if (!isObject(artifact)) push(problems, file, `artifacts.${index}`, "must be object");
      if (artifact?.stored_path !== undefined) {
        const normalizedStoredPath = path.posix.normalize(String(artifact.stored_path).replaceAll("\\", "/"));
        if (!isSafeRelativePath(artifact.stored_path) || !normalizedStoredPath.startsWith("artifacts/")) {
          push(problems, file, `artifacts.${index}.stored_path`, "must be safe relative artifacts path");
        }
      }
      if (submission.schema_version === SUBMISSION_SCHEMA_VERSION_V1) {
        if (typeof artifact?.path !== "string" || !artifact.path.trim()) {
          push(problems, file, `artifacts.${index}.path`, "required string");
        }
        if (typeof artifact?.stored_path !== "string" || !artifact.stored_path.trim()) {
          push(problems, file, `artifacts.${index}.stored_path`, "required string");
        }
        if (typeof artifact?.exists !== "boolean") {
          push(problems, file, `artifacts.${index}.exists`, "required boolean");
        }
        if (typeof artifact?.size_bytes !== "number") {
          push(problems, file, `artifacts.${index}.size_bytes`, "required number");
        }
        if (!(typeof artifact?.sha256 === "string" || artifact?.sha256 === null)) {
          push(problems, file, `artifacts.${index}.sha256`, "required string or null");
        }
        if (typeof artifact?.media_type !== "string" || !artifact.media_type.trim()) {
          push(problems, file, `artifacts.${index}.media_type`, "required string");
        }
      }
    });
  }
  if (!isObject(submission.security)) push(problems, file, "security", "required object");
  return problems;
}
