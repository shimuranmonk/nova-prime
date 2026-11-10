# Custom drill library

## Implemented scope

Nova Prime stores custom drills in Groups A, B, and C. Users can create, rename, duplicate, move between groups, reorder, delete, select, export, import, and run custom drills in Reps or Time simulation. Each group accepts up to 100 drills, matching the Nova Trainer library boundary.

New drills receive immutable drill and step identities and begin with one valid canonical ball program. Names are trimmed, restricted to 40 characters, cleaned of Trainer-incompatible separators, and made unique within their group.

## File format

Custom drill files are JSON envelopes with:

- `format`: `nova-prime-drills`
- `version`: `1`
- `createdAt`: ISO timestamp
- `drills`: canonical custom or imported drill records

Import validates the entire envelope and every drill before atomically replacing the stored drill collection. Invalid files therefore leave existing custom drills unchanged. Identity collisions receive new local IDs, names remain unique within each target group, and capacity is checked before storage changes.

The custom-drill file is distinct from the complete application backup. A drill file is intended for sharing drills; a backup also contains settings, calibrations, tracks, playlists, MSYNC attachments, session history, migration receipts, and backup metadata.

## Current boundary

Library management and simulation are complete for this increment. The visual ball/table editor is not yet included, so newly created drills retain their default canonical ball. Calibration and live Bluetooth execution also remain disabled. Custom sessions use the existing safety lifecycle, send no robot commands, and record zero physically dispatched balls.

## Source alignment

Nova Prime continues to accept legacy `nova-ultimate-drills` files created before the rename.

The A/B/C groups, 100-drill group limit, 40-character naming rule, 20-step model boundary, ordering, move, duplicate, and delete behavior are aligned with the Nova Trainer source. Nova Prime expresses these rules through its canonical validated schema and local-first storage service rather than copying the original single-file implementation.
