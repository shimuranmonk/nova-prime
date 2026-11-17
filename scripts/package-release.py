#!/usr/bin/env python3
"""Package the already-built production bundle with index.html at ZIP root."""
import json
import re
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
if len(sys.argv) != 2:
    raise SystemExit("Usage: python scripts/package-release.py <version>")
version = sys.argv[1]
meta = json.loads((dist / "build-meta.json").read_text(encoding="utf-8"))
if meta.get("version") != version:
    raise SystemExit(f"Build version {meta.get('version')} does not match requested version {version}")
required = ["index.html", "LICENSE", "THIRD_PARTY_NOTICES.md", "build-meta.json", "src/app/bootstrap.js", "src/app/feature-flags.js"]
for name in required:
    if not (dist / name).is_file():
        raise SystemExit(f"Required production file missing: {name}")
flags = (dist / "src/app/feature-flags.js").read_text(encoding="utf-8")
if not re.search(r"robot:\s*false", flags):
    raise SystemExit("Production robot feature flag must remain disabled")
if re.search(r"application/robot|infrastructure/robot", (dist / "src/app/bootstrap.js").read_text(encoding="utf-8")):
    raise SystemExit("Production bootstrap must not import the live robot stack")
archive = root / f"nova-prime-{version}-release.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for file in sorted(p for p in dist.rglob("*") if p.is_file()):
        bundle.write(file, file.relative_to(dist).as_posix())
with zipfile.ZipFile(archive) as bundle:
    names = bundle.namelist()
    if "index.html" not in names or any(name.startswith("dist/") for name in names):
        raise SystemExit("Archive must contain index.html at its root, without a dist/ wrapper")
    if bundle.testzip() is not None:
        raise SystemExit("ZIP integrity check failed")
    if not set(required).issubset(names):
        raise SystemExit("ZIP is missing required production assets")
print(f"Created and verified {archive.name} ({len(names)} files; index.html at archive root)")
