#!/usr/bin/env python3
"""Package the already-built production bundle with index.html at ZIP root."""
import json
import re
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
if len(sys.argv) not in (2, 3):
    raise SystemExit("Usage: python scripts/package-release.py <version> [dist-directory]")
version = sys.argv[1]
dist_name = sys.argv[2] if len(sys.argv) == 3 else "dist"
if not re.fullmatch(r"dist(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?", dist_name):
    raise SystemExit("Invalid build directory name")
dist = root / dist_name
meta = json.loads((dist / "build-meta.json").read_text(encoding="utf-8"))
if meta.get("version") != version:
    raise SystemExit(f"Build version {meta.get('version')} does not match requested version {version}")
required = ["index.html", "LICENSE", "THIRD_PARTY_NOTICES.md", "build-meta.json", "src/app/bootstrap.js", "src/app/feature-flags.js"]
for name in required:
    if not (dist / name).is_file():
        raise SystemExit(f"Required production file missing: {name}")
flags = (dist / "src/app/feature-flags.js").read_text(encoding="utf-8")
if not re.search(r"robot:\s*true", flags):
    raise SystemExit("Production robot feature flag must be enabled after physical gate pass")
bootstrap = (dist / "src/app/bootstrap.js").read_text(encoding="utf-8")
if "live-robot-runtime.js" not in bootstrap or "FEATURE_FLAGS.robot" not in bootstrap:
    raise SystemExit("Production bootstrap must mount the reviewed live robot runtime")
if "beta-calibration-msync-pending" != meta.get("physicalReleaseGate"):
    raise SystemExit("Build metadata is missing the physical release gate record")
archive = root / f"nova-prime-{version}-release.zip"
with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
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
