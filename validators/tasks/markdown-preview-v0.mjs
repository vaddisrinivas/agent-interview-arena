function check(id, passed, message) {
  return { id, passed: Boolean(passed), message };
}

export async function validate(ctx) {
  const checks = [];
  let html = "";
  let readme = "";
  try {
    html = ctx.readArtifactText("markdown-preview/index.html");
    checks.push(check("html_exists", true, "index.html is readable"));
  } catch (error) {
    checks.push(check("html_exists", false, error.message));
  }
  try {
    readme = ctx.readArtifactText("markdown-preview/README.md");
    checks.push(check("readme_exists", true, "README.md is readable"));
  } catch (error) {
    checks.push(check("readme_exists", false, error.message));
  }
  const lowerHtml = html.toLowerCase();
  const lowerReadme = readme.toLowerCase();
  checks.push(check("editor_area", /textarea|contenteditable|editor/.test(lowerHtml), "editor surface is present"));
  checks.push(check("preview_area", /preview/.test(lowerHtml), "preview surface is present"));
  checks.push(check("sample_markdown", /```|# |markdown|inline code|list/.test(lowerHtml), "sample markdown content is present"));
  checks.push(
    check(
      "unsafe_html_note",
      /sanitize|escape|unsafe html|raw html|xss/.test(`${lowerHtml}\n${lowerReadme}`),
      "unsafe HTML handling is documented"
    )
  );
  const passed = checks.every((item) => item.passed);
  return { passed, score: checks.filter((item) => item.passed).length / checks.length, checks };
}
