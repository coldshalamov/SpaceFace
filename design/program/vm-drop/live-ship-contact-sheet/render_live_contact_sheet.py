#!/usr/bin/env python3
"""Batch chase stills for every packaged live wholeship LOD0 (read-only on live GLBs).

Source map: PACKAGED_LIVE_WHOLE_SHIP_FILES (RENDER_PACKAGE_PILOTS wholeships/, LOD0 only).
Blender cannot import release meshopt GLBs; render the matching uncompressed mirrors under
assets/ships/parts/wholeships/ (same filenames / identities). Writes only under this job folder.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

JOB = Path(__file__).resolve().parent
REPO = JOB.parents[3]
BLENDER = Path("/usr/local/bin/blender")
RENDER_SCRIPT = JOB / "render_glb_chase_stills.py"
PARTS_ROOT = REPO / "assets/ships/parts"
RELEASE_ROOT = REPO / "assets/ships/release/parts"
STILL_NAMES = ("play_chase.png", "play_chase_abeam.png", "play_chase_close.png")


def ship_slug(relative: str) -> str:
    name = Path(relative).name
    return name[:-4] if name.endswith(".glb") else name


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def list_lod0_packaged() -> list[str]:
    code = r"""
import { RENDER_PACKAGE_PILOTS } from './src/render/renderPackageManifest.js';
const files = [...new Set(RENDER_PACKAGE_PILOTS
  .filter((p) => p.sourceUrl.startsWith('assets/ships/release/parts/wholeships/'))
  .map((p) => p.sourceUrl.slice('assets/ships/release/parts/'.length)))]
  .filter((f) => !/_lod[12]\.glb$/i.test(f) && !/^wholeships\/kestrel_lod/i.test(f))
  .sort();
process.stdout.write(JSON.stringify(files));
"""
    raw = subprocess.check_output(
        ["node", "--input-type=module", "-e", code],
        cwd=str(REPO),
        text=True,
    )
    return json.loads(raw)


def resolve_glb(relative: str) -> tuple[Path | None, str]:
    parts = PARTS_ROOT / relative
    release = RELEASE_ROOT / relative
    if parts.is_file():
        return parts, "parts"
    if release.is_file():
        return release, "release"
    return None, "missing"


def render_one(relative: str) -> dict:
    slug = ship_slug(relative)
    glb, source = resolve_glb(relative)
    out = JOB / "stills" / slug
    out.mkdir(parents=True, exist_ok=True)
    entry = {
        "slug": slug,
        "relative": relative,
        "releaseUrl": f"assets/ships/release/parts/{relative}",
        "renderGlb": None if glb is None else str(glb.relative_to(REPO)),
        "renderSource": source,
        "outDir": str(out.relative_to(REPO)),
        "ok": False,
        "stills": {},
        "error": None,
        "chaseReport": None,
        "glbSha256": None,
        "releaseSha256": None,
    }
    release = RELEASE_ROOT / relative
    if release.is_file():
        entry["releaseSha256"] = sha256_file(release)
    if glb is None:
        entry["error"] = "missing_glb"
        return entry
    cmd = [
        str(BLENDER),
        "--background",
        "--python",
        str(RENDER_SCRIPT),
        "--",
        "--glb",
        str(glb),
        "--out",
        str(out),
    ]
    proc = subprocess.run(cmd, cwd=str(REPO), capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        entry["error"] = f"blender_exit_{proc.returncode}"
        entry["stderrTail"] = (proc.stderr or "")[-2000:]
        entry["stdoutTail"] = (proc.stdout or "")[-2000:]
        return entry
    missing = [name for name in STILL_NAMES if not (out / name).is_file()]
    if missing:
        entry["error"] = f"missing_stills:{','.join(missing)}"
        entry["stderrTail"] = (proc.stderr or "")[-2000:]
        return entry
    for name in STILL_NAMES:
        path = out / name
        entry["stills"][name] = {
            "path": str(path.relative_to(REPO)),
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
        }
    report_path = out / "chase_report.json"
    if report_path.is_file():
        entry["chaseReport"] = json.loads(report_path.read_text(encoding="utf-8"))
    entry["glbSha256"] = sha256_file(glb)
    entry["ok"] = True
    return entry


def main() -> int:
    # Drop prior smoke / scratch dirs so the sheet is clean.
    stills_root = JOB / "stills"
    if stills_root.is_dir():
        for child in stills_root.iterdir():
            if child.name.startswith("_"):
                shutil.rmtree(child, ignore_errors=True)
    for scratch in JOB.glob("_scratch_*"):
        scratch.unlink(missing_ok=True)

    blender_ver = subprocess.check_output([str(BLENDER), "--version"], text=True).splitlines()[0]
    relatives = list_lod0_packaged()
    ships = []
    for relative in relatives:
        print(f"RENDER {relative}", flush=True)
        entry = render_one(relative)
        ships.append(entry)
        print(f"  -> {'OK' if entry['ok'] else 'FAIL:' + str(entry.get('error'))}", flush=True)

    report = {
        "schema": "spaceface.vmDrop.liveShipContactSheet.v1",
        "job": "live-ship-contact-sheet",
        "blender": blender_ver,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceMap": "PACKAGED_LIVE_WHOLE_SHIP_FILES via RENDER_PACKAGE_PILOTS (LOD0 only)",
        "renderNote": "Blender imports uncompressed assets/ships/parts/wholeships mirrors; release URLs are the live packaged identities.",
        "shipCount": len(ships),
        "okCount": sum(1 for s in ships if s["ok"]),
        "failCount": sum(1 for s in ships if not s["ok"]),
        "ships": ships,
    }
    (JOB / "build-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"okCount": report["okCount"], "failCount": report["failCount"]}, indent=2))
    return 0 if report["failCount"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
