globalThis.NOVA_PRIME_FULL_TEST_BUILD = true;
const ready = new Promise((resolve) => {
  globalThis.addEventListener("nova-prime-live-ready", () => resolve(globalThis.NOVA_PRIME_LIVE_BRIDGE), { once: true });
});
await import("./bootstrap.js");
const bridge = await ready;
const { mountLiveRobotControls } = await import("./live-robot-runtime.js");
const mountFullPhysicalTest = mountLiveRobotControls;
mountFullPhysicalTest(bridge);
