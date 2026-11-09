import assert from "node:assert/strict";
import test from "node:test";
import { detectCapabilities } from "../src/app/capabilities.js";
import { enabledFeatures, FEATURE_FLAGS } from "../src/app/feature-flags.js";
import { routeFromHash } from "../src/app/router.js";

test("foundation features are disabled", () => {
  assert.deepEqual(enabledFeatures(FEATURE_FLAGS), []);
});

test("capability detection is defensive", () => {
  const result = detectCapabilities({ navigator: {}, crypto: {}, isSecureContext: false });
  assert.equal(result.webBluetooth, false);
  assert.equal(result.secureContext, false);
});

test("unknown routes return to overview", () => {
  assert.equal(routeFromHash("#roadmap"), "roadmap");
  assert.equal(routeFromHash("#unknown"), "overview");
});
