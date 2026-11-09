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

Open `dist/index.html` through a local web server after building. Web Bluetooth requires a secure context when live robot support is added.

## Credits

- **nova_fan** of the TableTennisDaily community, creator of Nova Trainer—what we believe is the best application for the Nova S Pro yet.
- **olanga** of the TableTennisDaily community, who pioneered customization of the Nova S Pro and inspired the community to unlock more of the robot's potential.
- **smee**, **plunder**, and the wider Nova S Pro community for protocol research, testing, measurements, and shared knowledge.

## Disclaimer

Nova Ultimate is an unofficial community project and is not affiliated with or endorsed by PONGBOT. Keep the area in front of the robot clear and retain access to physical power controls during operation.

## License

A public software license has not yet been selected. Until one is added, no license is granted beyond rights separately provided by the relevant copyright holders.
