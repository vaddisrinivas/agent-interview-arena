import assert from "node:assert/strict";
import test from "node:test";
import { redactString, scanSecrets } from "../scripts/arena-core.mjs";

test("detects common secret patterns", () => {
  const findings = scanSecrets({
    body: "token ghp_exampleShouldBeRemoved1234567890 and api_key=sk-exampleShouldBeRemoved1234567890 password=hunter2"
  });
  assert.equal(findings.length >= 3, true);
  assert.equal(findings.some((finding) => finding.type === "github_token"), true);
});

test("redacts common secret patterns", () => {
  const input = "ghp_exampleShouldBeRemoved1234567890 api_key=sk-exampleShouldBeRemoved1234567890 password=hunter2";
  const output = redactString(input);
  assert.equal(output.includes("ghp_example"), false);
  assert.equal(output.includes("sk-example"), false);
  assert.equal(output.includes("hunter2"), false);
  assert.equal(output.includes("[REDACTED"), true);
});
