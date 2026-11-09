import { createId } from "../shared/id.js";
import { issue, validationResult } from "../shared/errors.js";

export const MSYNC_FORMAT_VERSION = 1;

export function createMsyncAttachment(overrides = {}) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: createId("msync"),
    trackId: null,
    formatVersion: MSYNC_FORMAT_VERSION,
    sourceFilename: "",
    sourceText: "",
    sourceSha256: "",
    parsed: null,
    validationReceipt: null,
    importedAt: now,
    updatedAt: now,
    ...overrides,
  });
}

export function validateMsyncAttachment(attachment) {
  const issues = [];
  if (!attachment || typeof attachment !== "object") return validationResult([issue("MSYNC_ATTACHMENT_REQUIRED", "MSYNC attachment is required", "msync")]);
  if (!attachment.trackId) issues.push(issue("MSYNC_TRACK_REQUIRED", "MSYNC attachment requires a Track", "trackId"));
  if (attachment.formatVersion !== MSYNC_FORMAT_VERSION) issues.push(issue("MSYNC_VERSION", "Unsupported MSYNC format version", "formatVersion"));
  if (!attachment.sourceFilename) issues.push(issue("MSYNC_FILENAME", "MSYNC source filename is required", "sourceFilename"));
  if (typeof attachment.sourceText !== "string" || !attachment.sourceText.trim()) issues.push(issue("MSYNC_SOURCE", "MSYNC source text is required", "sourceText"));
  if (!/^[a-f0-9]{64}$/i.test(attachment.sourceSha256)) issues.push(issue("MSYNC_SOURCE_HASH", "MSYNC source SHA-256 is invalid", "sourceSha256"));
  if (!attachment.parsed) issues.push(issue("MSYNC_PARSED", "MSYNC parsed representation is required", "parsed"));
  if (!attachment.validationReceipt) issues.push(issue("MSYNC_RECEIPT", "MSYNC validation receipt is required", "validationReceipt"));
  return validationResult(issues, attachment);
}
