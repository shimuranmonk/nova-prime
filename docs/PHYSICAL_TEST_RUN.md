# Current verification status

## Update — 2026-11-22 · browser audio startup correction

Version `0.19.3-audio-timers.0`, branch `fix/browser-audio-timers`, starts from main `d23389e`. Hosted v0.19.2 MSYNC stayed at 0:00/COUNTDOWN for more than 10 seconds without sound. Reproduced with the matching supplied MP3 in the full production browser bootstrap: native timer functions were called with AudioPlayer as receiver, causing Illegal invocation in watchdog cancellation and again in error cleanup. Bind both timer callbacks to globalThis. Keep the five-second watchdog and Stop protections.

Live MSYNC now becomes RUNNING only after confirmed audio playback; pending startup shows STARTING AUDIO and remains cancellable. 212 automated tests pass, including browser-style receiver enforcement and delayed/zero-countdown lifecycle cases. The 67-file production verifier passes. Real browser playback with the matching MP3 and an isolated startup timeline advanced through its INLINE cue and completed at STOP; blocked and indefinitely pending playback reached ERROR with Done usable, and a subsequent normal run completed. No console warnings/errors. Bluetooth was simulated; no hardware operated. The original full EOT timeline still needs physical retesting. Test-only audio failure controls are excluded from production.

User reports the v0.19.2 three-ball retest fired three balls and Done returned from the completed screen; later idle Bluetooth disconnect was acceptable. Automatic return to the Training dashboard remains a discussion item, not implemented here. IndexedDB schema, stored IDs, robot feature flags and partial physical gate status remain unchanged. Calibration/MSYNC hardware verification remains PENDING; this fix is software evidence only. Preserve the original dirty worktree.

## Update — 2026-11-21 · three-ball completion correction

Version `0.19.2-session-completion.0`, branch `fix/session-completion-refresh`, starts from main `504df78`. Android checkpoint 4 reported three Push FH balls fired, but screen stayed RUNNING at 3/3 with Done disabled. Pause caused a refresh, after which Done exited; disconnect happened later (duration unmeasured). Checkpoints 1–3 on v0.19.1 passed; checkpoint 4 remains FAIL until retested.

Reproduced defects: terminal state changes stopped the clock before a final render, estimated-duration admission discarded early valid DONE, and statistics persistence was awaited before controller completion. The correction observes terminal state/history-warning changes, bypasses library I/O for focused session rendering, rejects stale overlapping renders, accepts DONE based on active command phase rather than elapsed estimates, and completes after Stop before asynchronous statistics saving. History-write failures are caught and shown as storage warnings. Live repetition progress is labeled Estimated until completion. Notifications during Pause/Stop/unaccepted writes remain excluded; the firmware marker has no established per-run sequence ID, so delayed post-resume markers remain a physical verification limitation.

209 automated tests passed; the 67-file build/module verification passed. Full production bootstrap/browser screen was exercised with a loopback-only simulated Bluetooth entry: three-ball Push FH reached COMPLETED with Done enabled automatically, Done returned to setup, and both rejected and indefinitely pending statistics writes preserved completion/Done. No console errors or physical robot commands. Test fixture files stay outside the shipped bundle. IndexedDB schema and robot feature flags are unchanged. Physical checkpoint 4 and other hardware checks remain pending.


User clarification: Calibration and MSYNC have not been tested. All other required checks passed. Second-round testing will commence after Calibration and MSYNC pass. The user authorizes updating main for ongoing beta testing; the complete physical release gate remains partial. Earlier aggregate complete-pass statements below are historical and superseded.

# Physical verification run sheet

Status: **LIVE TRAINING BETA — Calibration and MSYNC PENDING; remaining checks user-reported PASS**.

The maintainer explicitly confirmed that the complete documented physical release gate passed. This is recorded as the user's aggregate result; per-check logs, device matrix, firmware versions, and individual tester records were not supplied here, so this entry does not claim independent observation of each run. Production control is now enabled in the reviewed production candidate.

This sheet records physical validation and the release decision. The 2026-11-20 gate pass is user-reported; automated checks and simulated history alone cannot pass a physical check.

## Prerequisites and isolation

- A tester must be present with the Nova S Pro, a clear launch area, and immediate physical power access.
- Record the exact commit and static bundle identity, date, tester, firmware if known, device, OS, browser/version, origin, and orientation before testing.
- The separate one-ball test entry point is `physical-test.html`, built only by `npm run build:physical-test` into `dist-physical-test/`. It is excluded from the production bundle and deployment. Do not substitute a production flag change, URL switch, or automatic connection.
- That entry point must use the existing transport, connection, executor, diagnostics, and lifecycle monitor; no direct packet writes or second command queue.
- Require deliberate connection and explicit confirmation before each conservative command. Initially allow only one normal ball, no repeat loop, Music, MSYNC, voice, or automatic resume. Keep Stop reachable throughout authentication and delivery.
- Use `nova-prime-<version>-physical-test.zip` only after its code review and verification pass. Extract it into a separate local-server document root, preferably a dedicated loopback port such as `8081`; never mix it with the production bundle. Connect opens the browser device chooser only after both safety checks are ticked. The only shot action is a manually confirmed one-ball command with fixed conservative parameters.
- Prove queued/in-flight Stop ordering, disconnect recovery, background Stop, and no foreground resume with fake devices before any operator uses that entry point. Reuse the canonical controller for subsequent session-mode checks.
- Record each result as NOT RUN, PASS, FAIL, or AMBIGUOUS. Stop at FAIL or AMBIGUOUS, use physical power if needed, and retain bounded redacted diagnostics. A completed Bluetooth write is not evidence of physical ball delivery.

## Ordered checkpoints

Follow the full checklist in [HANDOVER.md section 9](HANDOVER.md#9-detailed-physical-test-checklist); these checkpoints define the execution order, not a reduced release gate.

| Stage | Required evidence | Result |
| --- | --- | --- |
| 1 | Safety preparation, deliberate connection/authentication, recovery, one conservative normal ball | PASS — user-reported complete gate |
| 2 | Priority/repeated Stop, queued load, write in flight, unexpected disconnect | PASS — user-reported complete gate |
| 3 | Screen lock, background/pagehide, foreground without automatic resume | PASS — user-reported complete gate |
| 4 | Known drill, Active, Serve, fixed Serve random positions, independent per-level order and reset | PASS — user-reported complete gate |
| 5 | Calibration, visual placement, left/middle/right and unreachable targets | PASS — user-reported complete gate |
| 6 | Canonical Reps/Time lifecycle and truthful observed delivery evidence | PASS — user-reported complete gate |
| 7 | Music, then MSYNC transitions/drift, then touch-confirmed voice | PASS — user-reported complete gate |
| 8 | Supported devices, portrait/landscape, hosted HTTPS and loopback HTTP; persistence/recovery | PASS — user-reported complete gate |

The earlier isolated package was limited to Stage 1 connection and one conservative single-ball check. It remains an archival test artifact and is not the production release.

## User-reported first physical-test run — 2026-11-19

| Check | Result | Reported observation |
| --- | --- | --- |
| Safety preparation | PASS | Tester previously confirmed clear launch area, physical power access, conservative settings, visible Stop, no optional/background activity, and emergency-stop plan. |
| Connect and authenticate | PASS | Nova S Pro connected sufficiently to accept the test command. |
| Single conservative ball | PASS | Android test build caused exactly one ball to launch. |
| Stop and safe disconnect | PASS | Robot stopped physically; safe disconnect completed normally. |
| Reconnect | PASS | Reconnect/authentication and safe disconnect succeeded without another ball. |
| Unexpected power-off recovery | PASS | App reported disconnect; reconnect worked after power returned, with no ball launched. |
| Login-timeout recovery | PASS | Timeout was reported; reconnect worked after power returned, with no ball launched. |
| Browser chooser cancellation, initial build | FAIL | User reports the app did not recover cleanly after canceling the device chooser. |
| Browser chooser cancellation, chooser-recovery build | PASS | User reports Connect became available again after canceling the chooser. |
| Repeated priority Stop while idle | PASS | User reports both Stop actions completed; robot remained stationary and app stayed connected. |
| Stop after confirming one-ball command | PASS — user-reported physical outcome | User reports confirming the one-ball action, pressing Stop, one ball firing, then robot stationary with no repeated firing. The one-ball control disables after its single permitted command per connection. This checks the single-shot physical outcome; it does not verify Stop ordering under a multi-command queue. |

Diagnosis: Web Bluetooth chooser cancellation rejects with `NotFoundError`. The connection code previously left its state at `connecting`, disabling Connect. The app now cleans up to disconnected and gives a cancellation-specific message; automated regression coverage passes. User reports the chooser-cancel retest on the recovery build passed, with Connect available again. A new isolated artifact is `nova-prime-0.17.0-android-package.0-chooser-recovery-physical-test.zip`. Results above are user-reported, not independently witnessed. Device, exact test-build origin/orientation, robot firmware, and captured diagnostic/run record still need confirmation. Stage 1 is reported PASS. Stage 2 is partial: repeated idle Stop and Stop after confirming one ball passed without repeat; the multi-command queued-load/Stop-order check remains, along with detailed confirmation of exact in-flight write ordering. The earlier unexpected power-off recovery passed. Stages 3–8 and remaining detailed Section 9 checks are NOT RUN. Production robot control stays disabled.

## Per-check evidence template

Copy this record for every check and device/origin combination:

```text
Run ID / checklist item:
Commit / bundle identity:
Date / tester:
Robot / firmware (no Bluetooth identifier):
Device / OS / browser version:
Origin / orientation:
Preconditions and exact conservative parameters:
Expected behavior:
Observed physical behavior:
Stop / disconnect outcome:
Result: NOT RUN
Redacted diagnostic evidence / issue:
```

## Release decision

The maintainer explicitly reports the complete gate passed on 2026-11-20. Production robot control is enabled in this release candidate, with the regular Prime connection controls and no physical-test preflight checkboxes or extra per-session confirmation. The report is accepted as the gate result; detailed per-device records can still be added to the template above for future traceability.
# Full-feature parallel test build — 2026-11-19

The separate test-only build for the current three-robot test team is `nova-prime-0.17.0-android-package.0-full-physical-test-ready2.zip`. Extract the ZIP into each tester's local HTTP server document root and open `http://127.0.0.1:8080/` (or the tester's fixed device-local loopback port). Each tester must use their own Nova S Pro. This package loads the normal Prime application plus an isolated live-control module; it is not the production distribution.

Before Connect, each tester must check the on-screen area-clear and physical-power-access items. Connect authenticates but sends no ball. Each training start then asks for a separate confirmation. The full build can physically run Reps, Time (up to 255 seconds per command), Music, and validated MSYNC DRILL/INLINE/FLAVOR/REST/IDLE/STOP cues. Keep the priority Stop visible and report the phone model, Android/browser versions, origin, orientation, robot firmware if known, session mode, and result.

Pause sends robot Stop. Resume sends the remaining configured command; if a ball cycle was interrupted, it may repeat part of that cycle, so first confirm the machine is stationary and the launch area remains clear. Time sessions longer than 255 seconds must be split into shorter sessions. Calibration is observation-based in this build; automated calibration shots are not connected to the robot. Do not treat a successful packet write as proof that every ball physically fired or landed. MSYNC lead-time/drift, queue-load Stop ordering, Pause/Resume behavior, calibration shot automation, and full physical mode coverage remain unverified. Stop on any ambiguous result. Production `main` remains gated until physical evidence is reviewed and the release gate is explicitly passed.
