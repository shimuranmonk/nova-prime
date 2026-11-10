# Nova Prime Sharing — JewelFlow increment

## 1. Business challenge

Nova Prime users can build detailed custom drills, but moving a drill between hosted web, a device-local server, or another player currently depends on a backup file that contains unrelated private data. Informal copying also risks incompatible or unsafe parameters.

## 2. Intent

Let users deliberately exchange only selected custom drills through a small, versioned, validated file. Sharing must work offline, require no Nova Prime account, and never import data before the recipient reviews a clear preview.

## 3. Intent analysis

- A complete backup is recovery data, not a suitable sharing format.
- Built-in drills are authoritative bundled data and are excluded from packs.
- The sender chooses the drills, title, note, and destination.
- The receiver treats every file as untrusted and sees a non-mutating preview before confirmation.
- Hosted and device-local origins cannot directly share browser storage; a portable file is the common boundary.
- Native device sharing may not exist in every browser, so file download is the universal fallback.
- Sharing does not enable live robot transport, accounts, discovery, public links, or background upload.

## 4. Product requirements

- Select one or more custom/imported drills and create a `nova-prime-share` version 1 drill pack.
- Limit a pack to 100 drills and 1 MB.
- Sanitize the pack title and note and validate every drill, level, step, variant, identity, group, and source.
- Download the pack on every supported runtime.
- Offer the system share sheet only when the browser supports file sharing.
- Validate and summarize an incoming pack without changing local data.
- Show drill count, groups, programs, steps, names, note, and size before confirmation.
- Import only after an explicit confirmation and resolve duplicate identities and names safely.
- Keep the entire workflow local unless the sender explicitly invokes the operating system share sheet.

## 5. Solution specification

The pure sharing domain owns the envelope, limits, validation, byte measurement, and summary. `SharingService` selects current custom drills, creates JSON and file metadata, adapts the package to the existing atomic custom-drill importer, and invokes the Web Share API only from a user action.

The dedicated Sharing route owns only temporary selection and import-preview state. It makes no persistent write until **Import drills** is selected. The same relative static assets and hash route run on hosted HTTPS and phone/tablet loopback HTTP servers.

## 6. Generated solution

Version `0.5.0-sharing.0` adds a responsive Sharing route, explicit selection, metadata, validated download, optional native file sharing, size and schema limits, read-only incoming previews, and confirmed atomic import. Automated tests cover valid packages, hostile data, duplicate identities, non-mutating previews, atomic failure, and the native-share adapter. Voice and live robot transport remain disabled.
