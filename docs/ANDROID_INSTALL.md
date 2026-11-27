# Install Nova Prime on Android

The release ZIP is a ready-to-serve application bundle. Installation needs an Android HTTP server app with a document directory and a fixed-port loopback server. No Node.js, npm, Git, compilation, or internet connection is required after downloading the ZIP.

## First installation

1. Download `nova-prime-<version>-release.zip` from [GitHub Releases](https://github.com/shimuranmonk/nova-prime/releases) while internet is available.
2. In an archive/file manager, extract the ZIP's **contents** into the HTTP server app's document directory. `index.html` should be directly inside that directory, not inside an extra `dist` or version folder.
3. Configure the server to bind to `127.0.0.1` on port `8080`, with that directory as its document root. Start the server.
4. In the phone or tablet browser, open `http://127.0.0.1:8080/`. Optionally add the page to the home screen.
5. Confirm Nova Prime opens and your server reports JavaScript modules as a JavaScript MIME type.

## Offline use

The app files, modules, styles, license, and notices are served from the same device. Once the ZIP is downloaded and extracted, normal app use needs no internet or Wi-Fi. Keep the HTTP server app running while using Nova Prime. Online-only services and fetching a newer release still need internet.

## Upgrading without losing local data

Nova Prime stores data in the browser's IndexedDB database, scoped to the full origin. Before upgrading, export a backup from Nova Prime's Data screen. Stop the local server, then replace the old app files with the extracted contents of the new release ZIP. Keep the browser, server, protocol, hostname, port, and URL path unchanged: `http://127.0.0.1:8080/`. Start the server and reload the same browser URL. Do not clear browser/site data or uninstall the browser. Restore the exported backup only if the data is missing.

The database name `nova_ultimate` remains a compatibility identifier. App upgrades preserve it; do not change the origin or database key as part of routine upgrades. If the server app changes port or URL path, export a backup first; the new origin has separate browser storage and requires importing that backup.

## Included package and robot status

The latest verified local transfer candidate is `nova-prime-0.19.4-editor-layout-test.9-release.zip`. See [handover](HANDOVER.md) for its commit, checksum, and test status.

The ZIP contains the complete production `dist/` payload at archive root, including `index.html`, runtime modules, build metadata, AGPL license, and third-party notices. It does not contain an experimental hardware-test application. Live robot control is enabled for authorized beta testing. Calibration and MSYNC physical verification remain pending. See [robot status](ROBOT.md).
