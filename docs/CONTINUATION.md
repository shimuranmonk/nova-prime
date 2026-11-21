# Nova Prime continuation memory

## Update — 2026-11-21 · three-ball completion correction

Version `0.19.2-session-completion.0`, branch `fix/session-completion-refresh`, starts from main `504df78`. Android checkpoint 4 reported three Push FH balls fired, but screen stayed RUNNING at 3/3 with Done disabled. Pause caused a refresh, after which Done exited; disconnect happened later (duration unmeasured). Checkpoints 1–3 on v0.19.1 passed; checkpoint 4 remains FAIL until retested.

Reproduced defects: terminal state changes stopped the clock before a final render, estimated-duration admission discarded early valid DONE, and statistics persistence was awaited before controller completion. The correction observes terminal state/history-warning changes, bypasses library I/O for focused session rendering, rejects stale overlapping renders, accepts DONE based on active command phase rather than elapsed estimates, and completes after Stop before asynchronous statistics saving. History-write failures are caught and shown as storage warnings. Live repetition progress is labeled Estimated until completion. Notifications during Pause/Stop/unaccepted writes remain excluded; the firmware marker has no established per-run sequence ID, so delayed post-resume markers remain a physical verification limitation.

209 automated tests passed; the 67-file build/module verification passed. Full production bootstrap/browser screen was exercised with a loopback-only simulated Bluetooth entry: three-ball Push FH reached COMPLETED with Done enabled automatically, Done returned to setup, and both rejected and indefinitely pending statistics writes preserved completion/Done. No console errors or physical robot commands. Test fixture files stay outside the shipped bundle. IndexedDB schema and robot feature flags are unchanged. Physical checkpoint 4 and other hardware checks remain pending.


## Update — 2026-11-21 · isolated robot idle/safety fixes

Branch `fix/robot-idle-safety`, candidate version `0.19.1-robot-safety.0`, started from main `09abc2e`. Original uncommitted worktree preserved in `work/nova-prime`; this branch uses `work/nova-prime-robot-safety`. Main/Pages and robot feature flags are unchanged.

Priority fixes were committed first: pending startup cancellation, Music error Stop, five-second audio progress/loading/resume watchdog, transport generation invalidation, blocked overlapping Start/Stop, and Pause acknowledgement filtering. Follow-up protections add initial Stop on connection, two-minute idle/paused Stop-then-disconnect, completion deadlines, explicit MSYNC ONCE Stop, fail-closed missing MSYNC completion/Stop acknowledgement, error-state lifecycle Stop and visible Stop failure feedback/disconnect.

203 automated tests pass, including 30 runtime safety scenarios plus transport/executor/lifecycle regressions. Test fixture uses actual production runtime, protocol, executor, transport and AudioPlayer with fake DOM/Bluetooth/audio and virtual time; production bootstrap audio reactions are represented in the fixture. This is software evidence, not motor-current/temperature or firmware-sleep verification. See [ROBOT_IDLE_SAFETY.md](ROBOT_IDLE_SAFETY.md) for behavior, limits and retest matrix. No physical robot operated. Hardware warmth/battery cause remains unconfirmed. Keep this candidate on its branch pending review and hardware verification; do not merge automatically.


## Update — 2026-11-21 · Nova Plus MSYNC parity candidate

Version `0.19.0-msync-parity.0` adapts the user-supplied Nova Plus PROD8 session controller and robot adapter. It retains the original audio-clock polling, countdown/pre-roll, lead timing, repeating 100-cycle batches versus ONCE, REST restart, IDLE, flavors, variants/random/scatter, and Stop-before-replacement semantics. Prime's executor remains the only transport writer. Stop/background/disconnect cancel the coordinator; late awaited audio starts/resumes cannot revive stopped sessions. Concurrent starts are rejected while preparation is pending.

Attachment warnings require acknowledgement, and launch revalidation recomputes the stored audio SHA-256. Existing IndexedDB stores and custom IDs remain unchanged. The MSYNC activity view shows current/next cues and a bounded event log in setup and training; each Music track has Copy Audio Hash with manual clipboard fallback.

Browser smoke checks passed for startup, activity display, track import/hash action, warning acknowledgement and timeline attachment; no browser console errors were observed. The 66-file bundle and ZIP integrity checks passed. 165 automated tests passed, including the original Nova Plus controller/adapter cases and Prime integration regressions for REST, repeats, more than 100 events, audio failure, countdown cancellation and late resume. No robot was operated during development. Physical MSYNC and Calibration remain PENDING; the existing authorized live beta flag is unchanged. Continuous MSYNC batches do not establish physically measured ball totals; manual correction remains necessary. Candidate package: `nova-prime-0.19.0-msync-parity.0-release.zip`. Publication is not yet confirmed.


## Update — 2026-11-21 · tabbed VDrill editor

v0.18.14 adds accessible Placement/Parameters tabs, icon-only MSYNC actions next to VDrill Editor heading, a 24px visible placement marker with extended touch area, and Ball variants left/Topspin-Backspin right on one row. Parameters retain two-column fields on phones; long programs scroll within Parameters. Placement height is constrained with container sizing so table, Height and dynamic readouts remain visible. Existing ID-specific mobile CSS had overridden the first draft; corrected and browser-tested at 390x760 portrait and 844x390 landscape. 139 tests passed, 63-file release verification and ZIP integrity passed. Artifact: `nova-prime-0.18.14-android-package.0-release.zip`. Actual A55 touch check remains pending.

## Update — 2026-11-21 · visible MSYNC toolbar and dialog margins

v0.18.13 fixes editor grid row allocation that collapsed the new MSYNC copy toolbar. Explicit header/toolbar/workspace/result/footer rows; manual-copy textarea now stays inside toolbar. Browser verified both visible icons and successful copy actions at desktop and 390x844 phone size. Shared custom dialogs use 20–24px padding; About retains 28px; editor header/footer use 16–20px horizontal padding. Native Chrome confirm/prompt spacing is browser-controlled. 139 tests, 63-file release verification and ZIP integrity passed. Artifact: `nova-prime-0.18.13-android-package.0-release.zip`.

## Update — 2026-11-21 · custom drill MSYNC copy actions

v0.18.12 adds Copy as MSYNC Inline and Copy MSYNC Reference to the visual editor header toolbar, with SVG icons, accessible labels and 48px touch targets. Original Nova Plus behaviour inspected in Downloads/nova-main_inline.zip: js/editor.js and js/msync-inline-export.js. Inline uses current draft and selected level, omits disabled steps, groups variants under the same BALL number, preserves direct parameters/scatter/random, and rejects empty programs. Reference uses saved immutable Prime ID (`CUSTOM:<id>`); selected LEVEL must be supplied in the MSYNC DRILLS mapping. Clipboard failure shows selectable readonly text. 139 tests and 63-file release verification/ZIP integrity pass. Artifact: `nova-prime-0.18.12-android-package.0-release.zip`. Android clipboard test pending. Not merged or published.

## Main update requested

User authorizes updating main for ongoing beta testing. README Current status, Development and Current safety boundary sections removed as requested. Calibration/MSYNC remain pending; other checks passed, with second round after both pass. Build metadata now reflects partial beta verification instead of a completed gate. Local ZIPs/builds preserved and excluded from commits.

## Update — 2026-11-21 · compact grouped menu

v0.18.11 narrows the drawer to min(360px, 86vw), reduces spacing, removes repeated descriptions, and preserves 44px touch targets. Entries grouped under Training, Music, Setup and Information; all action IDs/routes retained. Bundle verification and ZIP integrity passed. Artifact: `nova-prime-0.18.11-android-package.0-release.zip`. Not merged or published.

Physical status correction from user: all checks except Calibration and MSYNC have passed and await a second round. Calibration and MSYNC remain PENDING. This supersedes the earlier aggregate complete-gate report; do not claim the complete physical gate has passed.

## Update — 2026-11-21 · About spacing

v0.18.10 adds 28px internal padding and paragraph/action spacing to About; license notice is reduced to 0.6rem in muted text. Styling-only change; bundle verification and ZIP integrity passed. Artifact: `nova-prime-0.18.10-android-package.0-release.zip`. Not merged or published.

## Update — 2026-11-21 · About and carry-forward ball statistics

v0.18.9 removes menu safety banner, Roadmap and standalone Diagnostics. About opens Nova Prime Beta popup with short description, version, ball/drill totals, repository link and Diagnostics. Plan Guidance retained. Update Ball Statistics edits starting totals and resets balls only, preserving drills. Stored under existing settings store; no database migration. Footer now shows ball/drill totals.

Important counting limit: Nova BLE exposes sequence completion, not individual shot telemetry. New totals count completed finite Reps/MSYNC sequences using encoded ball quantities and one drill per completion. Stopped/interrupted/Time/continuous Music runs need manual correction. Existing mixed cycles/commanded-ball history is not converted. These totals must not be described as sensor-confirmed shots. User was told this limitation before implementation.

138 automated tests pass, including serialized increments, validation and ball-only reset. Browser verified About, Diagnostics, menu cleanup and saving 100 balls/20 drills on disposable local origin. 62-file release verification and ZIP integrity pass. Artifact: `nova-prime-0.18.9-android-package.0-release.zip`. Hardware completion counting still needs Android confirmation. Not merged or published.

## Update — 2026-11-21 · packaged icons and dashboard cleanup

v0.18.8 ships local `src/assets/icons/robot-connect.svg` and `robot-disconnect.svg` referenced relative to the runtime module. Release verification requires both assets. Reps/Time parameter fields now explicitly use equal halves at every breakpoint, preserving the Start/Voice row. Dashboard Manage Music/Manage MSYNC links and redundant Quick Music summary tile are removed; source selector and hamburger Music/MSYNC pages remain. Current track title continues to appear during Music/MSYNC training. 137 tests, 61-file release verification, and ZIP integrity passed. Artifact: `nova-prime-0.18.8-android-package.0-release.zip`. Android icon display needs user confirmation. Not merged or published.

## Update — 2026-11-21 · connection icons

User confirms v0.18.6 header control connects but its power character renders as a placeholder. v0.18.7 replaces the character with inline SVG Bluetooth Connect and Disconnect artwork, switching with authenticated readiness and retaining action labels/help. No external font dependency. 137 tests, 59-file release verification and ZIP integrity passed. Artifact: `nova-prime-0.18.7-android-package.0-release.zip`. Not merged or published.

## Update — 2026-11-21 · dedicated training display and header connection

v0.18.6 removes the production connection panel in favour of a 48px header Connect/Disconnect icon. Logo unchanged; Session setup badge reads Disconnected until authenticated, then Robot ready. Routine connection messages stay hidden; failures remain visible. Active sessions render only the dedicated full-viewport training display: countdown transitions to progress/Pause/Resume/Stop. Stop or cancel resets to the dashboard after priority Stop succeeds; normal completion remains visible with Done. The latter completion behaviour is an explicitly stated implementation assumption. Shared test-only controls remain isolated.

Verification: full 137-test suite passed, session renderer exercised for countdown/running/paused/completed/error/idle, browser checked header icon/disconnected badge/menu without startup errors, 59-file release graph and ZIP integrity passed. Physical Android connected/active flow remains to be retested by user; no robot was operated here. ZIP: `nova-prime-0.18.6-android-package.0-release.zip`. Not merged or published.

## Update — 2026-11-21 · New session reset and Voice row

v0.18.5 fixes New session throwing ROBOT_RESET_BLOCKED after Stop had already reset the executor to idle. Reset now handles idle/stopped/error states appropriately, then resets the canonical session to IDLE, hiding the session panel and unlocking setup. The same live connection panel is reattached after Training rerenders. Voice now shares a 3:1 row with Start in Reps/Time, Music and MSYNC. 137 automated tests and 59-file release verification passed; ZIP integrity passed. Artifact: `nova-prime-0.18.5-android-package.0-release.zip`. Actual Android stop/completion/new-session retest remains pending. No merge or publication performed.

## Update — 2026-11-21 · training drill actions

User confirms v0.18.3 Connect works on Android. v0.18.4 removes the informational paragraph under Start, displays Combined as Mixed and Complex as Multi (stored category IDs remain compatible), and adds long-press/right-click drill actions. Edit on built-ins creates a custom copy; Edit on custom drills opens the existing editor. Save to My drills creates a copy in the selected custom group and opens its naming/settings dialog. A 600 ms hold cancels on movement; ordinary taps retain drill selection. 137 tests, validation of copies of all 34 built-ins, 59-file release verification and ZIP integrity pass. Android long-press interaction needs user confirmation. Artifact: `nova-prime-0.18.4-android-package.0-release.zip`. Not published or merged.

## Update — 2026-11-21 · Connect diagnostics fix

The user reported `Cannot read properties of null (reading 'prepend')` on Connect in v0.18.2. The shared logger tried to append to the diagnostics list that exists only in the test UI. It now retains in-memory diagnostics and skips list rendering when that optional element is absent. v0.18.3 is packaged in `nova-prime-0.18.3-android-package.0-release.zip`; 137 tests and 59-file release verification passed. Actual Android reconnect retest is pending. No merge or publication performed.

## Latest update — 2026-11-20 · physical gate reported passed; production controls integrated

- The maintainer explicitly confirmed that the complete documented physical release gate passed. This is recorded as user-reported aggregate evidence in `PHYSICAL_TEST_RUN.md`; per-device run logs were not supplied in this conversation.
- `FEATURE_FLAGS.robot` is enabled for the production candidate. The normal Training screen mounts the shared authenticated robot runtime with Connect, Disconnect, and priority Stop. Test-only safety checkboxes and per-session confirmation remain confined to the separate test entry point.
- Version advanced to `0.18.0-android-package.0`. Release verification and packaging require the documented gate record and enabled flag. Build scripts can target a new named `dist-*` directory so existing build folders and ZIPs remain untouched.
- Verification passed: 136 automated tests; 59-file module-graph/release check; release ZIP has 59 files with root `index.html`, license/notices, and valid CRC. The candidate has not been merged, pushed, or published. Preserve all existing uncommitted work and test artifacts.

## Latest follow-up — 2026-11-20 · Android menu/Connect fix

- User reported the installed v0.18.0 candidate showed no usable Connect control and the hamburger menu did not respond. The production `MutationObserver` repeatedly rewrote unchanged label/helper text, causing an observer feedback loop; the sticky robot panel also had a higher stack level than the menu.
- Made production text updates idempotent, moved the live controls out of the sticky overlay stack, corrected stale simulation-only About/MSYNC text, and made the visible footer version read generated build metadata.
- Browser smoke check against the local Android-style HTTP origin confirmed Connect is enabled and the hamburger opens the navigation drawer. The corrected artifact is `nova-prime-0.18.2-android-package.0-release.zip` (v0.18.1 was an intermediate correction and is preserved).
- 137 automated tests pass; the 59-file production verifier passes; ZIP root index/license/notices/integrity checks pass. Keep the archive local; it has not been pushed or published.

## Latest continuation update — 2026-11-19 · parallel full-feature physical test build

- Prepared branch `test/robot-live-control` with an isolated full-app physical-test entry point and package. Three Android testers each have a separate Nova S Pro and can test in parallel.
- The distributable is `nova-prime-0.17.0-android-package.0-full-physical-test-ready2.zip`; its `index.html` is at ZIP root and it includes the full source module tree, AGPL license, and third-party notices. Build output is under `dist-full-physical-test-ready2/`.
- The test copy supports live Reps, Time (up to 255 seconds per command), Music, and validated MSYNC drill/flavor cues through the shared authenticated connection and executor. It adds area-clear/power-access checks, explicit physical-session confirmation, always-visible Connect/Disconnect/priority Stop, diagnostics, and background Stop/no auto-resume. Pause sends Stop; Resume starts the remaining configured command and must be checked physically for duplicate/partial-cycle behavior. Calibration remains observation-based; automated calibration shots are not wired to the robot.
- Production remains gated: `src/app/feature-flags.js` keeps `robot: false`; production `bootstrap.js` does not import the robot stack; no changes were merged into `main`. The full test ZIP is not a production release and its live operation has not been physically validated across all four modes.
- Automated suite: 135 passed. Existing production bundle verification: 55 files passed. Full test bundle verification: 52 JavaScript modules, relative imports, license/notices, and unchanged production gate passed. Phone/robot testing is still required; MSYNC timing, Pause/Resume boundary behavior, physical calibration, and repeated/queued Stop remain open release checks.
- Preserve the prior release/physical-test ZIPs and the earlier `dist` folders; this build uses a new output directory and archive name.

## Latest continuation update — 2026-11-19

- Training setup follows Nova Plus: Reps, Time, Music, and MSYNC remain in one horizontal row in that order. Count and Pause share the standard setup row with a compact Voice control at 3/8, 3/8, and 1/4 widths.
- The setup countdown selector is removed. Reps/Time starts use a fixed 3-second, large pre-start counter with a cancel action; the counter disappears when the session begins. Music/MSYNC retain immediate user-gesture audio start.
- Calibration is removed from Training and opened from the hamburger menu as a dedicated profile/settings/parameters page. Existing guided calibration, Quick Check, import, and export remain.
- Robot control remains disabled. Android phone usability testing was reported complete and apparently successful, but the Nova S Pro physical release gate remains unconfirmed.
- The isolated physical-test entry point and ZIP stay separate from production; `FEATURE_FLAGS.robot` and production bootstrap remain gated. User-reported 2026-11-19 checks passed for one conservative ball, stop/disconnect, reconnect, unexpected power-off recovery, login-timeout recovery, chooser-cancel recovery (Connect became available again), two repeated idle priority Stops, and Stop after confirming a single-ball command (one ball fired, robot stationary, no repeated firing). The chooser bug was a connection state left at `connecting` when Web Bluetooth rejected selection; cleanup and cancellation message are fixed and automated tests pass. The rebuilt artifact is `nova-prime-0.17.0-android-package.0-chooser-recovery-physical-test.zip`. Stage 1 is reported PASS; Stage 2 is partial with multi-command queue-load and Stop-order checks still outstanding; later stages remain. Production gate remains closed.

## Latest continuation update — 2026-11-18

- Nova Plus visual alignment is implemented before physical robot testing: light gray/white surfaces, coral active controls, larger touch targets, a 2×2 session-mode selector, larger drill category/cards, and a more readable scrollable menu.
- First-run appearance now defaults to Light; explicit saved Auto/Dark/Court preferences remain available. Calibration, visual editor, Music, MSYNC, voice, sharing, statistics, recovery, and all other Prime features are retained. Browser preview confirmed the light training screen and full menu.
- Automated tests: 130 passed. Production build and release verification passed (55 files). `FEATURE_FLAGS.robot` remains false. The physical gate has not passed; the isolated test-only path and physical checklist remain outstanding.
- The existing untracked Android ZIP was preserved and still represents the earlier UI. Create a separately versioned package for this visual increment after approval; do not overwrite that archive.
- Drill selection now uses mutually exclusive Built-in drills and My drills tabs; Built-in is the default. Drill content and existing filters/actions remain under the matching tab.
- Preserve the untracked Android release ZIP; do not overwrite it while rebuilding or packaging this UI revision.

## Latest continuation update — 2026-11-17

- Focused task: Android local-server distribution. Main baseline fetched at `48a9a10`; checkout was clean.
- Proposed package version: `0.17.0-android-package.0` (verify against merged main before release). Production ZIP contains built `dist/` at archive root; no physical-test build exists or is emitted.
- Added Android extraction/upgrade guide, ZIP packager with license/notices and robot-disabled checks, and tag-triggered GitHub Release workflow. Local tests/build/verify and a 55-entry ZIP integrity check passed after clearing read-only flags from generated `dist/` files.
- Physical gate remains closed; production robot flag stays off. Preserve IndexedDB compatibility key `nova_ultimate` and origin `http://127.0.0.1:8080/`.
- Next: review and merge this increment, run its CI, create matching tag `v0.17.0-android-package.0`, wait for the Release workflow to publish the ZIP, then verify the asset URL and archive contents. Do not describe a release download as published until verified.

> Start here in a new Codex conversation. Then read [HANDOVER.md](HANDOVER.md), [ROBOT.md](ROBOT.md), and [TEST_MATRIX.md](TEST_MATRIX.md). This file is deliberately concise and operational.

## Latest continuation update — 2026-11-16

- PR #27 (0.17 Trainer beta.9 parity) is merged at `3db0187`; its repository actions below are historical and must not be repeated.
- PR #28 (`feature/editor-touch-guides`) contains the cosmetic editor revision: bold direction and X/Y guides, corrected depth ruler, 44-pixel touch targets, responsive scrolling, and compact Test/Add variant/Delete icons beside Active/Serve with help labels. Check its current GitHub status before acting.
- Local verification: 130 tests passed, build passed, 55-file release verification passed; browser layout checks covered desktop, tablet portrait/landscape, and phone portrait/landscape. Real-device touch validation remains pending.
- The available checkout was clean before these changes. The original three newline-only modifications were unavailable and were not discarded or included.
- Next: complete the isolated test-only integration review and physical evidence in `PHYSICAL_TEST_RUN.md` and HANDOVER section 9. No physical test has run in this continuation. `FEATURE_FLAGS.robot` remains false; production live wiring and truthful live dispatch counts remain gated.

## Identity and mission

- Product: **Nova Prime**.
- Repository: `shimuranmonk/nova-prime`.
- Mission: unify Nova Trainer's robot/calibration/editor foundation with Nova Plus's Music, MSYNC, statistics, sharing, voice, and parameter model.
- Runtime: one static bundle for hosted HTTPS and device-local phone/tablet loopback HTTP, with portrait and landscape support.
- License: `AGPL-3.0-or-later`.
- Credits must retain nova_fan and olanga of TableTennisDaily plus the recorded community contributors.

## Workflow keyword

**JewelFlow** means:

1. Business Challenge
2. Intent
3. Intent Analysis
4. Product Requirements Document
5. Solution Specification
6. Generated Solution

When the user invokes JewelFlow, follow that sequence unless stages are already approved.

## Current Git state

- Branch: `jewelflow/0.17-trainer-beta9-parity`
- Functional commit: `95e0c69 Integrate Trainer beta.9 drill workflows`
- Branch is pushed to GitHub.
- 0.17 PR: https://github.com/shimuranmonk/nova-prime/pull/27 (check current GitHub status before acting).
- PR #26 (0.16 AGPL) is merged on GitHub.
- Fetch before comparing because the local `origin/main` reference was stale.

Before any edit, run:

```powershell
git status --short
git fetch origin
git log --oneline --decorate -10
```

Do not blindly clean the worktree. These three pre-existing newline-only changes were deliberately excluded from 0.17:

- `src/domain/drills/builtin-catalog.js`
- `src/infrastructure/storage/memory-store.js`
- `test/builtin-drills.test.js`

Inspect and confirm before committing or discarding them.

## Verified baseline

- 130 automated tests passed.
- Build passed.
- Release verification passed with 55 built files.
- Browser smoke test passed for per-level built-in Random/Sequential controls and recovery state.
- Always rebuild before preview; a stale `dist/` was observed once.

Commands:

```powershell
npm test
npm run build
npm run verify
npm run preview
```

## Latest completed increment: 0.17

Integrated from Nova Trainer `0.1.0-beta.9`:

- per-level built-in Random/Sequential preferences;
- single-ball programs forced sequential;
- Reset settings removes built-in playback overrides but cannot damage immutable catalogue data or custom drills;
- session specs/history retain resolved order;
- Add Step inherits the preceding step's first ball;
- inherited Serve becomes normal Height 40;
- Scatter is inherited only from a one-variant preceding step.

Key files:

- `src/application/drills/builtin-preferences.js`
- `src/app/bootstrap.js`
- `src/app/drill-editor.js`
- `src/domain/sessions/schema.js`
- `src/application/sessions/session-controller.js`
- `src/domain/statistics/schema.js`

## Critical safety boundary

Live robot control is **not enabled**.

- `FEATURE_FLAGS.robot` must remain false.
- Production bootstrap does not import the live stack.
- Current Reps/Time/Music/MSYNC sessions are simulation/local-audio only.
- Session history must continue to record zero physical dispatches.
- Do not expose Connect or claim live completion until the physical checklist passes.
- A test suite proves software logic, not physical robot safety.

The packaged foundation already includes authenticated Web Bluetooth, serialized writes, command epochs, stale-queue cancellation, priority Stop, bounded Stop retry, diagnostics, and background/page-hide Stop.

## Locked product decisions

- Trainer-style app interface with selected Plus elements.
- Nova Plus parameter ranges are authoritative.
- Active = enabled step.
- Serve = negative Height; normal toggle values −30/35.
- Serve positions stay fixed in random order.
- Complete graduated table plus Height and Left/Middle/Right placement remain responsive.
- Direct placement fits only Speed and Drop.
- Landscape uses side-by-side space when available; constrained layouts may stack without clipping.
- Hosted HTTPS and device-local loopback HTTP are equal runtime targets.
- Origin must remain stable for browser data; export backup before hostname/port/path changes.
- AGPL source offer and notices stay in every bundle.

## Immediate next actions

Continuation update (2026-11-14): PR #27 is open; the conflict with main's 0.16 status paragraph was resolved retaining both increments. A fresh checkout had no uncommitted changes; the original three newline-only edits are not available here and were not discarded or committed. Local baseline: 130 tests, build, and verification of 55 files passed. Confirm the latest PR CI before merging. Use [PHYSICAL_TEST_RUN.md](PHYSICAL_TEST_RUN.md) for preparation and evidence; no physical checks have run and the gate remains closed. A separate isolated test entry point remains to be implemented and reviewed before hardware testing.

1. Inspect the three newline-only files.
2. Open a PR for `jewelflow/0.17-trainer-beta9-parity` to `main`.
3. Confirm CI and merge.
4. Prepare a narrowly controlled physical-test path; do not generally enable the robot.
5. Execute physical checks in this order:
   - connection/authentication and conservative single ball;
   - priority Stop, queue load, write-in-flight, disconnect;
   - screen lock/background/no auto-resume;
   - known drill, Active, Serve, random order, per-level settings;
   - calibration, visual placement, left/right corner placement;
   - Reps/Time, then Music, then MSYNC, then voice;
   - phone/tablet portrait/landscape, hosted HTTPS, local loopback HTTP.
6. Only after physical gates pass: wire live transport into the canonical session controller, enable the feature flag, and record truthful dispatch counts.
7. Finish migration/UX work and perform release hardening.

## Still unfinished

- Physical Nova S Pro release gate.
- Production live-control wiring.
- Truthful planned/dispatched live history.
- Device wake handling decision.
- Fake monotonic timer/visibility integration tests.
- Long-running live MSYNC drift tests.
- Target-device audio codec matrix.
- Remaining Nova Plus/Trainer migration: settings, statistics, media, playlists, MSYNC, and Trainer records.
- Decision/increment for Trainer beta.9 left-handed built-in mirroring.
- Decision/increment for iPhone CSV text export/import fallback.
- Manual accessibility and full responsive regression after live wiring.
- Update stale implementation-status headers and in-app Roadmap.
- Final release hardening, version bump, archive, release notes, and deployment.

## Physical test rule

Keep immediate access to the robot's physical power control, use conservative settings first, and stop on any ambiguous result. A failure leaves the robot flag off. The detailed categorized checklist is in [HANDOVER.md](HANDOVER.md#9-detailed-physical-test-checklist) and the canonical gate is in [ROBOT.md](ROBOT.md#release-gate).

## Documentation map

- Human handover and backlog: `docs/HANDOVER.md`
- JewelFlow record: `docs/JEWELFLOW.md`
- Product requirements: `docs/PRD.md`
- Architecture: `docs/SOLUTION_SPEC.md`
- Robot and physical gate: `docs/ROBOT.md`
- Full test matrix: `docs/TEST_MATRIX.md`
- Local hosting: `docs/LOCAL_HOSTING.md`
- Drills/editor: `docs/DRILL_CATALOG.md`, `docs/CUSTOM_DRILLS.md`, `docs/INTERACTIVE_EDITOR.md`
- Calibration: `docs/CALIBRATION.md`
- Music/MSYNC: `docs/MUSIC.md`, `docs/MSYNC.md`
- Migration/data: `docs/MIGRATION.md`

## Guardrails for the next conversation

- Do not edit project-mirror files under the outer ChatGPT project's `sources/` directory.
- Preserve user changes in a dirty worktree.
- Do not turn on live Bluetooth merely to make the UI look complete.
- Do not describe simulation as physical execution.
- Do not change the deployed IndexedDB name `nova_ultimate`; it is retained as a compatibility key.
- Do not treat a React port or minification as source-code protection.
- Use feature branches and proportionate tests; rebuild before browser QA.
- Keep documentation and release status synchronized with implementation.
