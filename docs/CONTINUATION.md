# Nova Prime continuation memory

> Start here in a new Codex conversation. Then read [HANDOVER.md](HANDOVER.md), [ROBOT.md](ROBOT.md), and [TEST_MATRIX.md](TEST_MATRIX.md). This file is deliberately concise and operational.

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
- 0.17 PR was not yet created when this file was drafted.
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
