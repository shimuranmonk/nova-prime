# Custom drill library

## Implemented scope

Nova Prime stores custom drills in Groups A, B, and C. Users can create, rename, duplicate, move between groups, reorder, delete, select, export, import, and run custom drills in Reps or Time simulation. Each group accepts up to 100 drills, matching the Nova Trainer library boundary.

New drills receive immutable drill and step identities and begin with one valid canonical ball program. Names are trimmed, restricted to 40 characters, cleaned of Trainer-incompatible separators, and made unique within their group.

The visual editor builds independent programs for Levels 1–3. Each program supports up to 20 ordered steps, per-step enable and scatter controls, and multiple ball variants. Each ball exposes speed, spin, topspin/backspin type, height, direction, tempo, and repetitions. Programs can run sequentially or randomly.

Editor changes remain an in-memory draft until **Save program**. Cancelling or closing leaves the stored drill unchanged; saving validates the complete drill before one storage write.

## File format

Custom drill files are JSON envelopes with:

- `format`: `nova-prime-drills`
- `version`: `1`
- `createdAt`: ISO timestamp
- `drills`: canonical custom or imported drill records

Import validates the entire envelope and every drill before atomically replacing the stored drill collection. Invalid files therefore leave existing custom drills unchanged. Identity collisions receive new local IDs, names remain unique within each target group, and capacity is checked before storage changes.

The custom-drill file is distinct from the complete application backup. A drill file is intended for sharing drills; a backup also contains settings, calibrations, tracks, playlists, MSYNC attachments, session history, migration receipts, and backup metadata.

## Table preview

The table preview adapts Nova Trainer's uncalibrated start-value physics by nova_fan. It is a visual estimate, not a promise of physical placement. Guided calibration will later adjust the model for an actual table, balls, setup, and robot.

## Current boundary

Library management, visual editing, and simulation are complete for this increment. Calibration and live Bluetooth execution remain disabled. Custom sessions use the existing safety lifecycle, send no robot commands, and record zero physically dispatched balls.

## Source alignment

Nova Prime continues to accept legacy `nova-ultimate-drills` files created before the rename.

The A/B/C groups, 100-drill group limit, 40-character naming rule, 20-step model boundary, ordering, move, duplicate, and delete behavior are aligned with the Nova Trainer source. Nova Prime expresses these rules through its canonical validated schema and local-first storage service rather than copying the original single-file implementation.
