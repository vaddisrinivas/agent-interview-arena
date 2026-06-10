function check(id, passed, message) {
  return { id, passed: Boolean(passed), message };
}

const expected = [
  { name: "Ada Lovelace", email: "ada@example.test", role: "admin" },
  { name: "Grace Hopper", email: "grace@example.test", role: "maintainer" },
  { name: "Margaret Hamilton", email: "margaret@example.test", role: "reviewer" }
];

export async function validate(ctx) {
  const checks = [];
  let rows = [];
  try {
    rows = ctx.readArtifactJson("csv-json-tool/output.json");
    checks.push(check("json_parses", true, "output.json parses"));
  } catch (error) {
    checks.push(check("json_parses", false, error.message));
    return { passed: false, score: 0, checks };
  }
  checks.push(check("array_output", Array.isArray(rows), "output is a JSON array"));
  checks.push(check("row_count", Array.isArray(rows) && rows.length === 3, "output has 3 records"));
  const fieldsOk = Array.isArray(rows) && rows.every((row) => ["name", "email", "role"].every((key) => Object.hasOwn(row, key)));
  checks.push(check("fields", fieldsOk, "each row has name, email, and role"));
  const valuesOk = Array.isArray(rows) && expected.every((row, index) => JSON.stringify(rows[index]) === JSON.stringify(row));
  checks.push(check("fixture_values", valuesOk, "rows match the locked fixture values"));
  const passed = checks.every((item) => item.passed);
  return { passed, score: checks.filter((item) => item.passed).length / checks.length, checks };
}
