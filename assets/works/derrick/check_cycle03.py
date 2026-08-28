#!/usr/bin/env python3
"""PQ-131.05 Cycle 03 focused checks: JSON, Python, root, hook, LOD, hash, freeze.

Run from repo root after the Cycle 03 builder:

    python assets/works/derrick/check_cycle03.py
"""
from __future__ import annotations

import ast
import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FAMILY = ROOT / "assets" / "works" / "derrick"
SOURCE = FAMILY / "source"
CYCLE1 = FAMILY / "evidence" / "cycle_001"
CYCLE2 = FAMILY / "evidence" / "cycle_002"
CYCLE3 = FAMILY / "evidence" / "cycle_003"
DIAG = CYCLE3 / "diagnostics"
BUILDER = ROOT / "tools" / "blender" / "build_works_derrick.py"
PART = ROOT / "assets" / "ships" / "parts" / "works" / "place_works_derrick.glb"
ROOT_NAME = "SF_WORKS_DERRICK_V1"
HOOKS = ("drum_spin", "cable_anchor", "lamp_L", "lamp_R")
LOD_ROOTS = ("LOD0_derrick", "LOD1_derrick", "LOD2_derrick")
TRI_BUDGET = {"lod0": 12000, "lod1": 3000, "lod2": 900}
CELL = 2.2


def write_text_lf(path: Path, text: str) -> None:
    """Write repository diagnostics deterministically without CRLF churn."""
    path.write_bytes(text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def load_json(path: Path):
    text = path.read_text(encoding="utf-8")
    return json.loads(text)


def glb_names(path: Path):
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise SystemExit(f"not a GLB: {path}")
    json_len = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(bytes(data[20:20 + json_len]).rstrip(b" \x00"))
    nodes = gltf.get("nodes") or []
    names = [n.get("name") or "" for n in nodes]
    accessors = {i: a for i, a in enumerate(gltf.get("accessors") or [])}
    meshes = gltf.get("meshes") or []
    mesh_tris = []
    for mesh in meshes:
        tris = 0
        for prim in mesh.get("primitives") or []:
            acc = accessors.get(prim.get("indices"))
            if acc:
                tris += int(acc.get("count", 0)) // 3
        mesh_tris.append(tris)
    lod = {"lod0": 0, "lod1": 0, "lod2": 0}
    for node in nodes:
        name = node.get("name") or ""
        mi = node.get("mesh")
        if mi is None or mi >= len(mesh_tris):
            continue
        key = name[:4].lower() if name.startswith("LOD") else ""
        if key in lod:
            lod[key] += mesh_tris[mi]
    return names, lod, gltf


def crop_stills():
    try:
        from PIL import Image
    except ImportError:
        return {"ok": False, "error": "PIL missing"}
    DIAG.mkdir(parents=True, exist_ok=True)
    report = {}
    for name in (
        "works_top.png", "works_top_clay.png", "works_edge.png",
        "works_edge_grazing.png", "works_site.png", "hook_identity.png",
    ):
        path = CYCLE3 / name
        if not path.exists():
            report[name] = {"missing": True}
            continue
        im = Image.open(path).convert("RGB")
        w, h = im.size
        pix = im.load()
        minx, miny, maxx, maxy = w, h, 0, 0
        for y in range(h):
            for x in range(w):
                r, g, b = pix[x, y]
                if r + g + b > 18:
                    if x < minx:
                        minx = x
                    if y < miny:
                        miny = y
                    if x > maxx:
                        maxx = x
                    if y > maxy:
                        maxy = y
        pad = 8
        box = (
            max(0, minx - pad), max(0, miny - pad),
            min(w, maxx + pad + 1), min(h, maxy + pad + 1),
        )
        crop = im.crop(box)
        out = DIAG / f"{Path(name).stem}_crop.png"
        crop.save(out)
        cw, ch = crop.size
        cx0, cy0 = cw // 2 - max(1, cw // 8), ch // 2 - max(1, ch // 8)
        cx1, cy1 = cw // 2 + max(1, cw // 8), ch // 2 + max(1, ch // 8)
        centre = crop.crop((cx0, cy0, cx1, cy1))
        def luma(img):
            acc = 0
            n = 0
            for p in img.getdata():
                acc += 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
                n += 1
            return acc / max(1, n)
        report[name] = {
            "full": [w, h],
            "bbox": list(box),
            "crop": [cw, ch],
            "cropPath": str(out.relative_to(ROOT)).replace("\\", "/"),
            "centreLuma": round(luma(centre), 2),
            "meanLuma": round(luma(crop), 2),
        }
    write_text_lf(DIAG / "CROPS.json", json.dumps(report, indent=2) + "\n")
    return report


def main() -> int:
    errors = []
    json_files = [
        FAMILY / "HASHES.json",
        FAMILY / "MATERIAL_CONTRACT.json",
        FAMILY / "TECHNIQUE_LEDGER.json",
        FAMILY / "MATERIAL_TRUTH_PREFLIGHT.json",
        SOURCE / "derrick_inventory.json",
        CYCLE1 / "HASHES.json",
        CYCLE1 / "EPOCH.json",
        CYCLE2 / "HASHES.json",
        CYCLE3 / "EPOCH.json",
        FAMILY / "reference" / "CONTACT_SHEET_LABELS.json",
    ]
    parsed = {}
    for path in json_files:
        try:
            parsed[path] = load_json(path)
        except Exception as exc:
            errors.append(f"JSON {path.relative_to(ROOT)}: {exc}")

    try:
        ast.parse(BUILDER.read_text(encoding="utf-8"))
        python_ok = True
    except SyntaxError as exc:
        python_ok = False
        errors.append(f"Python syntax: {exc}")

    inv = parsed.get(SOURCE / "derrick_inventory.json") or {}
    epoch = parsed.get(CYCLE3 / "EPOCH.json") or {}
    contract = parsed.get(FAMILY / "MATERIAL_CONTRACT.json") or {}
    hashes = parsed.get(FAMILY / "HASHES.json") or {}
    freeze = parsed.get(CYCLE1 / "HASHES.json") or {}

    if inv.get("root") != ROOT_NAME:
        errors.append(f"root {inv.get('root')} != {ROOT_NAME}")
    if contract.get("root") != ROOT_NAME:
        errors.append("MATERIAL_CONTRACT root mismatch")
    if epoch.get("cycle") != 3:
        errors.append(f"epoch cycle {epoch.get('cycle')} != 3")
    if hashes.get("cycle") != 3:
        errors.append(f"HASHES cycle {hashes.get('cycle')} != 3")

    found_hooks = list(inv.get("hooks") or [])
    missing_hooks = [h for h in HOOKS if h not in found_hooks]
    if missing_hooks:
        errors.append(f"missing hooks in inventory: {missing_hooks}")

    if not PART.exists():
        errors.append("parts GLB missing")
        names, lod, _gltf = [], {"lod0": 0, "lod1": 0, "lod2": 0}, {}
    else:
        names, lod, _gltf = glb_names(PART)
    if ROOT_NAME not in names:
        errors.append("root node missing in GLB")
    for hook in HOOKS:
        if hook not in names:
            errors.append(f"hook missing in GLB: {hook}")
    for root in LOD_ROOTS:
        if root not in names and root not in (inv.get("meshNames") or []):
            errors.append(f"LOD root missing: {root}")
    for key, budget in TRI_BUDGET.items():
        tris = int(lod.get(key) or 0)
        if tris <= 0:
            errors.append(f"{key} has no triangles")
        if tris > budget:
            errors.append(f"{key} tris {tris} > {budget}")

    bbox = inv.get("bbox") or {}
    size = bbox.get("size") or [0, 0, 0]
    if size[0] > CELL + 1e-3 or size[1] > CELL + 1e-3:
        errors.append(f"footprint {size[:2]} exceeds cell {CELL}")
    if (bbox.get("max") or [0, 0, 0])[2] < 5.8:
        errors.append("height too short")
    if (bbox.get("max") or [0, 0, 0])[2] > 6.8:
        errors.append("height overshoot")

    frozen_stills = freeze.get("stills") or {}
    if not frozen_stills:
        errors.append("cycle_001 freeze stills empty")
    for name, expected in frozen_stills.items():
        path = CYCLE1 / name
        if not path.exists():
            errors.append(f"cycle_001 missing {name}")
            continue
        actual = sha256(path)
        if actual != expected:
            errors.append(f"cycle_001 mutated {name}")

    frozen_cycle2 = parsed.get(CYCLE2 / "HASHES.json") or {}
    if frozen_cycle2.get("cycle") != 2:
        errors.append("cycle_002 HASHES freeze missing or invalid")
    for name, expected in (frozen_cycle2.get("stills") or {}).items():
        path = CYCLE2 / name
        if not path.exists():
            errors.append(f"cycle_002 missing {name}")
            continue
        if sha256(path) != expected:
            errors.append(f"cycle_002 mutated {name}")

    if hashes.get("combinedSha256") and inv.get("sha256") and hashes["combinedSha256"] != inv["sha256"]:
        errors.append("HASHES combinedSha256 != inventory sha256")

    mesh_names = " ".join(inv.get("meshNames") or names)
    if "LOD0_cable" not in mesh_names or "LOD0_drum" not in mesh_names:
        errors.append("joined cable/drum LOD0 meshes missing")

    crops = {}
    if CYCLE3.exists():
        crops = crop_stills()
        site = crops.get("works_site.png") or {}
        if site.get("crop") and max(site["crop"]) > 80:
            errors.append(f"works_site crop enlarged: {site['crop']}")
        if site.get("crop") and max(site["crop"]) < 20:
            errors.append(f"works_site crop collapsed: {site['crop']}")

    result = {
        "ok": not errors,
        "errors": errors,
        "python": python_ok,
        "root": ROOT_NAME in names and inv.get("root") == ROOT_NAME,
        "hooks": {h: h in names for h in HOOKS},
        "lodTriangles": lod,
        "bbox": bbox,
        "cycle001Frozen": not any("cycle_001" in e for e in errors),
        "candidate": inv.get("sha256"),
        "crops": {k: {kk: vv for kk, vv in (v or {}).items() if kk != "bbox"} for k, v in crops.items()},
    }
    DIAG.mkdir(parents=True, exist_ok=True)
    write_text_lf(DIAG / "CHECK.json", json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
