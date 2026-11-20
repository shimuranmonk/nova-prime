from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import json
import sys

root = Path(__file__).resolve().parent.parent
variant = sys.argv[1] if len(sys.argv) > 1 else ""
if variant and (not variant.replace("-", "").isalnum() or variant.lower() != variant):
    raise SystemExit("Invalid full physical-test output variant")
dist = root / f"dist-full-physical-test{'-' + variant if variant else ''}"
meta = json.loads((dist / "build-meta.json").read_text(encoding="utf-8"))
if meta.get("distribution") != "full-physical-test-only" or meta.get("productionMainGateOpen") is not True or meta.get("outputContainsLiveRobotControl") is not True:
    raise SystemExit("Refusing to package an improperly identified isolated test build")
archive = root / f"nova-prime-{meta['version']}-full-physical-test{'-' + variant if variant else ''}.zip"
if archive.exists():
    raise SystemExit(f"Archive already exists; preserving it: {archive.name}")
if not (dist / "index.html").is_file() or not (dist / "LICENSE").is_file() or not (dist / "THIRD_PARTY_NOTICES.md").is_file():
    raise SystemExit("Build is missing index.html, LICENSE, or third-party notices")
with ZipFile(archive, "x", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
    for file in sorted(dist.rglob("*")):
        if file.is_file():
            bundle.write(file, file.relative_to(dist).as_posix())
with ZipFile(archive) as bundle:
    if bundle.testzip() is not None or "index.html" not in bundle.namelist():
        archive.unlink(missing_ok=True)
        raise SystemExit("Archive integrity or root index check failed")
print(f"Created {archive.name} ({archive.stat().st_size:,} bytes) with index.html at ZIP root")
