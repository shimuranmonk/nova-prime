# Nova Ultimate

Nova Ultimate is the unified community platform for controlling and training with the PONGBOT Nova S Pro.

The project combines Nova Trainer's robot control, calibration, physics, visual drill editing, and adaptive feedback with Nova Plus's Music, playlists, MSYNC, statistics, sharing, and future voice control.

## Current status

This branch contains the JewelFlow 0.1 Foundation:

- Native JavaScript ES-module project structure
- Canonical domain schemas and validation
- Canonical session state machine
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
```

Nova Ultimate is designed to run from an HTTP-server application installed on the phone or tablet:

1. Build or download the static `dist/` release bundle.
2. Copy the complete bundle into the mobile server's document directory.
3. Configure a fixed port and serve it through `http://localhost:<port>/` or `http://127.0.0.1:<port>/`.
4. Keep the same hostname, port, and path so browser storage remains accessible.

The server must return JavaScript modules with a JavaScript MIME type. All application assets use relative paths and require no server-side routes.

Web Bluetooth requires a secure context. Chromium treats loopback hosts as trustworthy for powerful web features, but a plain LAN address such as `http://192.168.x.x` may not qualify. Ultimate will detect and explain an incompatible hosting context before live robot controls are enabled.

## Credits

- **nova_fan** of the TableTennisDaily community, creator of Nova Trainer—what we believe is the best application for the Nova S Pro yet.
- **olanga** of the TableTennisDaily community, who pioneered customization of the Nova S Pro and inspired the community to unlock more of the robot's potential.
- **smee**, **plunder**, and the wider Nova S Pro community for protocol research, testing, measurements, and shared knowledge.

## Disclaimer

Nova Ultimate is an unofficial community project and is not affiliated with or endorsed by PONGBOT. Keep the area in front of the robot clear and retain access to physical power controls during operation.

## License

A public software license has not yet been selected. Until one is added, no license is granted beyond rights separately provided by the relevant copyright holders.
