# Nova Prime Statistics — JewelFlow increment

## 1. Business challenge

Nova Prime records local sessions, but raw history does not quickly answer whether training is consistent, balanced across modes, or ready for a small plan adjustment. A hosted analytics service would conflict with local-first and offline use.

## 2. Intent

Turn device-local session history into understandable activity summaries and conservative, explainable plan guidance that works on the hosted web build and the same bundle served from a phone or tablet HTTP server.

## 3. Intent analysis

- Statistics describe recorded app activity, not player skill or physical robot performance.
- Simulation records cannot prove that a ball was delivered.
- No account, network request, cloud upload, or third-party chart dependency is required.
- Old session records and backups remain valid when new optional planning fields are absent.
- Period selection must be useful on phones, tablets, landscape layouts, and desktop screens.
- Every recommendation must expose the observation and suggested action rather than hide a score in an opaque model.

## 4. Product requirements

- Provide 7-day, 30-day, and all-time periods.
- Show sessions, recorded time, completed cycles, completion rate, active days, and current streak.
- Show a 14-active-day trend, mode mix, and the five most-used drills.
- Offer no more than three deterministic plan suggestions at once.
- Suggest a baseline for no data, a gentler target for low completion, mode variety for strong concentration, a short return session after inactivity, a single-variable increase after sustained completion, and calibration checks when applicable.
- Keep all processing and data on the current device.
- State the simulation and non-skill-scoring boundary in the interface.

## 5. Solution specification

`buildStatistics` is a pure domain function. It filters valid timestamps, aggregates immutable results, and evaluates a small documented rule set. The application route resolves drill names and renders dependency-free CSS bars. Session records add optional `level`, `targetAmount`, and `pauseSeconds` fields; validation accepts legacy records where those fields are absent.

The Statistics route reads `sessionRecords` and the active calibration profile from the existing local store. It writes nothing. Export and restore remain in Data and Recovery.

## 6. Generated solution

Version `0.4.0-statistics.0` adds a responsive Statistics route, period controls, activity summary, trend, mode mix, drill ranking, and explainable adaptive plan guidance. Automated coverage verifies filtering, aggregation, streaks, rankings, deterministic rules, invalid timestamps, legacy records, and enriched session records. Live transport remains absent and every recorded session still reports zero physically dispatched balls.
