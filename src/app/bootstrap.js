import { detectCapabilities } from "./capabilities.js";
import { FEATURE_FLAGS } from "./feature-flags.js";
import { createRouter } from "./router.js";

const capabilities = detectCapabilities();
const view = document.querySelector("#route-view");
const tabs = [...document.querySelectorAll("[data-route]")];

const yesNo = (value) => (value ? "Available" : "Unavailable");

function overview() {
  return `
    <div class="card-grid">
      <article class="card"><h3>Canonical domain</h3><span class="value">6 models</span><p>Drills, calibration, sessions, music, MSYNC, and statistics share versioned schemas.</p></article>
      <article class="card"><h3>Session safety</h3><span class="value">1 lifecycle</span><p>Every future mode will use one state machine and one priority Stop path.</p></article>
      <article class="card"><h3>Live features</h3><span class="value">Disabled</span><p>Bluetooth remains off until the executor and safety contracts pass verification.</p></article>
    </div>`;
}

function capabilityView() {
  return `<div class="card-grid">${Object.entries(capabilities)
    .map(([name, available]) => `<article class="card"><h3>${name}</h3><span class="status-pill">${yesNo(available)}</span></article>`)
    .join("")}</div>`;
}

function roadmap() {
  const releases = [
    ["0.1", "Foundation", "Schemas, session states, migration contracts, tests"],
    ["0.2", "Music", "Stored tracks, playlists, Quick Music"],
    ["0.3", "MSYNC", "Validation, simulation, safe live scheduling"],
    ["0.4", "Connected", "Sharing and stable voice commands"],
  ];

  return `<div class="card-grid">${releases
    .map(([version, name, description]) => `<article class="card"><span class="value">${version}</span><h3>${name}</h3><p>${description}</p></article>`)
    .join("")}</div>`;
}

const renderers = { overview, capabilities: capabilityView, roadmap };

function render(route) {
  tabs.forEach((tab) => {
    if (tab.dataset.route === route) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  view.innerHTML = renderers[route]();
  document.title = `Nova Ultimate · ${route[0].toUpperCase()}${route.slice(1)}`;
}

createRouter({ onRoute: render }).start();
document.querySelector("#build-version").textContent = "v0.1.0-foundation.0";

// Exposed only for transparent diagnostics during the foundation milestone.
globalThis.NOVA_ULTIMATE_FOUNDATION = Object.freeze({ capabilities, featureFlags: FEATURE_FLAGS });
