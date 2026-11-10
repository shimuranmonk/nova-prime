# JewelFlow record

Nova Prime was defined through the following approved stages:

1. **Business Challenge** — Nova Plus and Nova Trainer split important capabilities across incompatible implementations.
2. **Intent** — Create one local-first product using Trainer as the robot foundation and Plus for unique Music, MSYNC, statistics, sharing, and later voice capabilities.
3. **Intent Analysis** — Resolve drill, session, storage, MSYNC timing, safety, migration, and device conflicts before requirements.
4. **Product Requirements Document** — Define phased functional and non-functional requirements.
5. **Solution Specification** — Define the canonical architecture, schemas, interfaces, migration, verification, deployment, and rollback.
6. **Generated Solution** — `main` contains Milestone 0, the canonical-domain foundation, local sessions, the hybrid app shell, and the authoritative 34-drill Nova Trainer catalogue. The custom-drill increment adds persistent Groups A/B/C management, atomic import/export, selection, and simulated sessions. The visual-editor increment adds draft-based Levels 1–3 authoring and an uncalibrated table preview. Neither increment crosses the live-robot safety boundary.

Traceability starts in [PRD.md](PRD.md) and continues through [SOLUTION_SPEC.md](SOLUTION_SPEC.md), [UI_DIRECTION.md](UI_DIRECTION.md), [DRILL_CATALOG.md](DRILL_CATALOG.md), [CUSTOM_DRILLS.md](CUSTOM_DRILLS.md), [MIGRATION.md](MIGRATION.md), and [TEST_MATRIX.md](TEST_MATRIX.md).
