# Physical verification run sheet

Status: **NOT RUN — production release gate CLOSED**.

This sheet prepares the next physical-test session; it does not authorize or implement Bluetooth access. `FEATURE_FLAGS.robot` stays false and production bootstrap stays isolated from the live stack. Automated checks and simulated history cannot pass a physical check.

## Prerequisites and isolation

- A tester must be present with the Nova S Pro, a clear launch area, and immediate physical power access.
- Record the exact commit and static bundle identity, date, tester, firmware if known, device, OS, browser/version, origin, and orientation before testing.
- A separate test-only entry point still needs implementation and review. It must be excluded from the production bundle and deployment. Do not substitute a production flag change, URL switch, or automatic connection.
- That entry point must use the existing transport, connection, executor, diagnostics, and lifecycle monitor; no direct packet writes or second command queue.
- Require deliberate connection and explicit confirmation before each conservative command. Initially allow only one normal ball, no repeat loop, Music, MSYNC, voice, or automatic resume. Keep Stop reachable throughout authentication and delivery.
- Prove queued/in-flight Stop ordering, disconnect recovery, background Stop, and no foreground resume with fake devices before any operator uses that entry point. Reuse the canonical controller for subsequent session-mode checks.
- Record each result as NOT RUN, PASS, FAIL, or AMBIGUOUS. Stop at FAIL or AMBIGUOUS, use physical power if needed, and retain bounded redacted diagnostics. A completed Bluetooth write is not evidence of physical ball delivery.

## Ordered checkpoints

Follow the full checklist in [HANDOVER.md section 9](HANDOVER.md#9-detailed-physical-test-checklist); these checkpoints define the execution order, not a reduced release gate.

| Stage | Required evidence | Result |
| --- | --- | --- |
| 1 | Safety preparation, deliberate connection/authentication, recovery, one conservative normal ball | NOT RUN |
| 2 | Priority/repeated Stop, queued load, write in flight, unexpected disconnect | NOT RUN |
| 3 | Screen lock, background/pagehide, foreground without automatic resume | NOT RUN |
| 4 | Known drill, Active, Serve, fixed Serve random positions, independent per-level order and reset | NOT RUN |
| 5 | Calibration, visual placement, left/middle/right and unreachable targets | NOT RUN |
| 6 | Canonical Reps/Time lifecycle and truthful observed delivery evidence | NOT RUN |
| 7 | Music, then MSYNC transitions/drift, then touch-confirmed voice | NOT RUN |
| 8 | Supported devices, portrait/landscape, hosted HTTPS and loopback HTTP; persistence/recovery | NOT RUN |

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

The canonical gate remains [ROBOT.md](ROBOT.md#release-gate). Every required check must have explicit passing real-device evidence and maintainer sign-off identifying the tested commit and supported matrix. Missing, failed, or ambiguous evidence keeps the gate closed. Production wiring and truthful dispatch accounting are a subsequent reviewed increment after that sign-off; this sheet never enables them.
