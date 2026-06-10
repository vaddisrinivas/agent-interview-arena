import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseJsonlMetrics } from "../scripts/arena-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("parses Codex JSONL metrics", () => {
  const text = fs.readFileSync(path.join(root, "tests/fixtures/codex-session.jsonl"), "utf8");
  const metrics = parseJsonlMetrics(text);
  assert.equal(metrics.tokens.total, 175);
  assert.equal(metrics.tokens.prompt, 100);
  assert.equal(metrics.tokens.completion, 50);
  assert.equal(metrics.tool_calls_total >= 1, true);
  assert.equal(metrics.models.includes("gpt-5.4-codex"), true);
});

test("parses Claude JSONL metrics", () => {
  const text = fs.readFileSync(path.join(root, "tests/fixtures/claude-session.jsonl"), "utf8");
  const metrics = parseJsonlMetrics(text);
  assert.equal(metrics.tokens.total >= 150, true);
  assert.equal(metrics.tokens.prompt, 100);
  assert.equal(metrics.tokens.completion, 50);
  assert.equal(metrics.tool_calls_total >= 1, true);
  assert.equal(metrics.models.includes("claude-sonnet-4-6"), true);
});
