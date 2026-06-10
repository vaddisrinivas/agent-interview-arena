function check(id, passed, message) {
  return { id, passed: Boolean(passed), message };
}

export async function validate(ctx) {
  const checks = [];
  let html = "";
  let review = "";
  try {
    html = ctx.readArtifactText("password-generator/index.html");
    checks.push(check("html_exists", true, "index.html is readable"));
  } catch (error) {
    checks.push(check("html_exists", false, error.message));
  }
  try {
    review = ctx.readArtifactText("password-generator/security-review.md");
    checks.push(check("security_review_exists", true, "security-review.md is readable"));
  } catch (error) {
    checks.push(check("security_review_exists", false, error.message));
  }
  const combined = `${html}\n${review}`;
  const lower = combined.toLowerCase();
  checks.push(check("length_control", /length/.test(lower), "length control is present"));
  checks.push(check("character_groups", /uppercase|lowercase|number|symbol|character group/.test(lower), "character group controls are present"));
  checks.push(check("copy_action", /clipboard|copy/.test(lower), "copy action is present"));
  checks.push(check("no_persistence", /not stored|no storage|not persist|never store|not saved/.test(lower), "no-persistence behavior is documented"));
  checks.push(check("web_crypto", /crypto\.getrandomvalues|web crypto|getrandomvalues/.test(combined), "Web Crypto randomness is used or documented"));
  checks.push(check("no_math_random_only", !/Math\.random/.test(combined), "Math.random is not used as the sole randomness source"));
  const passed = checks.every((item) => item.passed);
  return { passed, score: checks.filter((item) => item.passed).length / checks.length, checks };
}
