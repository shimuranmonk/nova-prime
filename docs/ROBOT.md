# Robot control foundation

## JewelFlow

1. **Business challenge** — Nova Prime needs live Nova S Pro control without allowing stale, concurrent, or guessed commands to bypass Stop.
2. **Intent** — Build and verify the complete transport boundary before exposing a Connect button or counting any physical ball.
3. **Intent analysis** — Web Bluetooth requires a compatible browser, a trustworthy origin, a user gesture, permission, successful GATT discovery, authenticated login, and physical validation. A unit-tested packet is not proof of safe physical behavior.
4. **Product requirements** — Use one transport and one executor; authenticate with a bounded timeout; serialize writes; cancel stale queued commands by epoch; make Stop the next write after any in-flight write; retry only the idempotent Stop packet; disconnect on failed login; and keep the feature flag off until the physical checklist passes.
5. **Solution specification** — `WebBluetoothTransport` owns device selection, GATT service/characteristics, notifications, timeouts, serialization, and disconnect. `NovaRobotConnection` owns the four-stage challenge-response handshake and completion notifications. `RobotExecutor` owns command epochs, start/queue/pause/resume/stop, bounded Stop retry, and stale-work cancellation. `nova-protocol.js` owns the verified profile and packet encoding.
6. **Generated solution** — `0.6.0-robot-foundation.0` packages the initial stack and fake-device/protocol tests. `0.12.0-robot-readiness.0` adds bounded timestamped diagnostics and a lifecycle safety monitor that requests priority Stop when an active session is backgrounded or the page is hidden. Returning to the app never resumes automatically. Production bootstrap does not import the robot stack, the `robot` feature flag remains `false`, and the UI Connect control remains disabled.

## Diagnostics and lifecycle safety

`RobotDiagnostics` keeps a bounded in-memory sequence of timestamped connection, executor, and lifecycle events. It records state and error codes, not packet contents, drill data, or Bluetooth identifiers. Diagnostic failures are isolated so they cannot interfere with Stop, disconnect, or command delivery.

`RobotSafetyMonitor` observes `visibilitychange` and `pagehide` only while explicitly armed. If an executor is active, one priority Stop is requested and duplicate lifecycle events share that pending operation. Foreground return is recorded but never restarts a session. Physical screen-lock and browser-background behavior still requires the release-gate checks below.

## Protocol provenance

The protocol facts were independently implemented from the public `olanga/nova` repository at commit `913f044d664b81dcb77c9e9d6e9ae5b33103f3ca`, specifically `js/constants.js`, `js/bluetooth.js`, and `js/runner.js`, plus the supplied community “General information” reference. The implementation records the immutable source identity in `NOVA_PROTOCOL_SOURCE` and does not copy the source application's UI or architecture.

Verified facts include the advertised service and GATT UUIDs, handshake packets and salt-derived MD5 response, ready and Stop packets, completion marker, seven-byte drill header, 24-byte little-endian ball payload, and motor-speed conversion.

## Release gate

Do not change `FEATURE_FLAGS.robot` to `true` until all checks below pass on a real Nova S Pro in a clear test area:

- Connect, reconnect, login timeout, and unexpected disconnect.
- One conservative single ball, then one short known drill.
- Zero-pause repetition, Pause, Resume, and repeated Stop.
- Stop while multiple commands are queued and while a write is in flight.
- Screen lock/return and browser background/foreground behavior.
- Calibration/corner placement, Music completion, and MSYNC transitions.
- Phone/tablet portrait and landscape, hosted HTTPS, and supported local-server origin.

Keep physical power access unobstructed throughout every test. A failed or ambiguous check keeps the production flag off.
