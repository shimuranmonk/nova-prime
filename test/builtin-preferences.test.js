import assert from "node:assert/strict";
import test from "node:test";
import { BuiltinPreferencesService, builtinRandomOrder } from "../src/application/drills/builtin-preferences.js";
import { getBuiltinDrill } from "../src/domain/drills/builtin-catalog.js";
import { MemoryStore } from "../src/infrastructure/storage/memory-store.js";

test("built-in playback order is independently configurable per level", async () => {
  const store = new MemoryStore();
  const service = new BuiltinPreferencesService(store);
  const drill = getBuiltinDrill("builtin:all-random");

  assert.equal(builtinRandomOrder(drill, 1), true);
  const preferences = await service.setRandom(drill, 1, false);
  assert.equal(builtinRandomOrder(drill, 1, preferences), false);
  assert.equal(builtinRandomOrder(drill, 2, preferences), true);

  const reloaded = await service.load();
  assert.deepEqual(reloaded, preferences);
  assert.deepEqual(await service.reset(), {});
  assert.deepEqual(await service.load(), {});
});

test("single-ball built-ins stay sequential", async () => {
  const service = new BuiltinPreferencesService(new MemoryStore());
  const drill = getBuiltinDrill("builtin:push-b");
  const preferences = await service.setRandom(drill, 3, true);
  assert.equal(builtinRandomOrder(drill, 3, preferences), false);
});
