# Nova Ultimate Migration Plan

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

When browser origins differ, migration uses explicit export/import. This includes changes to a mobile server's protocol, hostname, or port. Ultimate never claims access to an inaccessible origin.

## Failure behavior

- A validation error blocks the affected record.
- A transaction failure records no completion receipt.
- Partial imports are not considered successful.
- Existing Ultimate records are not silently replaced.
- The user receives a result report containing imported, merged, skipped, and failed counts.
