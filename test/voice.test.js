import assert from "node:assert/strict";
import test from "node:test";
import { VoiceController } from "../src/application/voice/voice-controller.js";
import { interpretVoiceResult, normalizeVoiceTranscript, VOICE_COMMANDS } from "../src/domain/voice/commands.js";

test("voice transcript normalization is strict and predictable", () => {
  assert.equal(normalizeVoiceTranscript("  NOVA,   Emergency STOP! "), "nova emergency stop");
});

test("the exact voice grammar maps to canonical session commands", () => {
  const accepted = new Map([
    ["nova start", VOICE_COMMANDS.START],
    ["nova begin", VOICE_COMMANDS.START],
    ["nova pause", VOICE_COMMANDS.PAUSE],
    ["nova rest", VOICE_COMMANDS.PAUSE],
    ["nova resume", VOICE_COMMANDS.RESUME],
    ["nova continue", VOICE_COMMANDS.RESUME],
    ["stop", VOICE_COMMANDS.STOP],
    ["emergency stop", VOICE_COMMANDS.STOP],
    ["nova stop", VOICE_COMMANDS.STOP],
    ["nova emergency stop", VOICE_COMMANDS.STOP],
  ]);
  for (const [transcript, command] of accepted) {
    assert.deepEqual(interpretVoiceResult({ transcript, confidence: 0.9 }).command, command);
  }
});

test("voice grammar rejects guesses and low-confidence results", () => {
  assert.equal(interpretVoiceResult({ transcript: "nova maybe start", confidence: 0.99 }).reason, "UNKNOWN");
  assert.equal(interpretVoiceResult({ transcript: "nova start", confidence: 0.64 }).reason, "LOW_CONFIDENCE");
  assert.equal(interpretVoiceResult({ transcript: "", confidence: 1 }).reason, "EMPTY");
});

class FakeRecognition {
  start() { this.started = true; }
  abort() { this.aborted = true; }
  result(transcript, confidence = 0.9) { this.onresult?.({ results: [[{ transcript, confidence }]] }); }
  error(error) { this.onerror?.({ error }); }
  end() { this.onend?.(); }
}

test("voice controller listens once and emits one accepted command", async () => {
  const statuses = [];
  const commands = [];
  let recognition;
  const voice = new VoiceController({
    recognitionFactory: () => (recognition = new FakeRecognition()),
    onStatus: (status) => statuses.push(status),
    onCommand: async (command) => commands.push(command),
  });
  assert.deepEqual(voice.listen(), { accepted: true });
  assert.equal(recognition.started, true);
  assert.equal(recognition.continuous, false);
  recognition.result("nova pause");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(commands, [VOICE_COMMANDS.PAUSE]);
  assert.equal(statuses.at(-1).state, "recognized");
  recognition.end();
});

test("voice controller rejects unclear speech without executing", async () => {
  const statuses = [];
  const commands = [];
  let recognition;
  const voice = new VoiceController({
    recognitionFactory: () => (recognition = new FakeRecognition()),
    onStatus: (status) => statuses.push(status),
    onCommand: async (command) => commands.push(command),
  });
  voice.listen();
  recognition.result("nova start", 0.2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(commands, []);
  assert.equal(statuses.at(-1).state, "rejected");
});

test("voice controller reports microphone denial and supports cancellation", () => {
  const statuses = [];
  let recognition;
  const voice = new VoiceController({
    recognitionFactory: () => (recognition = new FakeRecognition()),
    onStatus: (status) => statuses.push(status),
  });
  voice.listen();
  recognition.error("not-allowed");
  assert.match(statuses.at(-1).message, /not allowed/i);
  voice.listen();
  assert.equal(voice.cancel(), true);
  assert.equal(recognition.aborted, true);
  assert.equal(voice.listening, false);
});

test("voice controller remains safely unavailable without browser support", () => {
  const voice = new VoiceController();
  assert.equal(voice.supported, false);
  assert.deepEqual(voice.listen(), { accepted: false, reason: "UNSUPPORTED" });
});

test("voice controller recovers when the browser refuses to start recognition", () => {
  const statuses = [];
  const voice = new VoiceController({
    recognitionFactory: () => ({ start() { throw new Error("busy"); } }),
    onStatus: (status) => statuses.push(status),
  });
  assert.deepEqual(voice.listen(), { accepted: false, reason: "START_FAILED" });
  assert.equal(voice.listening, false);
  assert.equal(statuses.at(-1).state, "error");
});
