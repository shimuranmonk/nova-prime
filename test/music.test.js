import assert from "node:assert/strict";
import test from "node:test";
import { AudioPlayer } from "../src/application/music/audio-player.js";
import { MusicLibraryService } from "../src/application/music/music-library-service.js";
import { MemoryStore } from "../src/infrastructure/storage/memory-store.js";

function audioFile(name, content = name) {
  const blob = new Blob([content], { type: "audio/mpeg" });
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

class FakeAudio {
  listeners = new Map();
  currentTime = 0;
  duration = 10;
  src = "";
  paused = true;
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
  load() {}
  removeAttribute(name) { if (name === "src") this.src = ""; }
  emit(name) { this.listeners.get(name)?.(); }
}

test("music library deduplicates tracks and resolves playlists", async () => {
  const store = new MemoryStore();
  const service = new MusicLibraryService(store, {
    hash: async (file) => (await file.text()).padEnd(64, "0").slice(0, 64),
    duration: async () => 90_000,
    now: () => "2026-11-10T00:00:00.000Z",
  });
  const first = audioFile("Warmup.mp3", "a");
  const duplicate = audioFile("Copy.mp3", "a");
  const second = audioFile("Footwork.mp3", "b");
  const imported = await service.importFiles([first, duplicate, second]);
  assert.equal(imported.imported.length, 2);
  assert.equal(imported.duplicates.length, 1);

  const ids = imported.imported.map((track) => track.id);
  const playlist = await service.createPlaylist("Training mix", ids);
  const resolved = await service.resolve({ playlistId: playlist.id });
  assert.equal(resolved.label, "Training mix");
  assert.deepEqual(resolved.tracks.map((track) => track.id), ids);
  await assert.rejects(() => service.deleteTrack(ids[0]), /Remove this track from playlists/);
});

test("audio player pauses, resumes, advances, and completes", async () => {
  const audio = new FakeAudio();
  const revoked = [];
  let sequence = 0;
  const player = new AudioPlayer({
    audio,
    urlObject: { createObjectURL: () => `blob:${++sequence}`, revokeObjectURL: (url) => revoked.push(url) },
  });
  const tracks = [
    { id: "one", displayName: "One", durationMs: 10_000, audioBlob: new Blob(["1"]) },
    { id: "two", displayName: "Two", durationMs: 10_000, audioBlob: new Blob(["2"]) },
  ];
  await player.start(tracks);
  assert.equal(player.snapshot().state, "playing");
  assert.equal(player.pause(), true);
  assert.equal(player.snapshot().state, "paused");
  assert.equal(await player.resume(), true);
  audio.emit("ended");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(player.snapshot().trackIndex, 1);
  audio.emit("ended");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(player.snapshot().state, "completed");
  assert.equal(player.snapshot().completedTracks, 2);
  assert.ok(revoked.length >= 2);
});
