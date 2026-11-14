# Built-in Drill Catalogue

## Authoritative source

Nova Prime’s built-in catalogue is migrated from `shimuranmonk/nova-advance`, branch `refactor/nova-trainer-modular`:

- `js/model/library.js`, Git blob `9a0c54a59deb2fea46e24c8c40296730e14c24d6`
- `js/model/ball.js`, Git blob `8bb90b539a7b5fb4279e34439039453aebbb4c0d`

The source reference is embedded in the catalogue module so later updates can identify the exact definitions that were migrated.

## Inventory

| Category | Count | Contents |
| --- | ---: | --- |
| Basic | 6 | Push, Drive, and Loop for backhand and forehand |
| Combined | 12 | Two-step stroke sequences |
| Complex | 13 | Three-step stroke sequences |
| Complex random | 3 | Random drive, 2–3 random drive, and All random |
| **Total** | **34** | Three programs per drill |

## Canonical mapping

- Built-ins receive stable `builtin:*` IDs and retain their original source keys.
- Trainer `reps` maps to canonical `repetitions`.
- Trainer `on` maps to canonical `enabled`.
- Every step receives a deterministic ID derived from drill, level, and order.
- All built-ins use the middle robot position and zero scatter, matching the source.
- Basic drills retain the source’s level-specific speed, spin, and BPM parameters.
- Combined, Complex, and random sequences retain the source behavior: their three level programs use the same level-one stroke parameters.
- Random definitions remain in the Complex category and retain `random: true` as their default.
- Random or sequential playback can be overridden independently for each built-in drill level. These preferences are stored separately from the immutable catalogue, and single-ball programs always remain sequential.
- **Reset settings** removes every built-in playback override and restores the catalogue defaults without changing custom drills.

## Verification boundary

Automated tests assert the 6/12/16 category counts, unique stable IDs, canonical validation, representative source parameters, sequence order, default random flags, per-level overrides, and recovery. The resolved order is carried by the session specification and history record. The catalogue is available for local Reps and Time simulation. Physical output remains unverified in Nova Prime until the live executor and robot test matrix are complete.
