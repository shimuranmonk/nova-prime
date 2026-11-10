# Nova Prime Test Matrix

## Automated foundation checks

- Canonical drill creation and validation
- Ball ranges and drop/scatter envelope
- Session happy path
- Priority and idempotent Stop
- Explicit Pause and Resume
- Mode-specific session validation
- Calibration, Track, Playlist, MSYNC, and statistics schemas
- Foundation feature flags remain disabled
- Build output contains no live Bluetooth request
- Reps and Time dry-run countdown, completion, Pause, Resume, and priority Stop
- Simulation records always report zero physically dispatched balls
- Memory-store isolation and persistent-store browser smoke test
- Versioned backup round trip and rejection of invalid, missing, or unknown collections
- Trainer-first dashboard loads as the default route
- Drawer exposes secondary screens and becomes inert when closed
- Mode, level, amount, countdown, and pause controls remain locked during active sessions
- Configured Reps and Time rests advance deterministically
- Built-in catalogue contains exactly 6 Basic, 12 Combined, and 16 Complex drills
- All 34 drills have unique stable IDs and validate at levels 1–3
- Representative ball parameters match the authoritative Trainer source
- Sequence order, random flags, UI selection, and session-history drill linkage
- Custom drill immutable IDs, sanitized unique names, and Groups A/B/C persistence
- Duplicate drill and step identity regeneration
- Reorder and post-delete order compaction
- Atomic custom-drill import rejection and versioned JSON round trip
- 100-drill capacity enforcement for every custom group
- Visual editor atomic save and invalid-save rollback
- 20-step program limit, ordered steps, multiple ball variants, and Levels 1–3 persistence
- Deterministic uncalibrated physics preview with bounded table markers
- Standard and Complete calibration plan coverage
- Calibration offset, accuracy, scatter, validation, atomic import/export, and Quick Check calculations
- Calibrated offsets applied only to successful visual landing estimates
- Phone-sized create, rename, duplicate, group move, reorder, selection, simulated completion, history naming, export, and fresh-tab persistence smoke test
- Phone/tablet visual-editor create, reorder, parameter edit, level copy, save, cancel, and reopen smoke test
- Phone portrait guided calibration, five observations, save, Quick Check suggestions, and calibrated-editor smoke test

## Future integration checks

- Fake Bluetooth login, writes, notifications, failures, and disconnects
- Fake monotonic timers and visibility changes
- Fake audio playback and playlist completion
- Fake IndexedDB transactions and quota failures
- MSYNC parser, validation, simulation, cue drift, and queue boundaries
- Legacy Trainer and Plus migration fixtures

## Required physical robot checks before live release

- Connect, reconnect, and login timeout
- Single-ball test and complete drill
- Zero-pause repetitions
- Pause, resume, and priority Stop
- Stop under queued load
- Screen lock and return
- Calibration and corner placement
- Music completion
- MSYNC cue transitions

## Target device classes

- Current Chrome and Edge on supported desktop platforms
- Compatible Chromium browser on Android
- Bluefy on supported iPhone and iPad workflows
- Phone, tablet, and desktop layouts in portrait and landscape
- Tablet portrait at 768 × 1024 and tablet landscape at 1024 × 768

## Mobile HTTP-server checks

- Complete release bundle served from an installed phone/tablet HTTP server
- `http://localhost:<fixed-port>/`
- `http://127.0.0.1:<fixed-port>/`
- Application installed in a server subdirectory
- JavaScript module MIME type verification
- Stable storage across server restarts on the same origin
- Warning and disabled live controls for non-loopback plain HTTP
- Backup/restore after deliberate hostname or port change

## Hosted-web checks

- Production HTTPS deployment
- Web Bluetooth availability and user-gesture requirement
- Repository-relative asset loading
- Persistent storage across ordinary reloads and application updates
- Export/import between hosted and device-local origins
