# MSYNC v1

## Update — 2026-11-21 · isolated robot idle/safety fixes

Branch `fix/robot-idle-safety`, candidate version `0.19.1-robot-safety.0`, started from main `09abc2e`. Original uncommitted worktree preserved in `work/nova-prime`; this branch uses `work/nova-prime-robot-safety`. Main/Pages and robot feature flags are unchanged.

Priority fixes were committed first: pending startup cancellation, Music error Stop, five-second audio progress/loading/resume watchdog, transport generation invalidation, blocked overlapping Start/Stop, and Pause acknowledgement filtering. Follow-up protections add initial Stop on connection, two-minute idle/paused Stop-then-disconnect, completion deadlines, explicit MSYNC ONCE Stop, fail-closed missing MSYNC completion/Stop acknowledgement, error-state lifecycle Stop and visible Stop failure feedback/disconnect.

203 automated tests pass, including 30 runtime safety scenarios plus transport/executor/lifecycle regressions. Test fixture uses actual production runtime, protocol, executor, transport and AudioPlayer with fake DOM/Bluetooth/audio and virtual time; production bootstrap audio reactions are represented in the fixture. This is software evidence, not motor-current/temperature or firmware-sleep verification. See [ROBOT_IDLE_SAFETY.md](ROBOT_IDLE_SAFETY.md) for behavior, limits and retest matrix. No physical robot operated. Hardware warmth/battery cause remains unconfirmed. Keep this candidate on its branch pending review and hardware verification; do not merge automatically.


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


## Update — 2026-11-22 · browser audio startup correction

Version `0.19.3-audio-timers.0`, branch `fix/browser-audio-timers`, starts from main `d23389e`. Hosted v0.19.2 MSYNC stayed at 0:00/COUNTDOWN for more than 10 seconds without sound. Reproduced with the matching supplied MP3 in the full production browser bootstrap: native timer functions were called with AudioPlayer as receiver, causing Illegal invocation in watchdog cancellation and again in error cleanup. Bind both timer callbacks to globalThis. Keep the five-second watchdog and Stop protections.

Live MSYNC now becomes RUNNING only after confirmed audio playback; pending startup shows STARTING AUDIO and remains cancellable. 212 automated tests pass, including browser-style receiver enforcement and delayed/zero-countdown lifecycle cases. The 67-file production verifier passes. Real browser playback with the matching MP3 and an isolated startup timeline advanced through its INLINE cue and completed at STOP; blocked and indefinitely pending playback reached ERROR with Done usable, and a subsequent normal run completed. No console warnings/errors. Bluetooth was simulated; no hardware operated. The original full EOT timeline still needs physical retesting. Test-only audio failure controls are excluded from production.

User reports the v0.19.2 three-ball retest fired three balls and Done returned from the completed screen; later idle Bluetooth disconnect was acceptable. Automatic return to the Training dashboard remains a discussion item, not implemented here. IndexedDB schema, stored IDs, robot feature flags and partial physical gate status remain unchanged. Calibration/MSYNC hardware verification remains PENDING; this fix is software evidence only. Preserve the original dirty worktree.

## Update - 2026-11-22: MSYNC session controls

Version `0.19.4-msync-controls.0`, branch `fix/msync-session-controls`, starts from main `d532a5c`. User confirms v0.19.3 MSYNC executes and plays, but session Pause/Stop controls do not respond: controls verification FAIL, not a complete MSYNC hardware pass. Frequent audio/MSYNC renders replaced the complete session subtree, detaching buttons during pointer interaction. Focused screen updates now preserve the control row, buttons, handlers and ancestors while updating readouts and disabled states; countdown cancellation is also retained. No transport/protocol, IndexedDB or robot flag changes.

212 automated tests passed, plus six real browser DOM regression checks (held Stop across 50 readout refreshes, exactly one command, paused/terminal disabled states, countdown identity, transition rebinding). Full production bootstrap with real matching MP3 and simulated Bluetooth verified Pause, held Resume, held Stop during the active INLINE cue, return to setup and countdown cancellation, with no console warnings/errors. Existing coordinator tests verify no later cues after Stop. The browser fixture overlay was moved away from session controls; earlier fixture overlay could intercept clicks and must not be used as evidence of user-button behavior. Test-only fixtures are excluded from the 68-file verified deployment. No physical robot operated. Android MSYNC Pause/Resume/Stop and Calibration remain PENDING. Motor-power/sleep behavior remains physically unverified.

Automatic dashboard return on normal completion remains out of scope; manual Stop already returns to setup. Preserve original dirty worktrees. Package `nova-prime-0.19.4-msync-controls.0-release.zip` has index.html at root, licenses and notices. Back up main before merging the verified correction.
