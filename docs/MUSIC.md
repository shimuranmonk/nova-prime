# Nova Prime Music

## JewelFlow trace

1. **Business Challenge** — Nova Plus proved the value of training with music, but Nova Prime had no durable, offline-capable audio library or unified Music session. Users could see the future mode but could not use it.
2. **Intent** — Let users import their own audio once, organize reusable playlists or an ad-hoc Quick Music queue, and train through the same Pause, Resume, Stop, completion, and history lifecycle used by other Nova Prime modes.
3. **Intent Analysis** — Audio must remain local, tolerate phone and tablet storage limits, deduplicate exact content, start from a user gesture, report unsupported or missing files, survive offline HTTP-server operation, and never delay the safety controls. Browser format support remains device-dependent.
4. **Product Requirements** — NU-FR-033–050 require one session lifecycle, coordinated mode-owned audio, local deduplicated storage, playlists, Quick Music, progress, automatic completion, and recoverable missing-audio errors.
5. **Solution Specification** — Tracks use SHA-256 content identity and store their playable Blob in IndexedDB. Playlists store ordered Track IDs. `MusicLibraryService` validates and resolves local selections; `AudioPlayer` owns object URLs and browser playback; `LocalSessionController` remains authoritative for lifecycle, elapsed time, history, Stop, and failure recovery.
6. **Generated Solution** — Release 0.2 enables the Music route and training mode, audio import and rename/delete, playlist create/rename/reorder/add/remove/delete, Quick Music, playback progress, automatic completion, Pause/Resume/Stop, session history, and playable-audio backup/restore.

## Operating behavior

- Audio is never uploaded by Nova Prime.
- Exact duplicates are skipped using their SHA-256 identity.
- A track referenced by a playlist cannot be deleted until it is removed from that playlist.
- A missing or unsupported file moves the Music session to a recoverable error state; the user can start a new session after correcting the library.
- Music sessions send no Bluetooth or robot commands and record zero physically dispatched balls.
- Backups encode playable track data in the versioned JSON document and rebuild the Blob during validated restore.

## Deployment notes

The same implementation runs on hosted HTTPS and device-local loopback HTTP. Audio and playlists are origin-scoped IndexedDB data, so the protocol, hostname, port, and path should remain stable. Available storage and supported audio codecs depend on the browser and operating system.
