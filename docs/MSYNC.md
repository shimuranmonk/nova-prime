# MSYNC v1

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
