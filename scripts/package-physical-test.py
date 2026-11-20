#!/usr/bin/env python3
"""Package only the isolated one-ball physical-test build; never publish via production workflow."""
import json
import re
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
variant = sys.argv[1] if len(sys.argv) > 1 else ""
if len(sys.argv) > 2 or (variant and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", variant)):
    raise SystemExit("Usage: package-physical-test.py [variant-label]")
dist_name = f"dist-physical-test{('-' + variant) if variant else ''}"
dist = root / dist_name
if dist.resolve().parent != root or dist.name != dist_name:
    raise SystemExit("Refusing to package outside the dedicated physical-test output directory")
meta = json.loads((dist / "build-meta.json").read_text(encoding="utf-8"))
version = meta.get("version", "")
if meta.get("physicalTestOnly") is not True or meta.get("distribution") != "physical-test-only":
    raise SystemExit("Refusing to package a build not marked physical-test-only")
if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z.+-]*", version):
    raise SystemExit("Invalid physical-test build version")
required = ["index.html", "physical-test.css", "LICENSE", "THIRD_PARTY_NOTICES.md", "build-meta.json", "src/app/physical-test-bootstrap.js"]
for name in required:
    if not (dist / name).is_file():
        raise SystemExit(f"Required physical-test file missing: {name}")
bootstrap = (dist / "src/app/physical-test-bootstrap.js").read_text(encoding="utf-8")
if re.search(r"audioPlayer|msync|voiceController|localStorage|indexedDB", bootstrap, re.I):
    raise SystemExit("Unsupported capabilities found in physical-test entry point")
label = f"-{variant}" if variant else ""
archive = root / f"nova-prime-{version}{label}-physical-test.zip"
if archive.exists():
    raise SystemExit(f"Refusing to overwrite an existing artifact: {archive.name}")
with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for file in sorted(path for path in dist.rglob("*") if path.is_file() and path.name != ".nova-prime-physical-test-build"):
        bundle.write(file, file.relative_to(dist).as_posix())
with zipfile.ZipFile(archive) as bundle:
    names = bundle.namelist()
    if "index.html" not in names or any(name.startswith("dist-physical-test/") for name in names):
        archive.unlink(missing_ok=True)
        raise SystemExit("Archive must contain index.html at its root without an output-folder wrapper")
    if bundle.testzip() is not None or not set(required).issubset(names):
        archive.unlink(missing_ok=True)
        raise SystemExit("Physical-test archive verification failed")
print(f"Created isolated test artifact {archive.name} ({len(names)} files; index.html at archive root)")
