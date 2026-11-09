# Nova Ultimate Test Matrix

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
