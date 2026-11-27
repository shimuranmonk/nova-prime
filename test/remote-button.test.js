import assert from "node:assert/strict";
import test from "node:test";
import { createRemotePressHandler, learnRemoteKey, matchesRemoteKey, remoteStartMode, submitRemoteStart } from "../src/app/remote-button.js";

test("remote learns keyboard codes, rejects reserved keys, and falls back to key", () => {
  const binding = learnRemoteKey({ key: "F9", code: "F9" });
  assert.deepEqual(binding, { key: "F9", code: "F9" });
  assert.equal(learnRemoteKey({ key: "F9", repeat: true }), null);
  assert.equal(learnRemoteKey({ key: "F9", ctrlKey: true }), null);
  assert.equal(learnRemoteKey({ key: "n", code: "KeyN" }), null);
  assert.equal(matchesRemoteKey({ key: "F9", code: "Unidentified" }, binding), true);
  assert.equal(matchesRemoteKey({ key: "F9", code: "F8" }, binding), false);
});

test("immediate start is scoped to the armed form submission", () => {
  const seen = [];
  const form = { requestSubmit: () => seen.push(remoteStartMode(form)) };
  assert.equal(remoteStartMode(form), null);
  submitRemoteStart(form, true);
  submitRemoteStart(form, false);
  assert.deepEqual(seen, ["immediate", "countdown"]);
  assert.equal(remoteStartMode(form), null);
});

test("single press pauses or resumes while a double press stops the current run", () => {
  const commands = [];
  const spec = {};
  let session = { state: "IDLE", spec: null };
  let allowed = true;
  let timer = null;
  const press = createRemotePressHandler({
    snapshot: () => session,
    allowed: () => allowed,
    start: () => commands.push("start"),
    command: (command) => commands.push(command),
    schedule(callback, delay) { assert.equal(delay, 450); timer = callback; return 1; },
    cancel() { timer = null; },
  });
  press.press();
  session = { state: "COUNTDOWN", spec };
  press.press();
  press.press();
  assert.equal(timer, null);
  session = { state: "RUNNING", spec };
  press.press();
  timer();
  session = { state: "PAUSED", spec };
  press.press();
  timer();
  press.press();
  session = { state: "PAUSED", spec: {} };
  timer();
  press.press();
  allowed = false;
  timer();
  assert.deepEqual(commands, ["start", "stop", "pause", "resume"]);
});
