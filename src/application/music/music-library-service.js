import { createPlaylist, createTrack, validatePlaylist, validateTrack } from "../../domain/music/schema.js";

const AUDIO_EXTENSION = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i;

function cleanName(value, fallback = "Untitled") {
  const normalized = String(value ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, 80);
}

function trackName(file) {
  return cleanName(String(file?.name ?? "").replace(/\.[^.]+$/, ""), "Untitled track");
}

function assertValid(validation, label) {
  if (!validation.valid) throw new Error(`${label}: ${validation.issues[0]?.message ?? "validation failed"}`);
}

function isAudioFile(file) {
  return Boolean(file?.size > 0 && (String(file.type).startsWith("audio/") || AUDIO_EXTENSION.test(String(file.name))));
}

export async function sha256Hex(blob, cryptoObject = globalThis.crypto) {
  if (!cryptoObject?.subtle?.digest) throw new Error("This browser cannot calculate audio identities");
  const digest = await cryptoObject.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readAudioDuration(blob, { AudioCtor = globalThis.Audio, urlObject = globalThis.URL } = {}) {
  if (!AudioCtor || !urlObject?.createObjectURL) return Promise.reject(new Error("Audio metadata is unavailable in this browser"));
  return new Promise((resolve, reject) => {
    const audio = new AudioCtor();
    const url = urlObject.createObjectURL(blob);
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("error", failed);
      urlObject.revokeObjectURL(url);
    };
    const loaded = () => {
      const durationMs = Math.round(Number(audio.duration) * 1000);
      cleanup();
      Number.isFinite(durationMs) && durationMs > 0 ? resolve(durationMs) : reject(new Error("Audio duration could not be read"));
    };
    const failed = () => { cleanup(); reject(new Error("Audio metadata could not be read")); };
    audio.addEventListener("loadedmetadata", loaded, { once: true });
    audio.addEventListener("error", failed, { once: true });
    audio.preload = "metadata";
    audio.src = url;
  });
}

export class MusicLibraryService {
  constructor(store, { hash = sha256Hex, duration = readAudioDuration, now = () => new Date().toISOString() } = {}) {
    this.store = store;
    this.hash = hash;
    this.duration = duration;
    this.now = now;
  }

  async tracks() {
    return (await this.store.getAll("tracks")).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  }

  async playlists() {
    return (await this.store.getAll("playlists")).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async importFiles(files) {
    const input = [...(files ?? [])];
    if (input.length === 0) throw new Error("Choose at least one audio file");
    if (input.some((file) => !isAudioFile(file))) throw new Error("Only non-empty audio files can be imported");

    const existing = await this.tracks();
    const knownHashes = new Map(existing.filter((track) => track.sha256).map((track) => [track.sha256, track]));
    const prepared = [];
    const duplicates = [];

    for (const file of input) {
      const sha256 = await this.hash(file);
      const duplicate = knownHashes.get(sha256) ?? prepared.find((track) => track.sha256 === sha256);
      if (duplicate) {
        duplicates.push(Object.freeze({ fileName: file.name, trackId: duplicate.id }));
        continue;
      }
      const durationMs = await this.duration(file);
      const now = this.now();
      const track = createTrack({
        displayName: trackName(file),
        mimeType: String(file.type || "audio/mpeg"),
        byteSize: Number(file.size),
        durationMs,
        sha256,
        audioBlob: file,
        createdAt: now,
        updatedAt: now,
      });
      assertValid(validateTrack(track, { requireBlob: true, requireHash: true }), "Invalid audio track");
      prepared.push(track);
    }

    for (const track of prepared) await this.store.put("tracks", track);
    return Object.freeze({ imported: prepared, duplicates });
  }

  async renameTrack(id, displayName) {
    const track = await this.store.get("tracks", id);
    if (!track) throw new Error("Track was not found");
    const updated = Object.freeze({ ...track, displayName: cleanName(displayName, track.displayName), updatedAt: this.now() });
    assertValid(validateTrack(updated, { requireBlob: true, requireHash: true }), "Invalid audio track");
    await this.store.put("tracks", updated);
    return updated;
  }

  async deleteTrack(id) {
    const playlists = await this.playlists();
    if (playlists.some((playlist) => playlist.items.some((item) => item.trackId === id))) {
      throw new Error("Remove this track from playlists before deleting it");
    }
    await this.store.delete("tracks", id);
  }

  async createPlaylist(name, trackIds = []) {
    return this.#savePlaylist(createPlaylist({ name: cleanName(name, "New playlist") }), trackIds);
  }

  async updatePlaylist(id, { name, trackIds }) {
    const current = await this.store.get("playlists", id);
    if (!current) throw new Error("Playlist was not found");
    return this.#savePlaylist({ ...current, name: cleanName(name, current.name), updatedAt: this.now() }, trackIds);
  }

  async deletePlaylist(id) {
    await this.store.delete("playlists", id);
  }

  async #savePlaylist(base, trackIds) {
    const ids = [...(trackIds ?? [])].map(String);
    if (ids.length === 0) throw new Error("A playlist needs at least one track");
    const tracks = new Map((await this.tracks()).map((track) => [track.id, track]));
    const missing = ids.filter((id) => !tracks.has(id));
    if (missing.length) throw new Error(`Playlist contains ${missing.length} missing track${missing.length === 1 ? "" : "s"}`);
    const playlist = Object.freeze({
      ...base,
      items: Object.freeze(ids.map((trackId, order) => Object.freeze({ trackId, order }))),
      updatedAt: this.now(),
    });
    assertValid(validatePlaylist(playlist), "Invalid playlist");
    await this.store.put("playlists", playlist);
    return playlist;
  }

  async resolve({ playlistId = null, quickTrackIds = [] } = {}) {
    let ids = [...quickTrackIds];
    let label = "Quick Music";
    if (playlistId) {
      const playlist = await this.store.get("playlists", playlistId);
      if (!playlist) throw new Error("The selected playlist is unavailable");
      ids = [...playlist.items].sort((a, b) => a.order - b.order).map((item) => item.trackId);
      label = playlist.name;
    }
    if (ids.length === 0) throw new Error("Choose a playlist or Quick Music tracks");
    const tracks = new Map((await this.tracks()).map((track) => [track.id, track]));
    const missing = ids.filter((id) => !tracks.get(id)?.audioBlob);
    if (missing.length) throw new Error(`${missing.length} selected audio file${missing.length === 1 ? " is" : "s are"} missing; reopen Music and replace them`);
    return Object.freeze({ label, tracks: Object.freeze(ids.map((id) => tracks.get(id))) });
  }
}
