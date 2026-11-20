import assert from "node:assert/strict";
import test from "node:test";
import { detectCapabilities, isLoopbackHostname } from "../src/app/capabilities.js";
import { enabledFeatures, FEATURE_FLAGS } from "../src/app/feature-flags.js";
import { routeFromHash } from "../src/app/router.js";

test("robot, Music, MSYNC, sharing, and voice are enabled after the reported release gate", () => {
  assert.deepEqual(enabledFeatures(FEATURE_FLAGS), ["robot", "music", "msync", "sharing", "voice"]);
});

test("production bootstrap mounts the integrated controls without test-only acknowledgements", async () => {
  const { readFile } = await import("node:fs/promises");
  const bootstrap = await readFile(new URL("../src/app/bootstrap.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/app/live-robot-runtime.js", import.meta.url), "utf8");
  assert.match(bootstrap, /FEATURE_FLAGS\.robot && globalThis\.NOVA_PRIME_FULL_TEST_BUILD !== true/);
  assert.match(bootstrap, /live-robot-runtime\.js/);
  assert.match(runtime, /testOnly && !preflight\(\)/);
  assert.match(runtime, /testOnly && !globalThis\.confirm/);
  assert.match(runtime, /id="full-test-stop"[^>]*>Stop robot/);
  assert.match(runtime, /setupPill && setupPill\.textContent !== readyLabel/);
  assert.match(runtime, /helper\?\.textContent\.includes\("Sends no robot commands and records zero dispatched balls\."\)/);
});

test("application build metadata supplies the displayed package version", async () => {
  const { readFile } = await import("node:fs/promises");
  const bootstrap = await readFile(new URL("../src/app/bootstrap.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /name="nova-prime-version" content="development"/);
  assert.match(bootstrap, /meta\[name="nova-prime-version"\]/);
});

test("capability detection is defensive", () => {
  const result = detectCapabilities({ navigator: {}, crypto: {}, isSecureContext: false, location: {} });
  assert.equal(result.webBluetooth, false);
  assert.equal(result.secureContext, false);
  assert.equal(result.speechRecognition, false);
});

test("speech recognition capability accepts either browser constructor", () => {
  assert.equal(detectCapabilities({ navigator: {}, SpeechRecognition: class {}, location: {} }).speechRecognition, true);
  assert.equal(detectCapabilities({ navigator: {}, webkitSpeechRecognition: class {}, location: {} }).speechRecognition, true);
});

test("mobile loopback HTTP hosting is identified", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("192.168.1.10"), false);

  const local = detectCapabilities({ navigator: {}, crypto: {}, location: { protocol: "http:", hostname: "127.0.0.1" } });
  assert.equal(local.localHttpServer, true);
  assert.equal(local.hostedHttps, false);
  assert.equal(local.unsafeLanHttp, false);

  const lan = detectCapabilities({ navigator: {}, crypto: {}, location: { protocol: "http:", hostname: "192.168.1.10" } });
  assert.equal(lan.localHttpServer, false);
  assert.equal(lan.unsafeLanHttp, true);

  const hosted = detectCapabilities({ navigator: {}, crypto: {}, location: { protocol: "https:", hostname: "example.com" } });
  assert.equal(hosted.hostedHttps, true);
  assert.equal(hosted.localHttpServer, false);
  assert.equal(hosted.unsafeLanHttp, false);
});

test("unknown routes return to training", () => {
  assert.equal(routeFromHash("#train"), "train");
  assert.equal(routeFromHash("#calibration"), "calibration");
  assert.equal(routeFromHash("#data"), "data");
  assert.equal(routeFromHash("#music"), "music");
  assert.equal(routeFromHash("#statistics"), "statistics");
  assert.equal(routeFromHash("#sharing"), "sharing");
  assert.equal(routeFromHash("#roadmap"), "roadmap");
  assert.equal(routeFromHash("#unknown"), "train");
});

test("MSYNC has a first-class application route", () => {
  assert.equal(routeFromHash("#msync"), "msync");
});

test("Statistics has a first-class application route", () => {
  assert.equal(routeFromHash("#statistics"), "statistics");
});

test("Sharing has a first-class application route", () => {
  assert.equal(routeFromHash("#sharing"), "sharing");
});

test("physical-test entry is a separate app with no production bootstrap dependency", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../physical-test.html", import.meta.url), "utf8");
  const bootstrap = await readFile(new URL("../src/app/physical-test-bootstrap.js", import.meta.url), "utf8");
  assert.match(html, /physical-test-bootstrap\.js/);
  assert.doesNotMatch(html, /src\/app\/bootstrap\.js/);
  assert.match(bootstrap, /new WebBluetoothTransport\(\)/);
  assert.match(bootstrap, /RobotSafetyMonitor/);
  assert.match(bootstrap, /repetitions: 1/);
  assert.doesNotMatch(bootstrap, /AudioPlayer|msyncSimulator|voiceController|FEATURE_FLAGS/);
});

