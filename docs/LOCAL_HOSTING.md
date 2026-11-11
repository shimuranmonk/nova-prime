# Device-local HTTP hosting

Nova Prime uses one static release bundle for hosted HTTPS and offline phone/tablet use. Copy the complete contents of `dist/` into the mobile HTTP server's document directory; do not open `index.html` directly as a file.

## Stable origin

Use a fixed loopback URL such as `http://127.0.0.1:8080/` or `http://localhost:8080/`. Browser storage belongs to the complete origin, so changing protocol, hostname, or port creates a different storage area. Export a Nova Prime backup before deliberately changing any of them.

The bundle supports installation in a subdirectory such as `http://127.0.0.1:8080/apps/nova-prime/`. All runtime assets and ES-module imports are relative, and the build verifier rejects root-relative assets or missing module targets.

## Required content types

The server must send JavaScript modules as `text/javascript` or another browser-accepted JavaScript MIME type, CSS as `text/css`, JSON as `application/json`, and audio using its matching media type. A server that sends modules as `text/plain` or `application/octet-stream` may show the page shell while preventing the application from starting.

Nova Prime's development server supports `NOVA_PREVIEW_BASE_PATH=/apps/nova-prime/` for a subdirectory rehearsal and adds `X-Content-Type-Options: nosniff`. Automated tests cover subdirectory routing, module and JSON MIME types, redirects, missing paths, and traversal containment.

## Bluetooth boundary

Loopback HTTP is treated specially by Chromium-based browsers, but actual Web Bluetooth availability still depends on the browser and operating system. Plain LAN URLs such as `http://192.168.x.x/` are detected as unsafe for live robot control. Hosted live control requires HTTPS. The production robot flag remains disabled until the physical Nova S Pro checklist passes.
