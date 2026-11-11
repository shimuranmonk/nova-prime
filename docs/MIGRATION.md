# Nova Prime Migration Plan

> `0.7.0-migration.0` implements Nova Plus custom-drill CSV migration. Other source types remain planned and are not implied by the interface.

## JewelFlow decision

- **Business challenge:** preserve useful Nova Plus work when users move to Prime without risking either legacy data or existing Prime records.
- **Intent:** make migration deliberate, understandable, repeatable, and safe across hosted and device-local origins.
- **Intent analysis:** browsers cannot read another origin's storage; therefore the first reliable bridge is an explicit file. Duplicate built-ins, invalid parameters, capacity, identity, partial writes, and repeated imports are treated as blocking or reported conditions.
- **Product requirement:** preview before mutation, validate every drill, never overwrite silently, commit drills and receipt together, and leave the source untouched.
- **Solution specification:** parse the required ten Nova Plus columns plus optional Scatter, Active, Random, and Position columns, fingerprint the file with SHA-256, transform Groups A–C in memory, reproduce programs at Levels 1–3, validate canonical records, and use one IndexedDB transaction. Negative Height is preserved as Nova Trainer Serve state.
- **Generated solution:** Data and Recovery now provides file selection, read-only inventory, warnings/errors, confirmation, atomic import, conflict-safe naming, and an idempotent receipt.

## Supported sources

- Nova Trainer `nf.*` local records and calibration
- Nova Plus custom drills, order, settings, and statistics
- Nova Plus `nova_music` IndexedDB tracks, playlists, and MSYNC attachments
- CSV, calibration, backup, playlist, and MSYNC files

## Required sequence

1. Detect legacy sources without changing them.
2. Build and display an inventory.
3. Create a backup where possible.
4. Transform records in memory.
5. Validate every transformed record.
6. Report warnings and skipped records.
7. Commit valid records through a controlled transaction.
8. Record a migration receipt.
9. Leave legacy source data unchanged.

Migration must be idempotent. Matching Track hashes and immutable drill IDs prevent duplication.

When browser origins differ, migration uses explicit export/import. This includes changes to a mobile server's protocol, hostname, or port. Prime never claims access to an inaccessible origin.

## Failure behavior

- A validation error blocks the affected record.
- A transaction failure records no completion receipt.
- Partial imports are not considered successful.
- Existing Prime records are not silently replaced.
- The user receives a result report containing imported, merged, skipped, and failed counts.

## Implemented recovery boundary

The 0.1 local-sessions increment implements versioned Nova Prime JSON backup and restore. Export includes every current non-backup store. Restore rejects unsupported versions, unknown or missing collections, duplicate IDs, malformed records, and invalid canonical domain records before opening the replacement transaction. Valid collections are then replaced in one storage transaction.

Nova Plus custom-drill CSV transformation is now implemented. Settings, statistics, `nova_music` tracks, playlists, MSYNC attachments, and Nova Trainer local records remain planned. The current restore path accepts Nova Prime backups and pre-rename Nova Ultimate backups, but does not claim direct access to another browser origin.

The Nova Prime branding release deliberately retains the deployed IndexedDB identity `nova_ultimate`. This is an internal compatibility key, not a visible product name, and keeps existing drills, settings, and session history available without a destructive cross-database move.
