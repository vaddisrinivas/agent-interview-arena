import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("dashboard has required task, submission, leaderboard surfaces", () => {
  const html = fs.readFileSync(path.join(root, "public/dashboard.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
  assert.equal(html.includes("data-view=\"overview\""), true);
  assert.equal(js.includes("renderOverview"), true);
  assert.equal(js.includes("product-hero"), true);
  assert.equal(js.includes("Measure how well people steer agents through tasks."), true);
  assert.equal(js.includes("Data sharing note"), true);
  assert.equal(js.includes("operator attempt"), true);
  assert.equal(js.includes("agent-interview-arena-demo.mp4"), true);
  assert.equal(js.includes("validatorPill"), true);
  assert.equal(html.includes('id="app"'), true);
  assert.equal(js.includes("Try this challenge"), true);
  assert.equal(js.includes("renderSubmissions"), true);
  assert.equal(js.includes("renderLeaderboard"), true);
  assert.equal(js.includes("codex://"), true);
  assert.equal(js.includes("claude://"), true);
});

function dashboardVm({ tasks, submissions }) {
  const elements = new Map();
  const createElement = (selector) => ({
    selector,
    innerHTML: "",
    textContent: "",
    value: "",
    dataset: {},
    classList: { toggle() {} },
    addEventListener() {},
    insertAdjacentHTML(position, html) {
      this.innerHTML += html;
    },
    querySelectorAll() {
      return [];
    },
    showModal() {}
  });
  const getElement = (selector) => {
    if (!elements.has(selector)) elements.set(selector, createElement(selector));
    return elements.get(selector);
  };
  const document = {
    querySelector: getElement,
    querySelectorAll() {
      return [];
    }
  };
  const sandbox = {
    __tasks: tasks,
    __submissions: submissions,
    document,
    navigator: { clipboard: { writeText() {} } },
    setTimeout,
    fetch: async (resource) => ({
      ok: true,
      json: async () => (String(resource).includes("submissions") ? { submissions } : { tasks })
    })
  };
  vm.runInNewContext(
    `${fs.readFileSync(path.join(root, "public/app.js"), "utf8")}
state.tasks = __tasks;
state.submissions = __submissions;
state.selectedTaskId = __tasks[0]?.task_id || null;`,
    sandbox
  );
  return { sandbox, elements };
}

function sampleTask() {
  return {
    task_id: "arena-csv-json-tool-v0",
    title: "CSV JSON tool",
    difficulty: 2,
    prompt: "Convert CSV.",
    skills: [{ skill_id: "artifact_packaging", name: "Artifact packaging" }],
    tags: ["csv"],
    expected_output: { description: "Package", must_include: ["output JSON"] },
    artifacts: [
      {
        artifact_id: "converted_json",
        path: "csv-json-tool/output.json",
        type: "json",
        required: true,
        description: "Converted JSON output."
      }
    ],
    evaluation: {
      weights: { task_validator: 0.45 },
      rubric: ["All rows preserved."]
    },
    interviewer: { allowed_questions: [], answers: {} }
  };
}

function sampleSubmission() {
  return {
    submission_id: "csv-failing-run",
    task_id: "arena-csv-json-tool-v0",
    created_at: "2026-06-10T00:00:00Z",
    agent: { model: "test-model" },
    metrics: {
      wall_time_seconds: 30,
      tokens: { total: 42 },
      cost_usd_estimate: 0,
      tool_calls: { total: 1 }
    },
    artifacts: [
      {
        path: "csv-json-tool/output.json",
        stored_path: "artifacts/csv-json-tool/output.json",
        size_bytes: 128,
        media_type: "application/json"
      }
    ],
    security: { findings: [] },
    evaluation_result: {
      deterministic_score: 52,
      validator_result: {
        schema_version: "validator_result.v1",
        id: "csv_json_tool_v0",
        skipped: false,
        passed: false,
        score: 0.25,
        checks: [
          {
            id: "row_count",
            passed: false,
            message: "Expected 3 converted rows."
          }
        ]
      }
    }
  };
}

test("dashboard submission render includes validator status, details, and artifact context", () => {
  const { sandbox, elements } = dashboardVm({ tasks: [sampleTask()], submissions: [sampleSubmission()] });
  sandbox.setView("submissions");
  const html = elements.get("#view").innerHTML;
  assert.match(html, /failed 25/);
  assert.match(html, /csv_json_tool_v0/);
  assert.match(html, /row_count/);
  assert.match(html, /Expected 3 converted rows\./);
  assert.match(html, /csv-json-tool\/output\.json/);
});

test("dashboard task and try dialog render artifact contract and public ack copy", () => {
  const task = sampleTask();
  const { sandbox, elements } = dashboardVm({ tasks: [task], submissions: [] });
  const detail = sandbox.renderTaskDetail(task);
  assert.match(detail, /csv-json-tool\/output\.json/);
  assert.match(detail, /Converted JSON output\./);

  sandbox.openTryDialog(task);
  const tryHtml = elements.get("#tryContent").innerHTML;
  assert.match(tryHtml, /--dry-run --artifact &lt;(path|public-artifact-file)&gt;/);
  assert.match(tryHtml, /--ack-public-data --artifact &lt;(path|public-artifact-file)&gt; --notes &quot;Done&quot;/);
  assert.match(tryHtml, /Submission PRs can publish .*artifact files.*redacted transcript snippets/s);
});
