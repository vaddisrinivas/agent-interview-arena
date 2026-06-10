#!/usr/bin/env node
import { repoRootFromMeta, validateRepo } from "./arena-core.mjs";

const root = process.env.ARENA_REPO || repoRootFromMeta(import.meta.url);
const result = validateRepo(root);

if (process.argv.includes("--ci")) {
  console.log(`Arena validate: ${result.taskCount} tasks, ${result.submissionCount} submissions`);
}

if (result.problems.length) {
  for (const problem of result.problems) {
    console.error(`${problem.file}:${problem.path}: ${problem.message}`);
  }
  process.exit(1);
}

console.log("Arena validate: ok");
