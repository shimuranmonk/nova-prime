# Nova Prime Solution Specification

> Implementation status: the MSYNC simulation path and local Statistics aggregation/guidance path are implemented through `0.4.0-statistics.0`; transport remains deliberately absent.

## Architecture

Nova Prime is a static, local-first ES-module application with two equal runtime environments: a hosted HTTPS web deployment and a device-local loopback HTTP server for use without internet or Wi-Fi. It will use one robot transport, one protocol layer, one execution queue, one session controller, and mode adapters for Reps, Time, Music, and MSYNC.

```text
UI
 ↓
Application commands and session controller
 ↓
Domain models and session-mode adapters
 ↓
Robot executor / audio service / MSYNC scheduler
 ↓
Bluetooth transport and persistent storage
```

Features outside the robot executor may not write Bluetooth commands directly.

## Application interface

The default route is the operational Training dashboard, not a product or development landing page. Its information hierarchy follows Nova Trainer: header, connection, calibration, training setup, built-in drills, custom drills, and totals. Nova Plus contributes difficulty selection, Reps/Time/Music/MSYNC modes, count or duration, and pause controls. Secondary Statistics, Data, About, Diagnostics, and Roadmap screens live in a drawer. Controls whose backing capability is not implemented remain disabled and explicitly labelled.

## Canonical session lifecycle

```text
IDLE → PREPARING → ARMED → COUNTDOWN → RUNNING ⇄ PAUSED
                                      ↓
                                   STOPPING → IDLE

RUNNING or PAUSED → COMPLETED → IDLE
Any active state → ERROR or STOPPING
```

Every command returns `EXECUTED`, `IGNORED`, `BLOCKED`, or `FAILED`. Repeated Stop is idempotent.

## Canonical data

- Drills have immutable IDs, a source, group, robot position, random flag, and up to three level programs.
- Programs contain ordered steps; steps contain variants and scatter.
- Calibration profiles are versioned and contain setup, parameters, observations, accuracy, and Quick Check data.
- Session specifications select mode, drill, level, amount, pause, media, and calibration.
- Tracks use SHA-256 content identity. Playlists reference Track IDs.
- MSYNC attachments retain authoritative source text and a validation receipt.
- Session records distinguish planned and dispatched balls, outcomes, mode, duration, and optional level, target, and pause planning fields.

The built-in catalogue is bundled as immutable canonical data with deterministic drill and step IDs. Its source repository, branch, file paths, and Git blob identities are embedded in the module. Built-ins are not duplicated into mutable browser storage. User-created and imported drills occupy the `drills` store and use a dedicated application service for identity, naming, group capacity, ordering, duplication, deletion, and atomic import/export.

## Persistence

The deployed IndexedDB database remains `nova_ultimate` as a compatibility key across the Nova Prime rename, with stores for metadata, settings, drills, calibrations, tracks, playlists, MSYNC attachments, session records, migration receipts, and backups. Changing this internal identity would hide existing browser data, so it remains stable while all user-facing branding and newly exported formats use Nova Prime. localStorage is limited to small bootstrap preferences and tab coordination.

Browser persistence is origin-scoped. Mobile installations must therefore use a stable protocol, hostname, port, and application path. A change from `localhost` to `127.0.0.1`, or from one port to another, may expose a different storage origin and requires export/import recovery.

The 0.1 local-sessions increment creates all target stores at database version 1. Session simulation records are persisted in `sessionRecords`, and custom drills are persisted in `drills`. Custom-drill import validates the complete file before atomically replacing that collection. The visual editor clones a drill into an in-memory draft, validates the whole draft, and writes it once only when Save is selected; closing the editor discards the draft. If IndexedDB cannot be opened, the UI explicitly warns that the current visit is using volatile memory. Backup restore validates the complete document before replacing its included collections in one read-write transaction.

The table preview is a domain-only, deterministic adaptation of Nova Trainer's uncalibrated start-value physics. It has no transport dependency and cannot emit robot commands. An active calibration adds measured lateral and depth offsets to successful landing estimates while retaining the profile accuracy label.

Calibration runs as a transport-free wizard. Standard uses five top, no-spin, backspin, and serve observations; Complete repeats those observations to estimate scatter. The user supplies physical ball delivery independently, selects the observed landing or Net/Long/Wide/Not seen, and may undo any observation. Saving requires at least three landed observations and performs one validated local write. Quick Check stores a dated error summary and suggestions without refitting the profile.

Music is split between a storage-facing library service and a browser-facing audio player. Import calculates a SHA-256 digest before writing, skips exact duplicates, reads duration from browser metadata, and stores the original Blob in `tracks`. Playlists contain contiguous ordered Track IDs. Quick Music retains an in-memory ordered selection of Track IDs. Selection resolution verifies that every Blob is present before the session starts.

`AudioPlayer` owns temporary object URLs, current-track progress, automatic advancement, Pause, Resume, Stop, completion, and recoverable playback errors. `LocalSessionController` accepts Music specifications and remains authoritative for lifecycle, elapsed time, Stop priority, failure state, and session records. Music starts without a delayed countdown so browser playback remains connected to the user's activation gesture. Backup export base64-encodes playable audio and validated restore reconstructs its Blob.

Statistics use a pure domain aggregator over `sessionRecords`. It accepts a period and active calibration profile, filters invalid or future timestamps, and returns immutable summaries, daily activity, mode mix, drill ranking, and at most three rule-based suggestions. The UI renders these results with dependency-free CSS and states that activity completion is neither skill scoring nor evidence of physical ball delivery. No analytics request leaves the device.

## Dual deployment and mobile packaging

- `npm run build` produces the complete static `dist/` directory.
- Releases will publish that directory as a downloadable archive.
- The same build runs from the hosted HTTPS deployment and the device-local server.
- All HTML, CSS, JavaScript, JSON, and media references use relative URLs.
- Navigation uses URL hashes and requires no rewrite or fallback configuration.
- The installed server must provide correct MIME types, especially JavaScript for `.js` modules.
- The recommended address is `http://localhost:<fixed-port>/` or `http://127.0.0.1:<fixed-port>/`.
- A private-LAN address over plain HTTP is not treated as an equivalent deployment because it may not provide the secure context required by Web Bluetooth.
- The loopback deployment requires no upstream network because the browser and HTTP server run on the same device.
- GitHub Pages provides the supported hosted-web deployment and distributes the downloadable local-server bundle.

## Safety boundary

Live robot support is not part of this initial generated solution. A later robot executor must own command epochs, queue cancellation, safe replacement, priority Stop, and single-ball tests before the robot feature flag can be enabled.

Reps and Time dry runs use the canonical lifecycle and priority Stop behavior, but never receive a transport reference and always record zero dispatched balls. They verify local orchestration and recovery without representing hardware execution.

## MSYNC boundary

MSYNC will follow `Parser → Validator → Resolver → Timeline → Scheduler → Session adapter`. Simulation uses the same resolved timeline but receives no reference to a live transport.

## Deployment and rollback

- `main` contains stable releases.
- `jewelflow/0.2-music` contains local tracks, playlists, Quick Music, unified Music sessions, and playable-audio recovery.
- `jewelflow/0.4-statistics` contains local activity summaries and explainable plan guidance.
- CI runs tests, build, and verification.
- GitHub Pages deploys only verified `main` builds.
- The initial release has no service worker, simplifying cache rollback.
- Data changes remain additive until migrations and recovery are verified.
