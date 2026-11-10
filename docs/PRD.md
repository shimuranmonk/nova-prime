# Nova Prime Product Requirements

## Vision

Nova Prime is the unified community application for the PONGBOT Nova S Pro. Nova Trainer supplies the canonical robot, calibration, physics, editor, and session foundation. Nova Plus contributes Music, playlists, MSYNC, statistics, sharing, and later stable voice control.

## Product principles

1. Safety before convenience.
2. One authoritative session.
3. Local-first operation.
4. No silent data loss.
5. Simple basic workflow with discoverable advanced controls.
6. Simulation before synchronized live execution.
7. One canonical implementation for overlapping features.
8. Traceable, testable behavior.

## Release plan

| Release | Scope |
| --- | --- |
| 0.1 Foundation | Trainer parity, canonical models, migration framework, Reps and Time |
| 0.2 Music | Stored audio, playlists, Quick Music, unified Music sessions |
| 0.3 MSYNC | Validation, simulation, safe live synchronization |
| 0.4 Connected | Versioned sharing and stable voice control |
| 1.0 Stable | Verified unified product with migration and documentation |

## Requirement groups

### Robot and safety — NU-FR-001 to NU-FR-009

- Connect and disconnect through compatible Web Bluetooth.
- Show explicit connection and authentication states.
- Permit only one live session.
- Give Stop priority over timers, queues, audio, and cues.
- Prevent stale commands from restarting the robot.
- Bound retries and report critical failures.
- Provide timestamped diagnostics.
- Avoid duplicate balls after visibility changes.
- Request wake support where available.

### Drills and editor — NU-FR-010 to NU-FR-024

- Retain 34 built-in drills, three levels, and custom groups A/B/C.
- Give custom drills immutable identities.
- Support complete custom-drill management and import/export.
- Support sequential/random operation, variants, scatter, and bulk adjustments.
- Provide visual table editing, predictions, rulers, grid, reordering, and safe testing.

Implementation status: the 34 built-ins, Groups A/B/C library management, immutable custom identities, ordering, import/export, selection, safe simulation, ball parameters, and visual table editing are complete.

### Calibration and feedback — NU-FR-025 to NU-FR-032

- Support Standard and Complete guided calibration.
- Model top, no-spin, backspin, and serve behavior.
- Support Undo, multiple-ball observations, Quick Check, import/export, corner placement, and Net/Out suggestions.

Implementation status: Standard and Complete manual observation plans, Undo, repeated observations, local profile import/export, Quick Check, and Net/Long/Wide guidance are complete. Automated ball dispatch and physical corner testing remain behind the live-robot safety boundary.

### Sessions — NU-FR-033 to NU-FR-041

- Use one lifecycle for Reps, Time, Music, and MSYNC.
- Support explicit countdown, pause, resume, stop, estimates, replay, and seamless zero-pause execution.
- Keep robot, timers, cues, and mode-owned audio coordinated.

### Music — NU-FR-042 to NU-FR-050

- Store and deduplicate audio locally.
- Support playlists, Quick Music, progress, automatic completion, and recoverable missing-audio errors.

### MSYNC — NU-FR-051 to NU-FR-062

- Support approved MSYNC v1 behavior.
- Verify audio identity and duration.
- Validate without silent repair and attach atomically.
- Resolve built-in, custom, and inline drills.
- Separate simulation from live transport.
- Support approved cues, Robot Lead, safe queue boundaries, and pre-start revalidation.

### Statistics — NU-FR-063 to NU-FR-068

- Record cumulative totals, outcomes, modes, duration, and optional Net/Out counts.
- Support manual baselines and user-controlled export.

### Data and migration — NU-FR-069 to NU-FR-078

- Version persistent data.
- Detect supported legacy sources.
- Preview, back up, validate, and commit migrations atomically.
- Support file migration across origins.
- Provide scoped reset, quota warnings, backup, and validated restore.

### Interface — NU-FR-079 to NU-FR-085

- Support responsive portrait and landscape layouts.
- Keep Stop accessible.
- Support Auto, Light, Dark, and Court themes.
- Communicate state with text and accessible controls.
- Keep advanced functionality out of the simple training path.

### Web and offline deployment — NU-FR-094 to NU-FR-099

- Support normal hosted-web operation over HTTPS.
- Distribute a complete static bundle that can be copied to an HTTP server installed on a phone or tablet.
- Support loopback URLs such as `http://localhost:<port>/` and `http://127.0.0.1:<port>/` without server-side routes.
- Use relative asset paths and hash-based navigation so subdirectories and simple static servers work.
- Detect insecure non-loopback HTTP hosting before exposing live robot controls.
- Warn that changing hostname, port, or path may make origin-scoped browser data unavailable and provide backup/restore guidance.
- Require no upstream internet or Wi-Fi connection when browser and HTTP server operate locally on the same device.

### Sharing and voice — NU-FR-086 to NU-FR-093

- Make sharing explicit, versioned, and validated.
- Keep voice disabled by default.
- Route Start, Stop, Rest, and Resume through canonical session commands.
- Preserve touch fallback and all live safety confirmations.

## Non-functional requirements

- Stop and state transitions must be deterministic and testable.
- Core data remains local by default.
- Imported data is untrusted and validated.
- Audio work cannot block safety controls.
- Formats are versioned and builds reproducible.
- Failed migration or optional-mode execution returns the application to a recoverable state.

## Current generated-solution boundary

The stable foundation provides the modular shell, canonical schemas, validators, state machine, tests, CI, and documentation. The 0.1 local-sessions increment adds IndexedDB persistence, validated backup/restore, persistent simulation records, and usable Reps/Time dry runs. It intentionally contains no live transport or robot executor and records zero physically dispatched balls.

The app-shell increment makes Training the default experience and adopts the approved Nova Trainer-first card hierarchy with Nova Plus level, mode, amount, and pause controls. It does not mark the drill library, editor, calibration, Music, MSYNC, or robot connection complete merely because their future locations are visible.

The drill-library increment integrates the complete 34-entry Nova Trainer catalogue with three canonical programs per drill, source provenance, stable IDs, category selection, level selection, and local session/history linkage. The following visual-editor increment enables draft-based custom programs for Levels 1–3, with a 20-step limit, multiple ball variants, ordering, random/sequential playback, and an explicitly uncalibrated table estimate. Physical robot execution remains outside this increment.

The guided-calibration increment records user-observed landings for Standard or Complete plans, derives bounded lateral and depth offsets, reports accuracy and scatter, supports atomic import/export, and runs Quick Check without refitting the saved profile. Calibrated corrections affect visual previews only. Phone, tablet portrait, tablet landscape, and desktop layouts are independently verified.
