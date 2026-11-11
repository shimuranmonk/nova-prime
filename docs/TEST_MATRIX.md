# Nova Prime Test Matrix

## Automated foundation checks

- Canonical drill creation and validation
- Ball ranges and drop/scatter envelope
- Session happy path
- Priority and idempotent Stop
- Explicit Pause and Resume
- Mode-specific session validation
- Calibration, Track, Playlist, MSYNC, and statistics schemas
- Robot feature flag remains disabled
- Build allows `requestDevice` only inside the unimported gated transport
- Static bundle rejects root-relative assets and missing/non-relative module imports
- Device-local subdirectory server redirect, path isolation, traversal containment, JavaScript/JSON MIME types, and `nosniff` behavior
- Reps and Time dry-run countdown, completion, Pause, Resume, and priority Stop
- Simulation records always report zero physically dispatched balls
- Memory-store isolation and persistent-store browser smoke test
- Versioned backup round trip and rejection of invalid, missing, or unknown collections
- IndexedDB blocked upgrade, synchronous and asynchronous quota failure, explicit abort, no partial multi-store replacement, and completion-before-success behavior
- Trainer-first dashboard loads as the default route
- Drawer exposes secondary screens and becomes inert when closed
- Mode, level, amount, countdown, and pause controls remain locked during active sessions
- Configured Reps and Time rests advance deterministically
- Built-in catalogue contains exactly 6 Basic, 12 Combined, and 16 Complex drills
- All 34 drills have unique stable IDs and validate at levels 1–3
- Representative ball parameters match the authoritative Trainer source
- Sequence order, random flags, UI selection, and session-history drill linkage
- Custom drill immutable IDs, sanitized unique names, and Groups A/B/C persistence
- Duplicate drill and step identity regeneration
- Reorder and post-delete order compaction
- Atomic custom-drill import rejection and versioned JSON round trip
- 100-drill capacity enforcement for every custom group
- Visual editor atomic save and invalid-save rollback
- Player-half coordinate orientation and reversible percent/centimetre mapping
- Direct placement preservation of Height, Spin, type, BPM, and Reps
- Speed/Drop fitting, scatter-constrained Drop, dynamic Speed/Spin limits, closest-target feedback, pointer drag/tap, and keyboard placement
- Active-step filtering, negative-Height Serve detection, robot-side first-bounce preview, serve-aware random order, and extended CSV preservation
- 20-step program limit, ordered steps, multiple ball variants, and Levels 1–3 persistence
- Deterministic uncalibrated physics preview with bounded table markers
- Standard and Complete calibration plan coverage
- Calibration response model, backward-compatible offsets, accuracy, scatter, validation, atomic import/export, and Quick Check calculations
- Calibrated parameter responses applied only to successful visual landing estimates
- Phone-sized create, rename, duplicate, group move, reorder, selection, simulated completion, history naming, export, and fresh-tab persistence smoke test
- Phone/tablet visual-editor create, reorder, parameter edit, level copy, save, cancel, and reopen smoke test
- Phone portrait guided calibration, five observations, save, Quick Check suggestions, and calibrated-editor smoke test
- Audio content-identity deduplication, metadata validation, and missing-audio recovery
- Playlist create, rename, ordering, add/remove, delete protection, and resolution
- Quick Music selection and canonical Music session lifecycle
- Fake audio Pause, Resume, automatic advancement, completion, error, and Stop
- Playable audio Blob backup and validated restore
- Phone, tablet portrait, and tablet landscape Music-library and Music-session smoke tests
- Frozen MSYNC v1 parsing and exact audio filename, SHA-256, and duration validation
- Rejection without mutation for invalid format, casing, ranges, drill references, cues, and STOP rules
- Atomic attachment replacement, source fingerprint, backup compatibility, and pre-start revalidation
- DRILL, INLINE, FLAVOR, REST, IDLE, STOP, Robot Lead, Pause, Resume, completion, and priority Stop simulation
- MSYNC session history records zero physically dispatched balls
- Statistics period filtering, totals, duration, cycles, completion rate, active days, and current streak
- Mode share, drill ranking, invalid/future timestamp rejection, and source-record immutability
- Explainable baseline, low-completion, mode-diversity, inactivity, progress, and calibration guidance rules
- Legacy session-record validation plus optional level, target, and pause planning fields
- Phone, tablet portrait, tablet landscape, and desktop Statistics layout smoke tests
- Versioned sharing envelope, title/note sanitization, drill count, and package-size limits
- Voice transcript normalization, exact grammar, confidence threshold, one-shot recognition, rejection, microphone denial, cancellation, and unavailable-browser behavior
- Bounded immutable robot diagnostics, monotonic event sequencing, visibility/page-hide priority Stop, duplicate-event suppression, listener cleanup, and no automatic foreground resume
- Rejection of unsupported versions, duplicate identities, built-in drills, and unsafe ball parameters
- Non-mutating incoming preview and atomic import failure with existing data preserved
- Explicit native-share adapter invocation with exactly one generated JSON file
- Phone, tablet portrait, tablet landscape, and desktop Sharing layout smoke tests
- RFC MD5 vectors, verified handshake response, motor conversion, drill header, and completion marker
- Fake Web Bluetooth profile discovery, notifications, serialized writes, and disconnect
- Fake authenticated login success and timeout failure
- Executor stale-queue cancellation, priority Stop ordering, and bounded idempotent Stop retry
- Nova Plus CSV built-in exclusion, variant grouping, and Levels 1–3 transformation
- Read-only preview, strict row rejection, atomic drill-and-receipt commit, duplicate receipt blocking, capacity failure, and simulated transaction failure

## Future integration checks

- Fake monotonic timers and visibility changes
- Browser-specific codec and quota failure fixtures
- Long-running cue drift across live-executor queue boundaries
- Legacy Trainer and remaining Nova Plus settings, statistics, and media migration fixtures

## Required physical robot checks before live release

- Connect, reconnect, and login timeout
- Single-ball test and complete drill
- Zero-pause repetitions
- Pause, resume, and priority Stop
- Stop under queued load
- Screen lock and return
- Calibration and corner placement
- Music completion
- MSYNC cue transitions

## Target device classes

- Current Chrome and Edge on supported desktop platforms
- Compatible Chromium browser on Android
- Bluefy on supported iPhone and iPad workflows
- Phone, tablet, and desktop layouts in portrait and landscape
- Tablet portrait at 768 × 1024 and tablet landscape at 1024 × 768
- Visual editor retains an outer margin, complete table, Height control, and horizontal-overflow-free layout at desktop, tablet, phone, and low-height landscape breakpoints

## Mobile HTTP-server checks

- Complete release bundle served from an installed phone/tablet HTTP server
- `http://localhost:<fixed-port>/`
- `http://127.0.0.1:<fixed-port>/`
- Application installed in a server subdirectory
- JavaScript module MIME type verification
- Stable storage across server restarts on the same origin
- Warning and disabled live controls for non-loopback plain HTTP
- Backup/restore after deliberate hostname or port change

## Hosted-web checks

- Production HTTPS deployment
- Web Bluetooth availability and user-gesture requirement
- Repository-relative asset loading
- Persistent storage across ordinary reloads and application updates
- Export/import between hosted and device-local origins
