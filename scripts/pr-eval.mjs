#!/usr/bin/env node
import { buildIndexes, repoRootFromMeta, validateRepo } from "./arena-core.mjs";

const root = process.env.ARENA_REPO || repoRootFromMeta(import.meta.url);
const build = buildIndexes(root);
const validation = validateRepo(root);
const problems = [...build.problems, ...validation.problems];
const uniqueProblems = [];
const seen = new Set();

for (const problem of problems) {
  const key = `${problem.file}:${problem.path}:${problem.message}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueProblems.push(problem);
  }
}

console.log("# Agent Interview Arena PR Eval");
console.log("");
console.log(`- Tasks: ${build.taskCount}`);
console.log(`- Submissions: ${build.submissionCount}`);
console.log(`- Problems: ${uniqueProblems.length}`);
console.log("");

if (uniqueProblems.length) {
  console.log("## Problems");
  for (const problem of uniqueProblems) {
    console.log(`- \`${problem.file}:${problem.path}\` ${problem.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Secretless deterministic eval passed.");
}
