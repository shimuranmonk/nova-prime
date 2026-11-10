import { createMsyncAttachment, validateMsyncAttachment } from "../../domain/msync/schema.js";
import { MSYNC_PARSER_VERSION } from "../../domain/msync/parser.js";
import { validateMsyncSource } from "../../domain/msync/validator.js";
import { sha256Hex } from "../music/music-library-service.js";
import { createMsyncValidationContext } from "./context.js";

function assertSupportedFile(file) {
  if (!file?.text || !/\.(ini|msync)$/i.test(String(file.name))) throw new Error("Choose an MSYNC v1 .ini or .msync file");
}

function assertAttachment(attachment) {
  const result = validateMsyncAttachment(attachment);
  if (!result.valid) throw new Error(result.issues[0]?.message ?? "MSYNC attachment is invalid");
}

async function sha256Text(text) {
  return sha256Hex(new Blob([text], { type: "text/plain" }));
}

export class MsyncService {
  constructor(store, { now = () => new Date().toISOString() } = {}) {
    this.store = store;
    this.now = now;
  }

  async list() {
    return this.store.getAll("msyncAttachments");
  }

  async validateFile(file, trackId) {
    assertSupportedFile(file);
    const [track, drills] = await Promise.all([this.store.get("tracks", trackId), this.store.getAll("drills")]);
    if (!track) throw new Error("Choose the audio track targeted by this MSYNC file");
    const sourceText = await file.text();
    const validation = validateMsyncSource(sourceText, createMsyncValidationContext(track, drills));
    return Object.freeze({ file, track, sourceText, sourceSha256: await sha256Text(sourceText), validation });
  }

  async attach(file, trackId) {
    const candidate = await this.validateFile(file, trackId);
    if (!candidate.validation.valid) return Object.freeze({ attached: false, ...candidate });
    const now = this.now();
    const attachment = createMsyncAttachment({
      trackId,
      sourceFilename: file.name,
      sourceText: candidate.sourceText,
      sourceSha256: candidate.sourceSha256,
      parsed: candidate.validation.parsed,
      validationReceipt: Object.freeze({
        parserVersion: MSYNC_PARSER_VERSION,
        validatedAt: now,
        warnings: candidate.validation.warnings,
        summary: candidate.validation.summary,
      }),
      importedAt: now,
      updatedAt: now,
    });
    assertAttachment(attachment);

    const [tracks, attachments] = await Promise.all([this.store.getAll("tracks"), this.store.getAll("msyncAttachments")]);
    const previousId = candidate.track.msyncAttachmentId;
    const updatedTrack = Object.freeze({ ...candidate.track, msyncAttachmentId: attachment.id, updatedAt: now });
    await this.store.replaceAll({
      tracks: tracks.map((track) => track.id === trackId ? updatedTrack : track),
      msyncAttachments: [...attachments.filter((item) => item.id !== previousId && item.trackId !== trackId), attachment],
    });
    return Object.freeze({ attached: true, attachment, validation: candidate.validation, track: updatedTrack });
  }

  async revalidate(attachmentId) {
    const attachment = await this.store.get("msyncAttachments", attachmentId);
    if (!attachment) throw new Error("MSYNC attachment is unavailable");
    const [track, drills] = await Promise.all([this.store.get("tracks", attachment.trackId), this.store.getAll("drills")]);
    if (!track?.audioBlob) throw new Error("The attached audio is missing from local storage");
    if (await sha256Text(attachment.sourceText) !== attachment.sourceSha256) throw new Error("Stored MSYNC source does not match its fingerprint");
    const validation = validateMsyncSource(attachment.sourceText, createMsyncValidationContext(track, drills));
    if (!validation.valid) return Object.freeze({ valid: false, attachment, track, validation });
    if (track.sha256 !== validation.parsed.audio.sha256) throw new Error("The current audio identity no longer matches this MSYNC file");
    return Object.freeze({ valid: true, attachment, track, validation });
  }

  async remove(trackId) {
    const [tracks, attachments] = await Promise.all([this.store.getAll("tracks"), this.store.getAll("msyncAttachments")]);
    const track = tracks.find((item) => item.id === trackId);
    if (!track) throw new Error("Track was not found");
    await this.store.replaceAll({
      tracks: tracks.map((item) => item.id === trackId ? Object.freeze({ ...item, msyncAttachmentId: null, updatedAt: this.now() }) : item),
      msyncAttachments: attachments.filter((item) => item.trackId !== trackId),
    });
  }
}
