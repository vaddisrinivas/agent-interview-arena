import fs from "node:fs";
import path from "node:path";
import { jsonFiles, readJson } from "./contracts.mjs";

export function loadTasks(root) {
  return jsonFiles(path.join(root, "tasks")).map((file) => ({
    file,
    task: readJson(file)
  }));
}

export function loadSubmissions(root) {
  const dir = path.join(root, "submissions");
  const entries = [];
  for (const file of jsonFiles(dir)) {
    entries.push({
      file,
      submission: readJson(file),
      submissionDir: path.dirname(file),
      legacy: true
    });
  }
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      const submissionFile = path.join(dir, name, "submission.json");
      if (fs.existsSync(submissionFile)) {
        entries.push({
          file: submissionFile,
          submission: readJson(submissionFile),
          submissionDir: path.dirname(submissionFile),
          legacy: false
        });
      }
    }
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file));
}

export function storedArtifactPath(submissionDir, artifact) {
  if (!artifact?.stored_path) return null;
  const resolved = path.resolve(submissionDir, artifact.stored_path);
  const artifactRoot = path.resolve(submissionDir, "artifacts");
  if (resolved !== artifactRoot && !resolved.startsWith(`${artifactRoot}${path.sep}`)) return null;
  return resolved;
}

export function artifactByPath(submission, artifactPath) {
  return (submission.artifacts || []).find(
    (artifact) => artifact.path === artifactPath || artifact.stored_path === artifactPath || artifact.artifact_id === artifactPath
  );
}
