import assert from "node:assert/strict";
import test from "node:test";
import { CustomDrillService } from "../src/application/drills/custom-drill-service.js";
import { SharingService } from "../src/application/sharing/sharing-service.js";
import { createSharePackage, MAX_SHARE_BYTES, sharePackageBytes, summarizeSharePackage, validateSharePackage } from "../src/domain/sharing/package.js";
import { MemoryStore } from "../src/infrastructure/storage/memory-store.js";

function makeDrillService(store = new MemoryStore(), prefix = "share") {
  let sequence = 0;
  return new CustomDrillService(store, {
    idFactory: (kind) => `${kind}_${prefix}_${++sequence}`,
    now: () => "2026-11-10T00:00:00.000Z",
  });
}

test("versioned share packages validate and summarize custom drills", async () => {
  const drillService = makeDrillService();
  const drill = await drillService.create({ name: "Wide forehand", group: "B" });
  const payload = createSharePackage({ drills: [drill], title: "  Match\nplans  ", note: "Try level 1" });
  const summary = summarizeSharePackage(payload);

  assert.equal(payload.format, "nova-prime-share");
  assert.equal(payload.version, 1);
  assert.equal(payload.title, "Match plans");
  assert.equal(summary.drills, 1);
  assert.equal(summary.groups.B, 1);
  assert.equal(summary.programs, 1);
  assert.ok(summary.bytes < MAX_SHARE_BYTES);
});

test("share validation rejects unsupported, duplicate, builtin, and unsafe drill data", async () => {
  const drillService = makeDrillService();
  const drill = await drillService.create({ name: "Safe drill" });
  const payload = createSharePackage({ drills: [drill] });

  assert.throws(() => validateSharePackage({ ...payload, version: 2 }), /Unsupported/);
  assert.throws(() => validateSharePackage({ ...payload, drills: [drill, drill] }), /duplicate/);
  assert.throws(() => validateSharePackage({ ...payload, drills: [{ ...drill, source: "builtin" }] }), /not a custom/);
  const invalid = structuredClone(payload);
  invalid.drills[0].programs[1].steps[0].variants[0].speed = 99;
  assert.throws(() => validateSharePackage(invalid), /speed is outside/);
});

test("sharing preview is read-only and confirmed import uses atomic drill import", async () => {
  const source = makeDrillService(new MemoryStore(), "source");
  const first = await source.create({ name: "First share", group: "A" });
  const second = await source.create({ name: "Second share", group: "C" });
  const sourceSharing = new SharingService(source, { now: () => "2026-11-10T12:00:00.000Z" });
  const bundle = await sourceSharing.create({ ids: [first.id, second.id], title: "Two drills" });

  const target = makeDrillService(new MemoryStore(), "target");
  const targetSharing = new SharingService(target);
  const before = structuredClone(bundle.payload);
  assert.equal(targetSharing.preview(bundle.payload).drills, 2);
  assert.equal((await target.list()).length, 0);
  assert.deepEqual(bundle.payload, before);

  const result = await targetSharing.import(bundle.payload);
  assert.equal(result.added, 2);
  assert.deepEqual((await target.list()).map((drill) => drill.name), ["First share", "Second share"]);
});

test("invalid incoming packages do not mutate existing drills", async () => {
  const source = makeDrillService();
  const drill = await source.create({ name: "Incoming" });
  const payload = createSharePackage({ drills: [drill] });
  const invalid = structuredClone(payload);
  invalid.drills[0].programs[1].steps[0].variants[0].height = 999;

  const target = makeDrillService();
  await target.create({ name: "Existing" });
  const sharing = new SharingService(target);
  await assert.rejects(() => sharing.import(invalid), /height is outside/);
  assert.deepEqual((await target.list()).map((entry) => entry.name), ["Existing"]);
});

test("system sharing sends exactly one generated file after explicit invocation", async () => {
  const drillService = makeDrillService();
  const drill = await drillService.create({ name: "Share sheet drill" });
  let sharedData = null;
  const sharing = new SharingService(drillService, {
    navigatorObject: { canShare: () => true, share: async (data) => { sharedData = data; } },
    fileFactory: (parts, name, options) => ({ parts, name, type: options.type }),
  });
  const bundle = await sharing.create({ ids: [drill.id], title: "Share sheet" });
  const result = await sharing.share(bundle);

  assert.equal(result.shared, true);
  assert.equal(sharedData.files.length, 1);
  assert.equal(sharedData.files[0].name, "share-sheet.nova-share.json");
  assert.equal(sharedData.files[0].type, "application/json");
  assert.equal(sharePackageBytes(bundle.payload) > 0, true);
});
