#!/usr/bin/env python3
"""PQ-131.05 Cycle 04 checks: GLB transforms, hierarchy, bounds, hashes, freezes.

Run from repo root after the Cycle 04 builder:

    python assets/works/derrick/check_cycle04.py
"""
from __future__ import annotations

import ast
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FAMILY = ROOT / "assets" / "works" / "derrick"
SOURCE = FAMILY / "source"
CYCLE1 = FAMILY / "evidence" / "cycle_001"
CYCLE2 = FAMILY / "evidence" / "cycle_002"
CYCLE3 = FAMILY / "evidence" / "cycle_003"
CYCLE4 = FAMILY / "evidence" / "cycle_004"
DIAG = CYCLE4 / "diagnostics"
BUILDER = ROOT / "tools" / "blender" / "build_works_derrick.py"
PART = ROOT / "assets" / "ships" / "parts" / "works" / "place_works_derrick.glb"
ROOT_NAME = "SF_WORKS_DERRICK_V1"
HOOKS = ("drum_spin", "cable_anchor", "lamp_L", "lamp_R")
LOD_ROOTS = ("LOD0_derrick", "LOD1_derrick", "LOD2_derrick")
TRI_BUDGET = {"lod0": 12000, "lod1": 3000, "lod2": 900}
CELL = 2.2
EPS = 1e-4
EXPECTED_HOOK_GLTF = {
    "drum_spin": (-0.62, 1.38, 0.0),
    "cable_anchor": (-0.464, 1.504, 0.0),
    "lamp_L": (0.05, 6.30, -0.40),
    "lamp_R": (0.05, 6.30, 0.40),
}
EXPECTED_CHILDREN = {
    "drum_spin": {f"LOD{i}_drum" for i in range(3)},
    "cable_anchor": {f"LOD{i}_cable" for i in range(3)},
    "lamp_L": {name for i in range(3) for name in (f"LOD{i}_lamp_L", f"LOD{i}_lamp_L_lens")},
    "lamp_R": {name for i in range(3) for name in (f"LOD{i}_lamp_R", f"LOD{i}_lamp_R_lens")},
}
COLLISION_CENTER_GLTF = (0.0, 3.20, 0.0)
COLLISION_HALF_EXTENTS_GLTF = (1.08, 3.25, 1.00)


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


def mat_identity():
    return [[1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0]]


def mat_mul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def node_local_matrix(node):
    if node.get("matrix") is not None:
        raw = [float(v) for v in node["matrix"]]
        return [[raw[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = [float(v) for v in node.get("translation", (0.0, 0.0, 0.0))]
    sx, sy, sz = [float(v) for v in node.get("scale", (1.0, 1.0, 1.0))]
    x, y, z, w = [float(v) for v in node.get("rotation", (0.0, 0.0, 0.0, 1.0))]
    rot = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    out = mat_identity()
    scale = (sx, sy, sz)
    for r in range(3):
        for c in range(3):
            out[r][c] = rot[r][c] * scale[c]
    out[0][3], out[1][3], out[2][3] = tx, ty, tz
    return out


def world_matrices(gltf):
    nodes = gltf.get("nodes") or []
    parents = {}
    for pi, node in enumerate(nodes):
        for child in node.get("children") or []:
            parents[int(child)] = pi
    cache = {}

    def resolve(index):
        if index in cache:
            return cache[index]
        local = node_local_matrix(nodes[index])
        parent = parents.get(index)
        cache[index] = local if parent is None else mat_mul(resolve(parent), local)
        return cache[index]

    for i in range(len(nodes)):
        resolve(i)
    return cache, parents


def transform_point(matrix, point):
    x, y, z = [float(v) for v in point]
    return tuple(sum(matrix[r][c] * (x, y, z, 1.0)[c] for c in range(4)) for r in range(3))


def matrix_translation(matrix):
    return tuple(matrix[i][3] for i in range(3))


def matrix_scale(matrix):
    return tuple(math.sqrt(sum(matrix[r][c] ** 2 for r in range(3))) for c in range(3))


def near_vec(actual, expected, eps=EPS):
    return len(actual) == len(expected) and all(abs(float(a) - float(e)) <= eps for a, e in zip(actual, expected))


def matrix_is_identity(matrix, eps=EPS):
    ident = mat_identity()
    return all(abs(matrix[r][c] - ident[r][c]) <= eps for r in range(4) for c in range(4))


def bounds_union(bounds):
    valid = [b for b in bounds if b is not None]
    if not valid:
        return None
    return {
        "min": [min(b["min"][i] for b in valid) for i in range(3)],
        "max": [max(b["max"][i] for b in valid) for i in range(3)],
    }


def transformed_bounds(bounds, matrix):
    if bounds is None:
        return None
    corners = []
    for x in (bounds["min"][0], bounds["max"][0]):
        for y in (bounds["min"][1], bounds["max"][1]):
            for z in (bounds["min"][2], bounds["max"][2]):
                corners.append(transform_point(matrix, (x, y, z)))
    return {
        "min": [min(p[i] for p in corners) for i in range(3)],
        "max": [max(p[i] for p in corners) for i in range(3)],
    }


def mesh_bounds(gltf, mesh_index):
    meshes = gltf.get("meshes") or []
    accessors = gltf.get("accessors") or []
    if mesh_index is None or mesh_index >= len(meshes):
        return None
    parts = []
    for prim in meshes[mesh_index].get("primitives") or []:
        pos_index = (prim.get("attributes") or {}).get("POSITION")
        if pos_index is None or pos_index >= len(accessors):
            continue
        accessor = accessors[pos_index]
        if accessor.get("min") is None or accessor.get("max") is None:
            continue
        parts.append({"min": [float(v) for v in accessor["min"]],
                      "max": [float(v) for v in accessor["max"]]})
    return bounds_union(parts)


def node_set_bounds(gltf, indices, matrices):
    nodes = gltf.get("nodes") or []
    return bounds_union([
        transformed_bounds(mesh_bounds(gltf, nodes[i].get("mesh")), matrices[i])
        for i in indices if nodes[i].get("mesh") is not None
    ])


def bounds_center_half(bounds):
    center = tuple((bounds["min"][i] + bounds["max"][i]) * 0.5 for i in range(3))
    half = tuple((bounds["max"][i] - bounds["min"][i]) * 0.5 for i in range(3))
    return center, half


def bounds_contains(outer, inner, tolerance=0.0):
    return all(outer["min"][i] - tolerance <= inner["min"][i]
               and outer["max"][i] + tolerance >= inner["max"][i] for i in range(3))


def inspect_exported_hierarchy(gltf):
    errors = []
    nodes = gltf.get("nodes") or []
    names = [node.get("name") or "" for node in nodes]
    index_by_name = {name: i for i, name in enumerate(names)}
    world, parents = world_matrices(gltf)
    root_index = index_by_name.get(ROOT_NAME)
    report = {"hooks": {}, "collision": {}}

    for hook_name, expected_position in EXPECTED_HOOK_GLTF.items():
        index = index_by_name.get(hook_name)
        if index is None:
            errors.append(f"exported transform missing hook: {hook_name}")
            continue
        local = node_local_matrix(nodes[index])
        global_position = matrix_translation(world[index])
        local_position = matrix_translation(local)
        if matrix_is_identity(local):
            errors.append(f"{hook_name} exported as identity transform")
        if not near_vec(global_position, expected_position):
            errors.append(f"{hook_name} global {global_position} != {expected_position}")
        if not near_vec(local_position, expected_position):
            errors.append(f"{hook_name} local {local_position} != {expected_position}")
        if parents.get(index) != root_index:
            errors.append(f"{hook_name} is not an immediate child of {ROOT_NAME}")
        child_indices = [int(i) for i in nodes[index].get("children") or []]
        child_names = {names[i] for i in child_indices}
        expected_children = EXPECTED_CHILDREN[hook_name]
        if child_names != expected_children:
            errors.append(f"{hook_name} children {sorted(child_names)} != {sorted(expected_children)}")
        for child_index in child_indices:
            if not matrix_is_identity(node_local_matrix(nodes[child_index])):
                errors.append(f"{names[child_index]} is not pivot-local under {hook_name}")
        local_matrices = {i: node_local_matrix(nodes[i]) for i in child_indices}
        local_bounds = node_set_bounds(gltf, child_indices, local_matrices)
        if local_bounds is None:
            errors.append(f"{hook_name} child mesh bounds missing")
        else:
            limit = 0.65 if hook_name == "drum_spin" else 6.6 if hook_name == "cable_anchor" else 0.80
            largest = max(abs(v) for v in (*local_bounds["min"], *local_bounds["max"]))
            if largest > limit:
                errors.append(f"{hook_name} child locality {largest:.4f} > {limit:.4f}")
            if not all(local_bounds["min"][i] - 0.04 <= 0.0 <= local_bounds["max"][i] + 0.04 for i in range(3)):
                errors.append(f"{hook_name} pivot is outside child bounds {local_bounds}")
        report["hooks"][hook_name] = {
            "node": index,
            "localTranslation": [round(v, 6) for v in local_position],
            "globalPosition": [round(v, 6) for v in global_position],
            "children": sorted(child_names),
            "childLocalBounds": local_bounds,
        }

    collision_index = index_by_name.get("COLLISION_HULL")
    if collision_index is None:
        errors.append("COLLISION_HULL node missing")
    else:
        collision_local = node_local_matrix(nodes[collision_index])
        collision_world = world[collision_index]
        if matrix_is_identity(collision_local):
            errors.append("COLLISION_HULL exported as identity transform")
        if parents.get(collision_index) != root_index:
            errors.append(f"COLLISION_HULL is not an immediate child of {ROOT_NAME}")
        unit_box = {"min": [-1.0, -1.0, -1.0], "max": [1.0, 1.0, 1.0]}
        collision_bounds = transformed_bounds(unit_box, collision_world)
        center, half = bounds_center_half(collision_bounds)
        if not near_vec(center, COLLISION_CENTER_GLTF):
            errors.append(f"collision center {center} != {COLLISION_CENTER_GLTF}")
        if not near_vec(half, COLLISION_HALF_EXTENTS_GLTF):
            errors.append(f"collision half extents {half} != {COLLISION_HALF_EXTENTS_GLTF}")
        lod0_indices = [i for i, name in enumerate(names)
                        if name.startswith("LOD0_") and nodes[i].get("mesh") is not None]
        lod0_bounds = node_set_bounds(gltf, lod0_indices, world)
        if lod0_bounds is None:
            errors.append("LOD0 exported geometry bounds missing")
        elif not bounds_contains(collision_bounds, lod0_bounds, tolerance=0.06):
            errors.append(f"collision bounds {collision_bounds} do not contain LOD0 {lod0_bounds}")
        report["collision"] = {
            "node": collision_index,
            "globalCenter": [round(v, 6) for v in center],
            "globalScale": [round(v, 6) for v in matrix_scale(collision_world)],
            "bounds": collision_bounds,
            "lod0GeometryBounds": lod0_bounds,
        }
    return report, errors


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
        path = CYCLE4 / name
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
        CYCLE3 / "HASHES.json",
        CYCLE4 / "EPOCH.json",
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
    epoch = parsed.get(CYCLE4 / "EPOCH.json") or {}
    contract = parsed.get(FAMILY / "MATERIAL_CONTRACT.json") or {}
    hashes = parsed.get(FAMILY / "HASHES.json") or {}
    freeze = parsed.get(CYCLE1 / "HASHES.json") or {}

    if inv.get("root") != ROOT_NAME:
        errors.append(f"root {inv.get('root')} != {ROOT_NAME}")
    if contract.get("root") != ROOT_NAME:
        errors.append("MATERIAL_CONTRACT root mismatch")
    if epoch.get("cycle") != 4:
        errors.append(f"epoch cycle {epoch.get('cycle')} != 4")
    if hashes.get("cycle") != 4:
        errors.append(f"HASHES cycle {hashes.get('cycle')} != 4")

    found_hooks = list(inv.get("hooks") or [])
    missing_hooks = [h for h in HOOKS if h not in found_hooks]
    if missing_hooks:
        errors.append(f"missing hooks in inventory: {missing_hooks}")

    if not PART.exists():
        errors.append("parts GLB missing")
        names, lod, gltf = [], {"lod0": 0, "lod1": 0, "lod2": 0}, {}
    else:
        names, lod, gltf = glb_names(PART)
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

    hierarchy = {}
    if gltf:
        hierarchy, hierarchy_errors = inspect_exported_hierarchy(gltf)
        errors.extend(hierarchy_errors)

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

    frozen_cycle3 = parsed.get(CYCLE3 / "HASHES.json") or {}
    if frozen_cycle3.get("cycle") != 3:
        errors.append("cycle_003 HASHES freeze missing or invalid")
    for name, expected in (frozen_cycle3.get("stills") or {}).items():
        path = CYCLE3 / name
        if not path.exists():
            errors.append(f"cycle_003 missing {name}")
            continue
        if sha256(path) != expected:
            errors.append(f"cycle_003 mutated {name}")

    if hashes.get("combinedSha256") and inv.get("sha256") and hashes["combinedSha256"] != inv["sha256"]:
        errors.append("HASHES combinedSha256 != inventory sha256")

    mesh_names = " ".join(inv.get("meshNames") or names)
    if "LOD0_cable" not in mesh_names or "LOD0_drum" not in mesh_names:
        errors.append("joined cable/drum LOD0 meshes missing")

    crops = {}
    if CYCLE4.exists():
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
        "exportedHierarchy": hierarchy,
        "cycle001Frozen": not any("cycle_001" in e for e in errors),
        "cycle002Frozen": not any("cycle_002" in e for e in errors),
        "cycle003Frozen": not any("cycle_003" in e for e in errors),
        "candidate": inv.get("sha256"),
        "crops": {k: {kk: vv for kk, vv in (v or {}).items() if kk != "bbox"} for k, v in crops.items()},
    }
    DIAG.mkdir(parents=True, exist_ok=True)
    write_text_lf(DIAG / "CHECK.json", json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
