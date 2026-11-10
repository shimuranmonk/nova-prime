# Voice controls

## JewelFlow

1. **Business challenge** — Players need hands-light session control while remaining able to stop immediately and fall back to touch.
2. **Intent** — Add optional, predictable voice shortcuts without creating a second session engine or an unattended start path.
3. **Intent analysis** — Browser speech recognition is capability- and provider-dependent. It may require network processing, can misunderstand speech, and must never be the only safety control.
4. **Product requirements** — Voice is off by default, listens for one command only after a press, accepts a small exact grammar at confidence 0.65 or higher, stores no audio or transcript history, confirms Start by touch, and preserves all touch controls.
5. **Solution specification** — `VoiceController` adapts `SpeechRecognition`/`webkitSpeechRecognition`; the pure command interpreter produces canonical `start`, `pause`, `resume`, or `stop` intents. Pause, resume, and stop use the same session command path as touch. A recognized start creates only a pending confirmation.
6. **Generated solution** — `0.5.0-voice.0` adds the responsive Training card, privacy disclosure, safe error states, capability gating, exact-command parsing, and automated tests. It does not enable Bluetooth or live robot commands.

## Exact command grammar

- Start: “Nova start” or “Nova begin” — always requires a touch confirmation.
- Pause: “Nova pause” or “Nova rest”.
- Resume: “Nova resume” or “Nova continue”.
- Stop: “Stop”, “Emergency stop”, “Nova stop”, or “Nova emergency stop”.

Unknown and low-confidence speech changes nothing. Voice is an optional convenience; the visible Stop button and the robot's physical power controls remain primary safety paths.

## Privacy and compatibility

Nova Prime does not save audio, recognized transcripts, or a voice history. The browser or its configured speech provider may process speech online, so voice may not work in offline mobile-server mode. Unsupported browsers show voice as unavailable without affecting any other feature.
