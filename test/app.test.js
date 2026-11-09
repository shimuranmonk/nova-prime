import assert from "node:assert/strict";
import test from "node:test";
import { detectCapabilities, isLoopbackHostname } from "../src/app/capabilities.js";
import { enabledFeatures, FEATURE_FLAGS } from "../src/app/feature-flags.js";
import { routeFromHash } from "../src/app/router.js";

test("foundation features are disabled", () => {
  assert.deepEqual(enabledFeatures(FEATURE_FLAGS), []);
});

test("capability detection is defensive", () => {
  const result = detectCapabilities({ navigator: {}, crypto: {}, isSecureContext: false, location: {} });
  assert.equal(result.webBluetooth, false);
  assert.equal(result.secureContext, false);
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

test("unknown routes return to overview", () => {
  assert.equal(routeFromHash("#roadmap"), "roadmap");
  assert.equal(routeFromHash("#unknown"), "overview");
});
