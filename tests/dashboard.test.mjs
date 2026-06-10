import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("dashboard has required task, submission, leaderboard surfaces", () => {
  const html = fs.readFileSync(path.join(root, "public/dashboard.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
  assert.equal(html.includes("data-view=\"overview\""), true);
  assert.equal(js.includes("renderOverview"), true);
  assert.equal(js.includes("product-hero"), true);
  assert.equal(html.includes('id="app"'), true);
  assert.equal(js.includes("Try this challenge"), true);
  assert.equal(js.includes("renderSubmissions"), true);
  assert.equal(js.includes("renderLeaderboard"), true);
  assert.equal(js.includes("codex://"), true);
  assert.equal(js.includes("claude://"), true);
});
