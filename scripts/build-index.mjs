#!/usr/bin/env node
import { buildIndexes, repoRootFromMeta } from "./arena-core.mjs";

const root = process.env.ARENA_REPO || repoRootFromMeta(import.meta.url);
const result = await buildIndexes(root);

console.log(`tasks=${result.taskCount} submissions=${result.submissionCount} problems=${result.problems.length}`);
if (result.problems.length) {
  for (const problem of result.problems) {
    console.error(`${problem.file}:${problem.path}: ${problem.message}`);
  }
  process.exitCode = 1;
}
