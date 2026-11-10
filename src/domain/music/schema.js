import { createId } from "../shared/id.js";
import { issue, validationResult } from "../shared/errors.js";

export function createTrack(overrides = {}) {
  const now = new Date().toISOString();
  return Object.freeze({
    id: createId("track"),
    displayName: "Untitled track",
    mimeType: "audio/mpeg",
    byteSize: 0,
    durationMs: 0,
    sha256: null,
    audioBlob: null,
    msyncAttachmentId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

export function validateTrack(track, { requireBlob = true, requireHash = false } = {}) {
  const issues = [];
  if (!track || typeof track !== "object") return validationResult([issue("AUDIO_TRACK_REQUIRED", "Track is required", "track")]);
  if (typeof track.id !== "string" || !track.id) issues.push(issue("AUDIO_TRACK_ID", "Track requires an identity", "id"));
  if (typeof track.displayName !== "string" || !track.displayName.trim()) issues.push(issue("AUDIO_TRACK_NAME", "Track name is required", "displayName"));
  if (!Number.isFinite(track.byteSize) || track.byteSize < 0) issues.push(issue("AUDIO_TRACK_SIZE", "Track size is invalid", "byteSize"));
  if (!Number.isFinite(track.durationMs) || track.durationMs <= 0) issues.push(issue("AUDIO_TRACK_DURATION", "Track duration must be positive", "durationMs"));
  if (track.sha256 != null && !/^[a-f0-9]{64}$/i.test(track.sha256)) issues.push(issue("AUDIO_TRACK_HASH", "Track SHA-256 is invalid", "sha256"));
  if (requireHash && !track.sha256) issues.push(issue("AUDIO_TRACK_HASH_REQUIRED", "Track content identity is required", "sha256"));
  if (requireBlob && !track.audioBlob) issues.push(issue("AUDIO_TRACK_BLOB", "Track audio is unavailable", "audioBlob"));
  return validationResult(issues, track);
}

export function createPlaylist(overrides = {}) {
  const now = new Date().toISOString();
  return Object.freeze({ id: createId("playlist"), name: "New playlist", items: Object.freeze([]), createdAt: now, updatedAt: now, ...overrides });
}

export function validatePlaylist(playlist) {
  const issues = [];
  if (!playlist || typeof playlist !== "object") return validationResult([issue("PLAYLIST_REQUIRED", "Playlist is required", "playlist")]);
  if (typeof playlist.id !== "string" || !playlist.id) issues.push(issue("PLAYLIST_ID", "Playlist requires an identity", "id"));
  if (typeof playlist.name !== "string" || !playlist.name.trim()) issues.push(issue("PLAYLIST_NAME", "Playlist name is required", "name"));
  if (!Array.isArray(playlist.items)) issues.push(issue("PLAYLIST_ITEMS", "Playlist items must be an array", "items"));
  else playlist.items.forEach((item, index) => {
    if (!item?.trackId) issues.push(issue("PLAYLIST_TRACK", "Playlist item requires a Track ID", `items[${index}].trackId`));
    if (!Number.isInteger(item?.order) || item.order < 0) issues.push(issue("PLAYLIST_ORDER", "Playlist order must be a non-negative integer", `items[${index}].order`));
  });
  if (Array.isArray(playlist.items)) {
    const orders = playlist.items.map((item) => item?.order);
    if (new Set(orders).size !== orders.length) issues.push(issue("PLAYLIST_ORDER_DUPLICATE", "Playlist item order must be unique", "items"));
    if (orders.some((order, index) => order !== index)) issues.push(issue("PLAYLIST_ORDER_GAP", "Playlist item order must be contiguous", "items"));
  }
  return validationResult(issues, playlist);
}
