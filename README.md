# Nova Prime

Nova Prime is the unified community platform for controlling and training with the PONGBOT Nova S Pro.

The project combines Nova Trainer's robot control, calibration, physics, visual drill editing, and adaptive feedback with Nova Plus's Music, playlists, MSYNC, statistics, sharing, and future voice control.

**Live application:** [shimuranmonk.github.io/nova-prime](https://shimuranmonk.github.io/nova-prime/)

**Repository:** [github.com/shimuranmonk/nova-prime](https://github.com/shimuranmonk/nova-prime)

## Current status

This branch advances Nova Prime through JewelFlow 0.3 MSYNC, retaining Foundation and Music while adding validated synchronized timeline simulation:

- Native JavaScript ES-module project structure
- Canonical domain schemas and validation
- Canonical session state machine
- IndexedDB persistence with a clearly reported in-memory fallback
- Reps and Time dry-run sessions with countdown, Pause, Resume, Stop, and completion
- Trainer-first application dashboard with selected Nova Plus training controls
- Compact connection, calibration, session, built-in drill, and custom drill cards
- Verified 34-drill Nova Trainer catalogue with Basic, Combined, Complex, random, and three-level programs
- Persistent custom drills in Groups A/B/C with create, rename, duplicate, move, reorder, delete, select, and simulation support
- Atomic versioned custom-drill JSON import and export, with a 100-drill limit per group
- Visual Levels 1–3 editor with up to 20 ordered steps, multiple balls per step, enable/scatter controls, and random or sequential playback
- Uncalibrated table preview for speed, spin, type, height, direction, tempo, and repetitions
- Standard and Complete guided calibration with manual landing observations, Undo, local profiles, import/export, and Quick Check
- Calibrated placement offsets applied to visual drill previews without enabling robot commands
- Local audio import with SHA-256 duplicate detection, rename/delete, duration, and size details
- Reusable playlists with ordered tracks plus ad-hoc Quick Music queues
- Music sessions with playback progress, automatic completion, Pause, Resume, Stop, recoverable errors, and history
- Frozen MSYNC v1 parser and strict validation with stable line, section, and error details
- Atomic MSYNC-to-audio attachment with SHA-256 identity, duration, and drill-resolution checks
- Pre-start revalidation plus synchronized DRILL, INLINE, FLAVOR, REST, IDLE, and STOP simulation
- Adjustable Robot Lead planning that is explicitly diagnostic and never transmitted to a robot
- Versioned backup and restore that preserves playable local audio
- Dedicated phone, tablet portrait, tablet landscape, and desktop layouts from one static bundle
- Application drawer for Data, About, Diagnostics, and Roadmap
- Persistent simulation history that never claims physical ball dispatch
- Versioned JSON backup with complete pre-restore validation
- Static build and verification tooling
- Automated unit tests and CI scaffolding
- Approved PRD, solution specification, migration plan, and test matrix

Live Bluetooth robot control is deliberately not enabled in this milestone. Robot behavior will be introduced only after the executor, priority Stop path, and safety contracts are implemented and tested.

## Development

Requirements: Node.js 20 or newer.

```bash
npm test
npm run build
npm run verify
npm run preview
```

`npm run preview` serves the built bundle at `http://127.0.0.1:4173/` for loopback testing.

## Current safety boundary

Reps, Time, Music, and MSYNC exercise the same canonical lifecycle and record zero dispatched balls. Music controls local browser audio; MSYNC adds timeline simulation only. None of these modes can access Bluetooth. Live robot control remains blocked until the executor, queue cancellation, priority Stop path, and physical-device verification are complete.

Browser data is scoped to the complete origin. Keep the same protocol, hostname, port, and path, and export a backup before changing a hosted or device-local address.

The approved interface direction is recorded in [`docs/UI_DIRECTION.md`](docs/UI_DIRECTION.md), guided calibration in [`docs/CALIBRATION.md`](docs/CALIBRATION.md), Music in [`docs/MUSIC.md`](docs/MUSIC.md), MSYNC in [`docs/MSYNC.md`](docs/MSYNC.md), built-in drill provenance in [`docs/DRILL_CATALOG.md`](docs/DRILL_CATALOG.md), and custom-drill behavior in [`docs/CUSTOM_DRILLS.md`](docs/CUSTOM_DRILLS.md). Unimplemented controls remain visibly disabled and are not counted as integrated features.

Nova Prime supports two complete runtime modes:

- **Hosted web:** open the HTTPS deployment normally whenever internet access is available.
- **Device-local server:** run the same static bundle from an HTTP-server application installed on the phone or tablet when internet or Wi-Fi is unavailable.

For device-local operation:

1. Build or download the static `dist/` release bundle.
2. Copy the complete bundle into the mobile server's document directory.
3. Configure a fixed port and serve it through `http://localhost:<port>/` or `http://127.0.0.1:<port>/`.
4. Keep the same hostname, port, and path so browser storage remains accessible.

The server must return JavaScript modules with a JavaScript MIME type. All application assets use relative paths and require no server-side routes.

Web Bluetooth requires a secure context. Hosted mode uses HTTPS. Chromium treats loopback hosts as trustworthy for powerful web features, but a plain LAN address such as `http://192.168.x.x` may not qualify. Prime will detect and explain an incompatible hosting context before live robot controls are enabled.

The locally served application does not require an upstream internet or Wi-Fi connection; the browser and server operate on the same device through loopback.

## Credits

- **nova_fan** of the TableTennisDaily community, creator of Nova Trainer—what we believe is the best application for the Nova S Pro yet.
- **olanga** of the TableTennisDaily community, who pioneered customization of the Nova S Pro and inspired the community to unlock more of the robot's potential.
- **smee**, **plunder**, and the wider Nova S Pro community for protocol research, testing, measurements, and shared knowledge.

## Disclaimer

Nova Prime is an unofficial community project and is not affiliated with or endorsed by PONGBOT. Keep the area in front of the robot clear and retain access to physical power controls during operation.

## License

A public software license has not yet been selected. Until one is added, no license is granted beyond rights separately provided by the relevant copyright holders.
