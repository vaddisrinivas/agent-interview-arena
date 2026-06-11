import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugin/scripts/arena.py");

function setupRepo() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-plugin-"));
  fs.cpSync(path.join(root, "tasks"), path.join(temp, "tasks"), { recursive: true });
  fs.mkdirSync(path.join(temp, "submissions"), { recursive: true });
  fs.mkdirSync(path.join(temp, "work/csv-json-tool"), { recursive: true });
  fs.writeFileSync(
    path.join(temp, "work/csv-json-tool/output.json"),
    JSON.stringify([
      { name: "Ada Lovelace", email: "ada@example.test", role: "admin" },
      { name: "Grace Hopper", email: "grace@example.test", role: "maintainer" },
      { name: "Margaret Hamilton", email: "margaret@example.test", role: "reviewer" }
    ])
  );
  fs.writeFileSync(path.join(temp, "work/csv-json-tool/README.md"), "run instructions");
  return temp;
}

function env(temp) {
  return { ...process.env, HOME: path.join(temp, "home"), ARENA_REPO: temp };
}

function start(temp) {
  execFileSync("python3", [plugin, "start", "arena-csv-json-tool-v0"], { cwd: path.join(temp, "work"), env: env(temp) });
}

test("submit --dry-run writes nothing", () => {
  const temp = setupRepo();
  start(temp);
  const output = execFileSync(
    "python3",
    [plugin, "submit", "--dry-run", "--artifact", "csv-json-tool/output.json", "--artifact", "csv-json-tool/README.md"],
    { cwd: path.join(temp, "work"), env: env(temp), encoding: "utf8" }
  );
  assert.match(output, /dry-run submission_id=/);
  assert.match(output, /csv-json-tool\/output\.json -> artifacts\/csv-json-tool\/output\.json/);
  assert.match(output, /(public-data warning|security_findings=0)/);
  assert.deepEqual(fs.readdirSync(path.join(temp, "submissions")), []);
});

test("submit --dry-run does not require public ack", () => {
  const temp = setupRepo();
  start(temp);
  const result = spawnSync(
    "python3",
    [plugin, "submit", "--dry-run", "--artifact", "csv-json-tool/output.json", "--artifact", "csv-json-tool/README.md"],
    { cwd: path.join(temp, "work"), env: env(temp), encoding: "utf8" }
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /dry-run submission_id=/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Refusing to open PR/);
  assert.deepEqual(fs.readdirSync(path.join(temp, "submissions")), []);
});

test("submit --no-pr writes folder package and copies artifacts", () => {
  const temp = setupRepo();
  start(temp);
  execFileSync(
    "python3",
    [
      plugin,
      "submit",
      "--no-pr",
      "--ack-public-data",
      "--artifact",
      "csv-json-tool/output.json",
      "--artifact",
      "csv-json-tool/README.md"
    ],
    { cwd: path.join(temp, "work"), env: env(temp) }
  );
  const dirs = fs.readdirSync(path.join(temp, "submissions"));
  assert.equal(dirs.length, 1);
  const submission = JSON.parse(fs.readFileSync(path.join(temp, "submissions", dirs[0], "submission.json"), "utf8"));
  assert.equal(submission.schema_version, "submission.v1");
  assert.equal(fs.existsSync(path.join(temp, "submissions", dirs[0], "artifacts/csv-json-tool/output.json")), true);
});

test("submit --no-pr stays local without public ack", () => {
  const temp = setupRepo();
  start(temp);
  const result = spawnSync(
    "python3",
    [plugin, "submit", "--no-pr", "--artifact", "csv-json-tool/output.json", "--artifact", "csv-json-tool/README.md"],
    { cwd: path.join(temp, "work"), env: env(temp), encoding: "utf8" }
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /skipped PR/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Refusing to open PR/);
  const dirs = fs.readdirSync(path.join(temp, "submissions"));
  assert.equal(dirs.length, 1);
  assert.equal(fs.existsSync(path.join(temp, "submissions", dirs[0], "artifacts/csv-json-tool/README.md")), true);
});

test("submit without ack refuses PR path before writing", () => {
  const temp = setupRepo();
  start(temp);
  const result = spawnSync(
    "python3",
    [plugin, "submit", "--artifact", "csv-json-tool/output.json", "--artifact", "csv-json-tool/README.md"],
    { cwd: path.join(temp, "work"), env: env(temp), encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--ack-public-data/);
  assert.match(result.stderr, /Public repos expose submission JSON, (public )?artifact files/);
  assert.match(result.stderr, /metrics, paths, hashes, notes, and redacted transcript snippets/);
  assert.deepEqual(fs.readdirSync(path.join(temp, "submissions")), []);
});

test("missing required artifact is reported before write", () => {
  const temp = setupRepo();
  start(temp);
  const result = spawnSync("python3", [plugin, "submit", "--no-pr", "--artifact", "csv-json-tool/output.json"], {
    cwd: path.join(temp, "work"),
    env: env(temp),
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr.includes("csv-json-tool/README.md"), true);
  assert.deepEqual(fs.readdirSync(path.join(temp, "submissions")), []);
});
