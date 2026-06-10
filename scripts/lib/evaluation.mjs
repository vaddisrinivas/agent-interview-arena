import fs from "node:fs";
import path from "node:path";
import { VALIDATOR_RESULT_SCHEMA_VERSION, isObject, isTrustedValidatorPath } from "./contracts.mjs";
import { artifactByPath, storedArtifactPath } from "./submissions.mjs";

function requiredArtifactNames(task) {
  return (task.artifacts || []).filter((artifact) => artifact.required).map((artifact) => artifact.path);
}

function skippedValidatorResult(reason = "no validator configured") {
  return {
    schema_version: VALIDATOR_RESULT_SCHEMA_VERSION,
    id: null,
    skipped: true,
    passed: null,
    score: null,
    checks: [],
    message: reason
  };
}

function failedValidatorResult(id, message) {
  return {
    schema_version: VALIDATOR_RESULT_SCHEMA_VERSION,
    id,
    skipped: false,
    passed: false,
    score: 0,
    checks: [{ id: "validator_error", passed: false, message }]
  };
}

function normalizeValidatorResult(id, result) {
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  const score = Number.isFinite(Number(result?.score)) ? Math.max(0, Math.min(1, Number(result.score))) : 0;
  return {
    schema_version: VALIDATOR_RESULT_SCHEMA_VERSION,
    id,
    skipped: Boolean(result?.skipped),
    passed: Boolean(result?.passed),
    score,
    checks: checks.map((check, index) => ({
      id: String(check?.id || `check_${index + 1}`),
      passed: Boolean(check?.passed),
      message: String(check?.message || "")
    }))
  };
}

async function withTimeout(promise, timeoutMs, id) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`validator timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timer]);
  } catch (error) {
    return failedValidatorResult(id, error.message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runTaskValidator({ root, task, submission, submissionDir }) {
  const validator = task?.evaluation?.validator;
  if (!validator) return skippedValidatorResult();
  if (validator.type !== "node" || !isTrustedValidatorPath(validator.path)) {
    return failedValidatorResult(validator.id || "invalid_validator", "validator is not a trusted node validator");
  }
  const validatorPath = path.resolve(root, validator.path);
  const validatorRoot = path.resolve(root, "validators/tasks");
  if (!validatorPath.startsWith(`${validatorRoot}${path.sep}`)) {
    return failedValidatorResult(validator.id, "validator path escapes validators/tasks");
  }
  const artifacts = submission.artifacts || [];
  const ctx = {
    root,
    task,
    submission,
    submissionDir,
    artifacts,
    artifactPath: (artifactPath) => {
      const artifact = artifactByPath(submission, artifactPath);
      return artifact ? storedArtifactPath(submissionDir, artifact) : null;
    },
    readArtifactText: (artifactPath) => {
      const file = ctx.artifactPath(artifactPath);
      if (!file || !fs.existsSync(file)) throw new Error(`missing artifact ${artifactPath}`);
      return fs.readFileSync(file, "utf8");
    },
    readArtifactJson: (artifactPath) => JSON.parse(ctx.readArtifactText(artifactPath))
  };
  const timeoutMs = Number(validator.timeout_seconds || 10) * 1000;
  const run = async () => {
    const mod = await import(`${validatorPath}?t=${Date.now()}`);
    if (typeof mod.validate !== "function") throw new Error("validator must export validate(ctx)");
    return normalizeValidatorResult(validator.id, await mod.validate(ctx));
  };
  const result = await withTimeout(run(), timeoutMs, validator.id);
  return isObject(result) && result.schema_version === VALIDATOR_RESULT_SCHEMA_VERSION
    ? result
    : normalizeValidatorResult(validator.id, result);
}

function weightedScore(components, weights) {
  const entries = Object.entries(weights || {}).filter(([key]) => Number.isFinite(components[key]));
  if (!entries.length) return null;
  const totalWeight = entries.reduce((sum, [, weight]) => sum + Number(weight || 0), 0);
  if (!totalWeight) return null;
  return entries.reduce((sum, [key, weight]) => sum + components[key] * (Number(weight || 0) / totalWeight), 0);
}

export async function scoreSubmission(submission, task, context = {}) {
  const provided = new Set(
    (submission.artifacts || [])
      .filter((artifact) => artifact.exists !== false)
      .map((artifact) => artifact.path || artifact.artifact_id)
  );
  const required = requiredArtifactNames(task);
  const artifactCompleteness = required.length === 0 ? 1 : required.filter((name) => provided.has(name)).length / required.length;
  const securityFindings = submission.security?.findings || [];
  const security = securityFindings.length === 0 ? 1 : Math.max(0, 1 - securityFindings.length * 0.25);
  const metrics = submission.metrics || {};
  const metadataChecks = [
    Boolean(submission.agent?.model),
    typeof metrics.wall_time_seconds === "number",
    Boolean(metrics.tokens),
    Boolean(metrics.tool_calls),
    Array.isArray(submission.transcript?.events)
  ];
  const metadata = metadataChecks.filter(Boolean).length / metadataChecks.length;
  const efficiencyCapture = Boolean(metrics.tokens) && typeof metrics.wall_time_seconds === "number" ? 1 : 0;
  const validatorResult =
    context.root && context.submissionDir
      ? await runTaskValidator({ root: context.root, task, submission, submissionDir: context.submissionDir })
      : skippedValidatorResult("validator skipped outside package context");
  const components = {
    task_validator: Number.isFinite(validatorResult.score) ? validatorResult.score : NaN,
    artifact_completeness: artifactCompleteness,
    artifact_score: artifactCompleteness,
    security,
    security_score: security,
    metadata,
    metadata_score: metadata,
    efficiency: efficiencyCapture,
    efficiency_capture: efficiencyCapture
  };
  const fallbackWeights = {
    artifact_completeness: 0.6,
    security: 0.25,
    metadata: 0.15
  };
  const score = weightedScore(components, task.evaluation?.weights) ?? weightedScore(components, fallbackWeights);
  return {
    deterministic_score: Math.round((score ?? 0) * 100),
    artifact_score: Number(artifactCompleteness.toFixed(3)),
    security_score: Number(security.toFixed(3)),
    metadata_score: Number(metadata.toFixed(3)),
    task_validator_score: Number.isFinite(validatorResult.score) ? Number(validatorResult.score.toFixed(3)) : null,
    component_scores: Object.fromEntries(
      Object.entries(components)
        .filter(([, value]) => Number.isFinite(value))
        .map(([key, value]) => [key, Number(value.toFixed(3))])
    ),
    validator_result: validatorResult,
    required_artifacts: required,
    missing_artifacts: required.filter((name) => !provided.has(name)),
    scoring_notes: validatorResult.skipped ? ["task validator skipped"] : []
  };
}
