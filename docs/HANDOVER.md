# Nova Prime project handover

> Prepared 2026-11-14 for continuation in a new conversation. This document is the human-readable project record. For a compact agent startup brief, read [CONTINUATION.md](CONTINUATION.md).

## 1. Executive summary

Nova Prime is the unified, local-first community application for the PONGBOT Nova S Pro. It combines Nova Trainer's robot foundation, calibration approach, physics, drill catalogue, and visual editing with Nova Plus's Music, playlists, MSYNC, statistics, sharing, voice, and parameter model.

The application is a static ES-module web application. The same `dist/` bundle is intended to run:

- on the hosted web over HTTPS;
- on a phone or tablet through an installed loopback HTTP server when no internet or Wi-Fi is available;
- on desktop, phone, or tablet in portrait and landscape.

The software foundation and simulation features are substantial and automated verification is green. Live Bluetooth control is deliberately disabled. Physical Nova S Pro verification is the main release boundary, not a missing checkbox.

## 2. Mission and locked product decisions

These decisions were agreed during the project and should not be casually reopened:

1. **Product name:** Nova Prime. Older internal references to Nova Ultimate should be treated as historical compatibility identifiers only.
2. **Primary interaction model:** Nova Trainer's compact app-style dashboard and editor, enhanced with selected Nova Plus controls and modes.
3. **Parameter authority:** Nova Plus parameter ranges and speed-dependent Spin compatibility are authoritative: Speed 0–10, Spin 0–10 subject to the dynamic limit, Height −50–100, Drop −10–10, BPM 30–90, and Reps 1–100.
4. **Trainer semantics retained:** Active is the canonical step-enabled flag. Serve is represented by negative Height, normally toggling between −30 and 35. Serve positions stay fixed during random order.
5. **Visual editor:** the complete graduated table, synchronized Height control, and Left/Middle/Right robot-position controls must remain visible and responsive. Direct placement fits Speed and Drop while preserving Height, Spin, type, BPM, Reps, and Scatter.
6. **Landscape layout:** calibrated placement/table and Program Order/parameters should use the available width beside one another. Phones and constrained layouts may stack without clipping.
7. **Runtime model:** hosted HTTPS and device-local loopback HTTP are equally supported. Opening `index.html` directly as a `file:` URL is not supported.
8. **Data model:** local-first IndexedDB, validated import/export, atomic writes, explicit recovery, and no silent data loss.
9. **Safety:** one canonical session lifecycle and one robot executor. Stop has priority. Nothing resumes automatically after backgrounding or foreground return.
10. **Live robot gate:** do not enable `FEATURE_FLAGS.robot` until the physical checklist passes. Passing unit tests is not permission to activate the robot.
11. **License:** AGPL-3.0-or-later, with full license, source offer, notices, and no-warranty boundary packaged in every release.
12. **Credits:** retain credit to nova_fan of TableTennisDaily for Nova Trainer and to olanga of TableTennisDaily for pioneering Nova S Pro customization, plus the wider community credits already recorded.

## 3. JewelFlow

The named workflow is:

1. Business Challenge
2. Intent
3. Intent Analysis
4. Product Requirements Document
5. Solution Specification
6. Generated Solution

When the maintainer says **“use JewelFlow”**, work through those stages in order. Do not jump directly to code unless the earlier stages already exist and are explicitly approved. The project record is in [JEWELFLOW.md](JEWELFLOW.md), [PRD.md](PRD.md), and [SOLUTION_SPEC.md](SOLUTION_SPEC.md).

## 4. Repository and branch state

- Repository: <https://github.com/shimuranmonk/nova-prime>
- Current working branch: `jewelflow/0.17-trainer-beta9-parity`
- Functional implementation commit: `95e0c69` — `Integrate Trainer beta.9 drill workflows`
- Remote branch: `origin/jewelflow/0.17-trainer-beta9-parity`
- Pull request for 0.17: not created at the time this handover was drafted.
- PR #26, the AGPL 0.16 increment, is merged on GitHub.

The local `origin/main` tracking reference was stale when this document was prepared and still displayed the pre-0.16 commit. Fetch before comparing, rebasing, or opening a pull request.

### Known local worktree condition

Three pre-existing newline-only modifications are intentionally not part of the 0.17 commit:

- `src/domain/drills/builtin-catalog.js`
- `src/infrastructure/storage/memory-store.js`
- `test/builtin-drills.test.js`

They were present before the 0.17 work began. Do not discard or commit them without inspecting `git diff` and confirming intent. The 0.17 implementation was staged by explicit file list so these files stayed out of the commit.

## 5. Current verification baseline

At the end of the 0.17 implementation:

- `npm test`: **130 tests passed**, 0 failed.
- `npm run build`: completed successfully.
- `npm run verify`: **55 built files** and the complete relative module graph verified.
- Browser smoke test: the rebuilt bundle showed the new Sequential/Random controls; Level 1 and Level 2 retained independent choices; single-ball drills kept the order control disabled; Reset settings became available after an override.
- Live robot feature flag: still disabled.
- Physical balls dispatched by current UI sessions: zero.

The preview initially showed a stale build until `npm run build` was run. Always rebuild before browser QA.

## 6. Completed feature inventory

### Application and deployment

- Native JavaScript ES modules and static release bundle.
- Hosted HTTPS and device-local loopback HTTP support.
- Relative assets, hash routing, nested-server paths, safe MIME guidance, traversal containment, and `nosniff` verification.
- Responsive phone, tablet portrait, tablet landscape, desktop, and low-height landscape layouts.
- Auto, Light, Dark, and Court themes.
- Application drawer for secondary routes.

### Drills and editor

- Verified 34-drill Nova Trainer catalogue: 6 Basic, 12 Combined, 16 Complex, three levels each.
- Persistent custom Groups A/B/C with create, rename, duplicate, regroup, reorder, delete, select, import, export, and 100-drill group limits.
- Atomic visual-editor save and cancel/rollback behavior.
- Up to 20 ordered steps and multiple variants per step.
- Complete graduated table with pointer, tap, drag, and keyboard targeting.
- Height control and Left/Middle/Right robot placement.
- Active and Serve controls.
- Scatter, variants, sequential/random order, and serve-aware randomization.
- Nova Plus parameter ranges and dynamic Speed/Spin compatibility.
- Calibrated and uncalibrated placement estimates with explicit accuracy boundaries.
- Direct placement changes only Speed and Drop.
- 0.17 Add Step inheritance: the new step uses the preceding step's first ball; a copied Serve becomes a normal Height 40 ball; Scatter is inherited only from a one-variant step.
- 0.17 per-level built-in Random/Sequential preferences. Single-ball programs remain sequential.
- 0.17 Reset settings removes built-in playback overrides while preserving the immutable catalogue and every custom drill.

### Sessions, voice, and safety lifecycle

- Canonical state machine for Reps, Time, Music, and MSYNC.
- Countdown, Pause, Resume, Stop, completion, rest between repetitions, and history.
- Voice is optional, one-shot, exact-grammar, confidence checked, and off by default.
- Spoken Start requires touch confirmation. Pause, Resume, and Stop use the same command path as touch.
- 0.17 session specifications and history preserve the resolved Random/Sequential order.

### Calibration and placement

- Standard and Complete manual observation plans.
- Topspin, no-spin, backspin, and Serve observations.
- Undo, repeated observations, accuracy/scatter, import/export, and Quick Check.
- Response model for Drop/lateral, Speed/depth, Height, and signed Spin.
- Visual preview corrections from the active profile.
- Corner-placement model exists, but physical corner verification remains gated with live robot control.

### Music and MSYNC

- Local audio import, SHA-256 duplicate detection, metadata, rename/delete, playlists, and Quick Music.
- Playback progress, Pause/Resume/Stop, automatic completion, history, and playable-audio backup.
- Explicit codec, browser-policy, interrupted-load, object-URL allocation, and missing-audio recovery.
- Frozen MSYNC v1 parsing and strict validation.
- Exact audio identity/duration checking and atomic attachment.
- DRILL, INLINE, FLAVOR, REST, IDLE, STOP, and Robot Lead simulation.
- MSYNC remains simulation only; no planned cue is transmitted to the robot.

### Statistics, sharing, migration, and storage

- Device-local 7-day, 30-day, and all-time activity summaries.
- Completion, activity trend, mode share, drill ranking, and explainable guidance.
- Versioned custom-drill packs with explicit selection, download/native share, hostile-input validation, read-only preview, and atomic import.
- Nova Plus CSV custom-drill preview, validation, built-in exclusion, atomic migration, and duplicate receipts.
- Versioned complete backup/restore including playable audio.
- IndexedDB atomicity, quota/abort/blocked-upgrade/inactive-transaction error handling, and explicit memory fallback.

### Robot foundation—packaged but inactive

- Public-source-attributed GATT profile and protocol encoder.
- Four-stage authenticated connection and bounded login timeout.
- Serialized writes and completion notifications.
- Command epochs, stale-queue cancellation, priority Stop, and bounded Stop retry.
- Bounded diagnostics that avoid packet contents and Bluetooth identifiers.
- Visibility/page-hide safety monitor that requests one priority Stop and never auto-resumes.

## 7. Latest Nova Trainer comparison and 0.17 integration

The newly supplied Nova Trainer HTML was version `0.1.0-beta.9`; the earlier baseline was `0.1.0-beta.6` from `shimuranmonk/nova-advance`, branch `nova-trainer`.

Important beta.9 changes found:

- left-handed mirroring for built-ins;
- per-level built-in randomization;
- built-in recovery;
- improved Add Ball inheritance;
- mobile/iPhone share and CSV text fallback.

The 0.17 Nova Prime branch integrates the requested subset:

- per-level built-in playback order;
- Prime-appropriate built-in recovery through preference reset, because Prime's catalogue is immutable;
- resolved order in session specifications/history;
- Add Step inheritance with Serve and Scatter safeguards.

Not yet integrated from the beta.9 comparison:

- left-handed built-in mirroring;
- Trainer's iPhone CSV text export/import fallback as a general Prime data-export pattern.

These should be evaluated as separate JewelFlow increments, not silently folded into live-control work.

## 8. What is still on the plate

Continuation update (2026-11-14): [PR #27](https://github.com/shimuranmonk/nova-prime/pull/27) tracks 0.17 and the handover. Main's documentation conflict was resolved preserving the 0.16 and 0.17 descriptions. The fresh checkout does not contain the original three newline-only modifications; they remain untouched in their original location, which was not available in this session. [PHYSICAL_TEST_RUN.md](PHYSICAL_TEST_RUN.md) provides an ordered run sheet and test-only integration constraints. Hardware testing has not run; production control remains disabled. Check PR status and latest CI before repeating repository actions below.

### Immediate repository work

1. Fetch the current remote state.
2. Inspect the three newline-only worktree changes and decide whether to discard or normalize them separately.
3. Open a pull request from `jewelflow/0.17-trainer-beta9-parity` to `main`.
4. Confirm CI and review the complete PR diff.
5. Merge only after CI and review are clean.
6. Update version/status headings that still describe older increments during the next release-hardening pass.

### Physical robot release gate—the highest-priority unfinished work

The live-control stack is not complete until tested on a real Nova S Pro. Execute the checklist in Section 9 with a clear table area and immediate access to the robot's physical power control. Any failed or ambiguous result keeps the feature flag off.

### Remaining engineering/integration work

- Wire the physically verified transport/executor into the production bootstrap and canonical session controller.
- Ensure every live Reps, Time, Music, and MSYNC path uses the same executor and priority Stop.
- Convert session history from simulated zero-dispatch records to truthful planned/dispatched counts only after successful physical writes.
- Add device wake handling only after determining browser support and safe failure behavior.
- Add fake monotonic-timer and visibility-change integration coverage.
- Test long-running MSYNC drift across live executor queue boundaries.
- Build a target-device audio codec compatibility matrix.
- Add remaining migration fixtures: legacy Trainer data and Nova Plus settings, statistics, music, playlists, and MSYNC attachments.
- Decide whether to add left-handed built-in mirroring from Trainer beta.9.
- Decide whether Prime needs the Trainer beta.9 iPhone CSV text fallback in addition to Prime's JSON download/native-share workflows.
- Consider manual statistics baselines only as a separate product requirement.

### Remaining UX and release hardening

- Perform manual accessibility checks: keyboard-only navigation, visible focus, labels, contrast, screen-reader state announcements, and reduced-motion behavior.
- Repeat phone, tablet portrait, tablet landscape, desktop, and low-height landscape regression after live controls are wired.
- Confirm that Connect, Stop, diagnostics, calibration, and the visual editor remain reachable without clipping.
- Validate destructive confirmations and recoverability for reset/delete/restore actions.
- Run the full backup/restore and cross-origin export/import journey.
- Update all stale implementation-status headers and the in-app Roadmap.
- Prepare release notes, version bump, final archive, checksums if desired, and hosted deployment.
- Perform the planned 0.3.1-style release-hardening pass after feature completion and before declaring stable.

## 9. Detailed physical test checklist

Record device, operating system, browser/version, origin, orientation, robot firmware if known, date, tester, and result for every run. Capture diagnostics for failures without recording secrets or Bluetooth identifiers.

### A. Safety preparation

- [ ] Clear the table and surrounding launch area.
- [ ] Confirm immediate access to the robot's physical power switch or plug.
- [ ] Use conservative speed, spin, height, direction, BPM, and Reps for the first balls.
- [ ] Confirm the software Stop control remains visible.
- [ ] Start with no music, MSYNC, voice, or background activity.
- [ ] Agree on an emergency-stop action before beginning.

### B. Connection and authentication

- [ ] Connect from a deliberate user gesture.
- [ ] Confirm searching, GATT discovery, authentication, and ready states are truthful.
- [ ] Disconnect normally and reconnect.
- [ ] Power the robot off unexpectedly and confirm safe disconnect/error state.
- [ ] Test login timeout and confirm the connection closes and Connect becomes usable again.
- [ ] Reject/cancel the browser chooser and confirm recovery.
- [ ] Verify diagnostics are bounded and contain no packet payloads or identifiers.

### C. Conservative command verification

- [ ] Send exactly one conservative normal ball.
- [ ] Confirm Speed, Spin, Top/Back, Height, Drop, BPM, and Reps correspond to the intended values.
- [ ] Test one conservative backspin ball.
- [ ] Test one Serve using negative Height and verify the first bounce is on the robot side.
- [ ] Set a step inactive and verify it is not dispatched.
- [ ] Test Scatter at a low value and verify it stays within the safe Drop envelope.

### D. Drill and playback order

- [ ] Run a known two-step sequential drill and confirm order.
- [ ] Run the same drill in random mode and confirm only eligible positions move.
- [ ] Confirm Serve positions stay fixed during random order.
- [ ] Verify built-in order preferences independently at Levels 1, 2, and 3.
- [ ] Verify single-ball built-ins remain sequential.
- [ ] Use Reset settings and confirm built-in defaults return without changing custom drills.
- [ ] Test variants and confirm one valid variant is selected per step.
- [ ] Verify Add Step inheritance, Serve-to-normal conversion, and conditional Scatter inheritance.

### E. Canonical session lifecycle

- [ ] Reps countdown, run, completion, and history.
- [ ] Time countdown, run, completion, and history.
- [ ] Zero-pause repetitions without duplicate balls.
- [ ] Pause stops future dispatch at a safe boundary.
- [ ] Resume continues once, without replaying stale commands.
- [ ] Stop during countdown.
- [ ] Stop during active delivery.
- [ ] Repeated Stop remains safe and idempotent.
- [ ] Stop while several commands are queued.
- [ ] Stop while a write is in flight; Stop must be the next write after the current one.
- [ ] Unexpected disconnect records a truthful outcome and never restarts automatically.

### F. Background, lock, and interruption safety

- [ ] Lock the screen during an active session; verify priority Stop.
- [ ] Unlock/return; verify no automatic resume.
- [ ] Background and foreground the browser; verify one Stop and no duplicate dispatch.
- [ ] Switch tabs/apps rapidly; verify no stale queue restart.
- [ ] Trigger `pagehide`/navigation; verify Stop behavior.
- [ ] Receive a phone interruption where practical and verify recovery.

### G. Calibration and placement

- [ ] Complete Standard calibration with real observed landings.
- [ ] Complete Complete calibration and compare scatter/accuracy.
- [ ] Run Quick Check and assess whether guidance matches observation.
- [ ] Verify table marker, target ring, and real landing direction agree after calibration.
- [ ] Verify direct placement preserves Height, Spin, type, BPM, Reps, and Scatter.
- [ ] Place the robot in the middle and test expected placement.
- [ ] Place it flush in the left corner, aim toward the player's end-line centre, run the guided test ball, and verify correction guidance.
- [ ] Repeat for the right corner.
- [ ] Confirm unreachable corner targets are reported rather than sent as unsafe guesses.

### H. Music, MSYNC, and voice with live control

- [ ] Music starts only after user activation and remains coordinated with the session.
- [ ] Pause, Resume, Stop, track completion, and audio failure stop or coordinate robot delivery correctly.
- [ ] MSYNC pre-start identity/duration validation still blocks invalid input.
- [ ] Test DRILL, INLINE, FLAVOR, REST, IDLE, and STOP transitions conservatively.
- [ ] Measure long-running cue drift and Robot Lead behavior.
- [ ] Confirm priority Stop overrides pending cues.
- [ ] Confirm spoken Start still requires touch confirmation.
- [ ] Confirm voice Pause/Resume/Stop use the canonical path and never bypass safety state.

### I. Device, layout, and origin matrix

- [ ] Desktop Chrome over hosted HTTPS.
- [ ] Desktop Edge where supported.
- [ ] Android Chromium browser over hosted HTTPS.
- [ ] Android loopback HTTP server using a fixed `localhost` or `127.0.0.1` port.
- [ ] iPhone/iPad Bluefy workflow where supported.
- [ ] Phone portrait and landscape.
- [ ] Tablet portrait at approximately 768 × 1024.
- [ ] Tablet landscape at approximately 1024 × 768.
- [ ] Low-height landscape editor with no clipped table, Height control, or Stop.
- [ ] Plain non-loopback HTTP shows a warning and keeps live controls disabled.
- [ ] Installed subdirectory build loads all modules with correct MIME types.

### J. Persistence and recovery

- [ ] Settings, drills, calibration, audio, MSYNC attachments, and history survive ordinary reload.
- [ ] Same origin survives HTTP-server restart.
- [ ] Backup before changing hostname, port, protocol, or path.
- [ ] Complete backup export and validated restore on a clean origin.
- [ ] Transfer between hosted and local origins by explicit export/import.
- [ ] Storage-full and blocked-upgrade failures remain recoverable without partial writes.
- [ ] Built-in preference reset does not alter custom drills.

## 10. Recommended continuation order

1. **Repository hygiene:** fetch, inspect the three newline-only files, open/merge the 0.17 PR.
2. **Prepare a physical-test build:** do not enable general release; create a narrowly controlled test-only integration if needed.
3. **Run connection and single-ball tests first.** Stop on any unexpected behavior.
4. **Run Stop/queue/background tests before full drills or synchronized modes.**
5. **Run calibration, Serve, random order, and corner placement.**
6. **Run Music and MSYNC only after basic live lifecycle is proven.**
7. **Repeat on phone/tablet, orientations, hosted HTTPS, and device-local loopback HTTP.**
8. **Only after all physical gates pass:** integrate the live stack into production, turn on the feature flag, update truthful history counters, and rerun the entire matrix.
9. **Finish remaining migration/UX choices and release hardening.**
10. **Prepare the stable release and hosted deployment.**

## 11. Key files

- `src/app/bootstrap.js` — application composition, routes, training UI, session start, 0.17 built-in controls.
- `src/app/drill-editor.js` — responsive visual editor and Add Step inheritance.
- `src/application/drills/builtin-preferences.js` — per-level built-in Random/Sequential settings and reset.
- `src/application/sessions/session-controller.js` — canonical local session lifecycle and records.
- `src/infrastructure/robot/nova-protocol.js` — packet encoding and serve-aware random selection.
- `src/infrastructure/robot/` — transport, connection, protocol, diagnostics, and safety monitor.
- `src/application/robot/robot-executor.js` — command epochs, queue, Pause/Resume/Stop.
- `src/domain/drills/` — canonical drill model, validation, catalogue, and preview physics.
- `src/app/feature-flags.js` — live robot remains disabled here.
- `docs/ROBOT.md` — safety architecture and release gate.
- `docs/TEST_MATRIX.md` — complete automated/future/physical/device matrix.
- `docs/LOCAL_HOSTING.md` — device-local server requirements.
- `docs/CUSTOM_DRILLS.md` and `docs/DRILL_CATALOG.md` — current drill behaviour.

## 12. Commands

```powershell
git status --short
git fetch origin
git log --oneline --decorate -10
npm test
npm run build
npm run verify
npm run preview
```

Always run `npm run build` before browser-testing `http://127.0.0.1:4173/`.

## 13. Definition of completion

Nova Prime is not complete merely because every automated test passes. Completion requires:

- the physical Nova S Pro checklist passing on supported target devices and origins;
- live transport integrated through the canonical session/executor path;
- Stop, queue cancellation, backgrounding, and disconnect proven physically;
- truthful dispatch/history semantics;
- remaining migration and agreed UX work complete;
- full responsive, accessibility, backup/restore, and deployment regression;
- documentation, versioning, license bundle, release notes, and hosted deployment complete.
