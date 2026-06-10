#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeJson } from "./arena-core.mjs";

function usage() {
  console.error("usage: import-app-idea.mjs <raw-url> --task-id <id> --title <title> [--source-file file] [--write file]");
  process.exit(1);
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] || "";
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function readSource(rawUrl, sourceFile) {
  if (sourceFile) return fs.readFileSync(sourceFile, "utf8");
  const response = await fetch(rawUrl);
  if (!response.ok) throw new Error(`${rawUrl} ${response.status}`);
  return response.text();
}

function stripMarkdown(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function draftTask({ rawUrl, source, taskId, title }) {
  const artifactRoot = slug(title || taskId);
  const promptBody = stripMarkdown(source).slice(0, 5000);
  return {
    schema_version: "task.v0",
    task_id: taskId,
    title,
    difficulty: 3,
    tags: ["small-app", "imported-draft", "needs-review"],
    skills: [
      { skill_id: "prompt_decomposition", name: "Prompt decomposition", weight: 0.25 },
      { skill_id: "implementation", name: "Implementation", weight: 0.35 },
      { skill_id: "artifact_packaging", name: "Artifact packaging", weight: 0.25 },
      { skill_id: "quality_review", name: "Quality review", weight: 0.15 }
    ],
    prompt: `Convert the app idea below into a small, reviewable arena artifact. Keep the scope bounded, include run instructions, and document any assumptions.\n\nSource: ${rawUrl}\n\n${promptBody}`,
    expected_output: {
      description: "A small app artifact package with source, README, and verification notes.",
      must_include: [
        `${artifactRoot}/README.md`,
        `${artifactRoot}/index.html or equivalent source`,
        "clear run instructions",
        "manual verification checklist",
        "privacy/security notes when relevant"
      ]
    },
    artifacts: [
      {
        artifact_id: "app_readme",
        path: `${artifactRoot}/README.md`,
        type: "markdown",
        required: true,
        description: "Run instructions, assumptions, and verification notes."
      },
      {
        artifact_id: "app_source",
        path: `${artifactRoot}/index.html`,
        type: "html",
        required: true,
        description: "Standalone app source or entrypoint."
      }
    ],
    evaluation: {
      mode: "deterministic_plus_human",
      weights: {
        artifact_completeness: 0.35,
        security: 0.2,
        efficiency: 0.1,
        human_quality: 0.35
      },
      rubric: [
        "Artifact matches the imported app idea.",
        "Implementation is small and easy to review.",
        "README explains how to run and verify the app.",
        "Security/privacy tradeoffs are documented."
      ]
    },
    interviewer: {
      allowed_questions: [
        "Can I reduce scope?",
        "Do I need a backend?",
        "Can I use fixture data?"
      ],
      answers: {
        "Can I reduce scope?": "Yes. Keep the core user stories and document removed scope.",
        "Do I need a backend?": "No. Prefer a static or fixture-backed artifact unless the task explicitly requires persistence.",
        "Can I use fixture data?": "Yes. Prefer deterministic fixture data for PR-safe evaluation."
      }
    },
    security_notes: ["Do not include secrets, real customer data, or proprietary code."],
    source: {
      type: "app_idea",
      url: rawUrl
    }
  };
}

const args = process.argv.slice(2);
const rawUrl = args[0];
const taskId = argValue(args, "--task-id");
const title = argValue(args, "--title");
const sourceFile = argValue(args, "--source-file");
const writePath = argValue(args, "--write");
if (!rawUrl || !taskId || !title) usage();

const source = await readSource(rawUrl, sourceFile);
const task = draftTask({ rawUrl, source, taskId, title });
if (writePath) {
  writeJson(path.resolve(writePath), task);
} else {
  process.stdout.write(`${JSON.stringify(task, null, 2)}\n`);
}
