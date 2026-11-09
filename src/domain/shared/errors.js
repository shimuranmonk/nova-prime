export const ERROR_SEVERITY = Object.freeze({
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
});

export class AppError extends Error {
  constructor({ code, message, userMessage = message, severity = ERROR_SEVERITY.ERROR, recoverable = true, cause, context = {} }) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.severity = severity;
    this.recoverable = recoverable;
    this.context = Object.freeze({ ...context });
  }
}

export function issue(code, message, path = "", severity = ERROR_SEVERITY.ERROR) {
  return Object.freeze({ code, message, path, severity });
}

export function validationResult(issues, value = undefined) {
  const frozenIssues = Object.freeze([...issues]);
  return Object.freeze({
    valid: frozenIssues.every((entry) => entry.severity !== ERROR_SEVERITY.ERROR && entry.severity !== ERROR_SEVERITY.CRITICAL),
    issues: frozenIssues,
    value,
  });
}
