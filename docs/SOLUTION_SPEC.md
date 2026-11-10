# Nova Prime Solution Specification

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

The default route is the operational Training dashboard, not a product or development landing page. Its information hierarchy follows Nova Trainer: header, connection, calibration, training setup, built-in drills, custom drills, and totals. Nova Plus contributes difficulty selection, Reps/Time/Music/MSYNC modes, count or duration, and pause controls. Secondary Data, About, Diagnostics, and Roadmap screens live in a drawer. Controls whose backing capability is not implemented remain disabled and explicitly labelled.

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
- Session records distinguish planned and dispatched balls, outcomes, mode, and duration.

The built-in catalogue is bundled as immutable canonical data with deterministic drill and step IDs. Its source repository, branch, file paths, and Git blob identities are embedded in the module. Built-ins are not duplicated into mutable browser storage. User-created and imported drills occupy the `drills` store and use a dedicated application service for identity, naming, group capacity, ordering, duplication, deletion, and atomic import/export.

## Persistence

The deployed IndexedDB database remains `nova_ultimate` as a compatibility key across the Nova Prime rename, with stores for metadata, settings, drills, calibrations, tracks, playlists, MSYNC attachments, session records, migration receipts, and backups. Changing this internal identity would hide existing browser data, so it remains stable while all user-facing branding and newly exported formats use Nova Prime. localStorage is limited to small bootstrap preferences and tab coordination.

Browser persistence is origin-scoped. Mobile installations must therefore use a stable protocol, hostname, port, and application path. A change from `localhost` to `127.0.0.1`, or from one port to another, may expose a different storage origin and requires export/import recovery.

The 0.1 local-sessions increment creates all target stores at database version 1. Session simulation records are persisted in `sessionRecords`, and custom drills are persisted in `drills`. Custom-drill import validates the complete file before atomically replacing that collection. If IndexedDB cannot be opened, the UI explicitly warns that the current visit is using volatile memory. Backup restore validates the complete document before replacing its included collections in one read-write transaction.

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
- `jewelflow/0.1-custom-drills` contains the persistent custom-library increment.
- CI runs tests, build, and verification.
- GitHub Pages deploys only verified `main` builds.
- The initial release has no service worker, simplifying cache rollback.
- Data changes remain additive until migrations and recovery are verified.
