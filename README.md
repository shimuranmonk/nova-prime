# Nova Ultimate

Nova Ultimate is the unified community platform for controlling and training with the PONGBOT Nova S Pro.

The project combines Nova Trainer's robot control, calibration, physics, visual drill editing, and adaptive feedback with Nova Plus's Music, playlists, MSYNC, statistics, sharing, and future voice control.

## Current status

This branch advances the JewelFlow 0.1 Foundation with local sessions and recovery:

- Native JavaScript ES-module project structure
- Canonical domain schemas and validation
- Canonical session state machine
- IndexedDB persistence with a clearly reported in-memory fallback
- Reps and Time dry-run sessions with countdown, Pause, Resume, Stop, and completion
- Trainer-first application dashboard with selected Nova Plus training controls
- Compact connection, calibration, session, built-in drill, and custom drill cards
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

Reps and Time are simulation-only in this increment. They exercise the same canonical lifecycle intended for future robot sessions, but record zero dispatched balls and cannot access Bluetooth. Live robot control remains blocked until the executor, queue cancellation, priority Stop path, and physical-device verification are complete.

Browser data is scoped to the complete origin. Keep the same protocol, hostname, port, and path, and export a backup before changing a hosted or device-local address.

The approved interface direction is recorded in [`docs/UI_DIRECTION.md`](docs/UI_DIRECTION.md). Unimplemented controls remain visibly disabled and are not counted as integrated features.

Nova Ultimate supports two complete runtime modes:

- **Hosted web:** open the HTTPS deployment normally whenever internet access is available.
- **Device-local server:** run the same static bundle from an HTTP-server application installed on the phone or tablet when internet or Wi-Fi is unavailable.

For device-local operation:

1. Build or download the static `dist/` release bundle.
2. Copy the complete bundle into the mobile server's document directory.
3. Configure a fixed port and serve it through `http://localhost:<port>/` or `http://127.0.0.1:<port>/`.
4. Keep the same hostname, port, and path so browser storage remains accessible.

The server must return JavaScript modules with a JavaScript MIME type. All application assets use relative paths and require no server-side routes.

Web Bluetooth requires a secure context. Hosted mode uses HTTPS. Chromium treats loopback hosts as trustworthy for powerful web features, but a plain LAN address such as `http://192.168.x.x` may not qualify. Ultimate will detect and explain an incompatible hosting context before live robot controls are enabled.

The locally served application does not require an upstream internet or Wi-Fi connection; the browser and server operate on the same device through loopback.

## Credits

- **nova_fan** of the TableTennisDaily community, creator of Nova Trainer—what we believe is the best application for the Nova S Pro yet.
- **olanga** of the TableTennisDaily community, who pioneered customization of the Nova S Pro and inspired the community to unlock more of the robot's potential.
- **smee**, **plunder**, and the wider Nova S Pro community for protocol research, testing, measurements, and shared knowledge.

## Disclaimer

Nova Ultimate is an unofficial community project and is not affiliated with or endorsed by PONGBOT. Keep the area in front of the robot clear and retain access to physical power controls during operation.

## License

A public software license has not yet been selected. Until one is added, no license is granted beyond rights separately provided by the relevant copyright holders.

