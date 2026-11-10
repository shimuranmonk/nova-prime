export const VOICE_COMMANDS = Object.freeze({
  START: "start",
  STOP: "stop",
  PAUSE: "pause",
  RESUME: "resume",
});

export const VOICE_MIN_CONFIDENCE = 0.65;

export function normalizeVoiceTranscript(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function interpretVoiceResult({ transcript, confidence = 1 } = {}) {
  const normalized = normalizeVoiceTranscript(transcript);
  if (!normalized) return Object.freeze({ accepted: false, reason: "EMPTY", transcript: normalized, confidence: 0 });
  const measuredConfidence = Number.isFinite(confidence) ? confidence : 0;
  if (measuredConfidence < VOICE_MIN_CONFIDENCE) return Object.freeze({ accepted: false, reason: "LOW_CONFIDENCE", transcript: normalized, confidence: measuredConfidence });

  const phrases = new Map([
    ["stop", VOICE_COMMANDS.STOP],
    ["emergency stop", VOICE_COMMANDS.STOP],
    ["nova stop", VOICE_COMMANDS.STOP],
    ["nova emergency stop", VOICE_COMMANDS.STOP],
    ["nova start", VOICE_COMMANDS.START],
    ["nova begin", VOICE_COMMANDS.START],
    ["nova rest", VOICE_COMMANDS.PAUSE],
    ["nova pause", VOICE_COMMANDS.PAUSE],
    ["nova resume", VOICE_COMMANDS.RESUME],
    ["nova continue", VOICE_COMMANDS.RESUME],
  ]);
  const command = phrases.get(normalized);
  if (!command) return Object.freeze({ accepted: false, reason: "UNKNOWN", transcript: normalized, confidence: measuredConfidence });
  return Object.freeze({ accepted: true, command, transcript: normalized, confidence: measuredConfidence });
}
