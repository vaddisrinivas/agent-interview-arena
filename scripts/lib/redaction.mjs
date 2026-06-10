import { isObject, sha256 } from "./contracts.mjs";

const SECRET_PATTERNS = [
  ["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["github_token", /gh[pousr]_[A-Za-z0-9_]{20,}/g],
  ["openai_key", /sk-[A-Za-z0-9_-]{16,}/g],
  ["anthropic_key", /sk-ant-[A-Za-z0-9_-]{16,}/g],
  ["aws_access_key", /AKIA[0-9A-Z]{12,}/g],
  ["password_assignment", /\b(password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]+/gi],
  ["api_key_assignment", /\b(api[_-]?key|token|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi]
];

export function scanSecrets(value, currentPath = "$", findings = []) {
  if (typeof value === "string") {
    for (const [type, pattern] of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      for (const match of value.matchAll(regex)) {
        findings.push({
          type,
          path: currentPath,
          severity: type.includes("password") || type.includes("key") || type.includes("token") ? "high" : "medium",
          fingerprint: sha256(match[0]).slice(0, 12)
        });
      }
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecrets(item, `${currentPath}[${index}]`, findings));
    return findings;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      scanSecrets(child, `${currentPath}.${key}`, findings);
    }
  }
  return findings;
}

export function redactString(text) {
  let output = text;
  output = output.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
  output = output.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]");
  output = output.replace(/sk-ant-[A-Za-z0-9_-]{16,}/g, "[REDACTED_ANTHROPIC_KEY]");
  output = output.replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_API_KEY]");
  output = output.replace(/AKIA[0-9A-Z]{12,}/g, "[REDACTED_AWS_KEY]");
  output = output.replace(/\b(password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED]");
  output = output.replace(/\b(api[_-]?key|token|secret)\s*[:=]\s*["']?[^"'\s,;]+/gi, "$1=[REDACTED]");
  return output;
}

export function redactValue(value) {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactValue(child)]));
  }
  return value;
}
