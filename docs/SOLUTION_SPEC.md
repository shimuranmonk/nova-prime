# Nova Ultimate Solution Specification

## Architecture

Nova Ultimate is a static, local-first ES-module application. It will use one robot transport, one protocol layer, one execution queue, one session controller, and mode adapters for Reps, Time, Music, and MSYNC.

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

## Persistence

The target IndexedDB database is `nova_ultimate`, with stores for metadata, settings, drills, calibrations, tracks, playlists, MSYNC attachments, session records, migration receipts, and backups. localStorage is limited to small bootstrap preferences and tab coordination.

## Safety boundary

Live robot support is not part of this initial generated solution. A later robot executor must own command epochs, queue cancellation, safe replacement, priority Stop, and single-ball tests before the robot feature flag can be enabled.

## MSYNC boundary

MSYNC will follow `Parser → Validator → Resolver → Timeline → Scheduler → Session adapter`. Simulation uses the same resolved timeline but receives no reference to a live transport.

## Deployment and rollback

- `main` contains stable releases.
- `jewelflow/ultimate-foundation` contains this initial implementation.
- CI runs tests, build, and verification.
- GitHub Pages deploys only verified `main` builds.
- The initial release has no service worker, simplifying cache rollback.
- Data changes remain additive until migrations and recovery are verified.
