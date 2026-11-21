# MSYNC v1

## Update — 2026-11-21 · Nova Plus MSYNC parity candidate

Version `0.19.0-msync-parity.0` adapts the user-supplied Nova Plus PROD8 session controller and robot adapter. It retains the original audio-clock polling, countdown/pre-roll, lead timing, repeating 100-cycle batches versus ONCE, REST restart, IDLE, flavors, variants/random/scatter, and Stop-before-replacement semantics. Prime's executor remains the only transport writer. Stop/background/disconnect cancel the coordinator; late awaited audio starts/resumes cannot revive stopped sessions. Concurrent starts are rejected while preparation is pending.

Attachment warnings require acknowledgement, and launch revalidation recomputes the stored audio SHA-256. Existing IndexedDB stores and custom IDs remain unchanged. The MSYNC activity view shows current/next cues and a bounded event log in setup and training; each Music track has Copy Audio Hash with manual clipboard fallback.

Browser smoke checks passed for startup, activity display, track import/hash action, warning acknowledgement and timeline attachment; no browser console errors were observed. The 66-file bundle and ZIP integrity checks passed. 165 automated tests passed, including the original Nova Plus controller/adapter cases and Prime integration regressions for REST, repeats, more than 100 events, audio failure, countdown cancellation and late resume. No robot was operated during development. Physical MSYNC and Calibration remain PENDING; the existing authorized live beta flag is unchanged. Continuous MSYNC batches do not establish physically measured ball totals; manual correction remains necessary. Candidate package: `nova-prime-0.19.0-msync-parity.0-release.zip`. Publication is not yet confirmed.

The sections below describe the original simulation milestone and are historical where they refer to future live support. The candidate above is the current runtime.


## Business challenge

Music-synchronized training is valuable only when a timeline targets the exact local audio and its drill instructions are predictable. A permissive import or hidden repair could shift cues or produce unsafe future robot behavior.

## Intent

Nova Prime accepts the already-frozen Nova community MSYNC v1 format, validates it without silent repair, attaches it to matching audio atomically, and runs the resolved timeline as an offline simulation.

## Intent analysis

- Audio filename, SHA-256 identity, and duration are checked against the selected local Track.
- Built-in, custom, and inline drills are resolved before attachment.
- Cue order, STOP behavior, REST boundaries, ball ranges, and format casing are validated.
- Robot Lead defaults to the file's value (1.300 seconds when omitted) and can be overridden per simulation from 0 to 5 seconds.
- The simulation and future live executor are separate. This release never opens Bluetooth or transmits a planned command.

## Product requirements

1. Import `.ini` or `.msync` format-v1 files only.
2. Show stable errors with code, section, line, and message.
3. Do not change stored data when validation fails.
4. Replace an existing attachment for the same track in one atomic transaction.
5. Revalidate source, audio identity, duration, and drill references immediately before every session.
6. Support DRILL, INLINE, FLAVOR, REST, IDLE, and STOP cues.
7. Synchronize simulation position to local audio and retain priority Pause, Resume, and Stop.
8. Record zero physically dispatched balls.

## Solution specification

The implementation follows `Parser → Validator → Resolver → Timeline → Simulator → Session adapter`. The parser and validator are derived from the frozen v1 implementation already held in the Nova project sources. `MsyncService` owns validation, source fingerprints, revalidation, and atomic persistence. `MsyncSimulator` consumes only validated parsed data and emits logical activation and `ROBOT_PLAN` events marked as simulation.

## Generated solution

Version `0.3.0-msync.0` adds a responsive MSYNC management route, track/file attachment workflow, validation report, source export, training selection, Robot Lead control, synchronized audio timeline console, lifecycle controls, history integration, backup compatibility, and automated coverage. It operates from hosted HTTPS or the same static bundle served by a device-local HTTP server.

## Safety boundary

`ROBOT_PLAN` is diagnostic output, not transport. Live Bluetooth remains disabled until a later executor has queue cancellation, priority Stop, disconnect handling, fake-transport tests, and physical Nova S Pro verification.
