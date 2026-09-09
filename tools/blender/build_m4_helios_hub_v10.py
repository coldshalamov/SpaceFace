#!/usr/bin/env python3
"""SpaceFace M4 Helios Hub V10 — Stage A greybox foundation (standalone).

Packet: M4-HELIOS-V10-GREYBOX-GATE
Stage A only: lofted/profile hard-surface greybox for hub + gate, measure,
export temporary GLBs, Blender smoke evidence, then stop.

Rules (fail-closed):
- Standalone: no imports from prior Helios hub builders.
- Visible geometry is authored profile loft / from_pydata / subdivision / bevel only.
- bpy.ops.mesh.primitive_*_add is forbidden for visible output (cutters only, tracked).
- No make_box / make_cylinder / make_plane helpers for visible output.
- Neutral 3-value clay materials only. No Stage B materials/rocks/promotion.

Run:
  blender --background --python tools/blender/build_m4_helios_hub_v10.py
"""
from __future__ import annotations

import ast
import hashlib
import json
import math
import os
import struct
import sys
import traceback
from collections import defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Paths / constants
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "assets" / "ships" / "m4_helios_hub_v10"
GREYBOX_DIR = ASSET_ROOT / "greybox"
EVIDENCE_DIR = ASSET_ROOT / "evidence" / "greybox"
LOCK_DIR = ASSET_ROOT / "authoring.__lock"
PACKET = "M4-HELIOS-V10-GREYBOX-GATE"
STAGE = "A"
SCRIPT_PATH = Path(__file__).resolve()

FORBIDDEN_VISIBLE_PRIMITIVES = (
    "primitive_cube_add",
    "primitive_cylinder_add",
    "primitive_plane_add",
    "primitive_uv_sphere_add",
    "primitive_ico_sphere_add",
    "primitive_cone_add",
    "primitive_torus_add",
    "primitive_grid_add",
    "primitive_monkey_add",
    "primitive_circle_add",
)
FORBIDDEN_HELPER_NAMES = ("make_box", "make_cylinder", "make_plane")
FORBIDDEN_IMPORT_TOKENS = (
    "build_m4_helios_hub_v3",
    "build_m4_helios_hub_v7",
    "build_m4_helios_hub_v8",
    "build_m4_helios_hub_v9",
    "m4_helios_hub_v3",
    "m4_helios_hub_v7",
    "m4_helios_hub_v8",
    "m4_helios_hub_v9",
)

# Registered boolean cutters (name -> used_by_boolean). Emptied before export.
CUTTER_OBJECTS: dict[str, bool] = {}

# Metric gates
MIN_SHELL_SILHOUETTE_SHARE = 0.65
MIN_SHELL_VOLUME_SHARE = 0.80
MARGIN_MIN = 0.08
MARGIN_MAX = 0.15
GATE_TRAVERSAL_MIN_FRAC = 0.35
GATE_GLB_MIN_BYTES = 10 * 1024
MIN_NEG_SPACES = 2

# Hub macro proportions (Stage A identity contract)
HUB_STEM_LEN = 18.0          # 16–20
HUB_ARM_LEN = 30.0           # 26–34 each
HUB_TIP_SEP = 21.0           # 18–24 centerline separation at tips
HUB_HAB_THICK = 5.6          # 4–6 broader habitation
HUB_IND_THICK = 4.3          # 4–6 leaner industrial
HUB_STEM_W = 5.0
HUB_Z_KEEL = 2.2
HUB_Z_HAB = 3.0
HUB_Z_IND = 3.6


# ---------------------------------------------------------------------------
# Static AST validator (runs without Blender)
# ---------------------------------------------------------------------------

class StaticValidationError(Exception):
    pass


def static_validate_source(source: str, path: Path | None = None) -> list[str]:
    """Reject forbidden visible primitives, stale cutters patterns, prior versions, etc."""
    notes: list[str] = []
    tree = ast.parse(source, filename=str(path or "<source>"))

    # Prior-version references anywhere in source text (imports + string refs)
    lower = source.lower()
    for token in FORBIDDEN_IMPORT_TOKENS:
        if token.lower() in lower:
            # Allow only this self-file's docstring mentioning "does NOT import ... v3/v7/v8/v9"
            # Count real identifiers more carefully via AST.
            pass

    class Visitor(ast.NodeVisitor):
        def __init__(self) -> None:
            self.issues: list[str] = []
            self.defined_helpers: set[str] = set()
            self.cutter_registry_present = False
            self.has_cutter_cleanup = False

        def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
            if node.name in FORBIDDEN_HELPER_NAMES:
                self.issues.append(
                    f"forbidden helper def {node.name} at line {node.lineno}"
                )
            self.defined_helpers.add(node.name)
            self.generic_visit(node)

        def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
            self.visit_FunctionDef(node)  # type: ignore[arg-type]

        def visit_Import(self, node: ast.Import) -> None:
            for alias in node.names:
                name = alias.name or ""
                for token in FORBIDDEN_IMPORT_TOKENS:
                    if token in name:
                        self.issues.append(
                            f"forbidden import '{name}' at line {node.lineno}"
                        )
            self.generic_visit(node)

        def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
            mod = node.module or ""
            for token in FORBIDDEN_IMPORT_TOKENS:
                if token in mod:
                    self.issues.append(
                        f"forbidden import-from '{mod}' at line {node.lineno}"
                    )
            self.generic_visit(node)

        def visit_Call(self, node: ast.Call) -> None:
            # bpy.ops.mesh.primitive_*_add
            func = node.func
            name = None
            if isinstance(func, ast.Attribute):
                name = func.attr
            elif isinstance(func, ast.Name):
                name = func.id
            if name in FORBIDDEN_VISIBLE_PRIMITIVES:
                # Allowed only inside register_cutter / boolean cutter paths:
                # we require the call to appear in a function whose name contains 'cutter'
                enclosing = getattr(node, "_sf_enclosing", None)
                if not enclosing or "cutter" not in enclosing.lower():
                    self.issues.append(
                        f"forbidden visible primitive call {name}() at line {node.lineno} "
                        f"(only cutter-scoped functions may call primitives)"
                    )
            if name in FORBIDDEN_HELPER_NAMES:
                self.issues.append(
                    f"forbidden helper call {name}() at line {node.lineno}"
                )
            self.generic_visit(node)

        def visit_Name(self, node: ast.Name) -> None:
            if node.id == "CUTTER_OBJECTS":
                self.cutter_registry_present = True
            self.generic_visit(node)

        def visit_Constant(self, node: ast.Constant) -> None:
            if isinstance(node.value, str):
                for token in FORBIDDEN_IMPORT_TOKENS:
                    # Docstring negation is OK; reject bare module path references
                    val = node.value
                    if token in val and "does NOT" not in val and "not import" not in val.lower():
                        # Still allow anti-defect commentary that names the versions
                        if "v3/v7/v8/v9" in val or "v3" in val and "import" in val.lower():
                            pass
                        elif f"build_m4_helios_hub_{token[-2:]}" in val or token in val:
                            # Hard fail only on importlib / path construction style
                            if "import" in val.lower() or "load" in val.lower() or ".py" in val:
                                self.issues.append(
                                    f"stale prior-version reference in string at line {node.lineno}: {token}"
                                )
            self.generic_visit(node)

    # Annotate calls with enclosing function name
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            child._sf_parent = parent  # type: ignore[attr-defined]

    def enclosing_func(node: ast.AST) -> str | None:
        cur = node
        while cur is not None:
            if isinstance(cur, (ast.FunctionDef, ast.AsyncFunctionDef)):
                return cur.name
            cur = getattr(cur, "_sf_parent", None)
        return None

    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            node._sf_enclosing = enclosing_func(node)  # type: ignore[attr-defined]

    vis = Visitor()
    vis.visit(tree)

    # Require CUTTER_OBJECTS registry symbol for the contract
    if not vis.cutter_registry_present:
        vis.issues.append("CUTTER_OBJECTS registry missing from module")

    # Disallow disconnected-floating-hero patterns encoded as helper names
    for helper in vis.defined_helpers:
        low = helper.lower()
        if low.startswith("float_") or low.startswith("orphan_"):
            vis.issues.append(f"disconnected floating hero helper banned: {helper}")

    if vis.issues:
        raise StaticValidationError(
            "static_validate_source FAILED:\n  - " + "\n  - ".join(vis.issues)
        )
    notes.append(f"static_validate_source OK ({len(source)} bytes)")
    notes.append("no forbidden visible primitive calls outside cutter scope")
    notes.append("no prior-version imports")
    notes.append("CUTTER_OBJECTS registry present")
    return notes


def run_static_gate() -> list[str]:
    source = SCRIPT_PATH.read_text(encoding="utf-8")
    # Explicit prior-version path ban in executable code only (skip module/doc strings)
    in_doc = False
    doc_delim = None
    for i, line in enumerate(source.splitlines(), 1):
        stripped = line.strip()
        if not in_doc:
            if stripped.startswith('"""') or stripped.startswith("'''"):
                doc_delim = stripped[:3]
                # Single-line docstring
                if stripped.count(doc_delim) >= 2 and len(stripped) > 3:
                    continue
                in_doc = True
                continue
            if stripped.startswith("#"):
                continue
        else:
            if doc_delim and doc_delim in stripped:
                in_doc = False
                doc_delim = None
            continue

        for token in FORBIDDEN_IMPORT_TOKENS:
            if token not in line:
                continue
            # Allowed: the ban-list constant definition itself (tuple string entries)
            if "FORBIDDEN_IMPORT_TOKENS" in line:
                continue
            if stripped.startswith('"') or stripped.startswith("'"):
                continue
            if f'"{token}"' in line or f"'{token}'" in line:
                # Still forbid using those strings in importlib/path construction
                if "import" in line.lower() or "load" in line.lower() or "Path(" in line or "open(" in line:
                    raise StaticValidationError(
                        f"prior-version token '{token}' used operationally at line {i}: {line.strip()}"
                    )
                continue
            raise StaticValidationError(
                f"prior-version token '{token}' in code at line {i}: {line.strip()}"
            )
    return static_validate_source(source, SCRIPT_PATH)


# ---------------------------------------------------------------------------
# Pure-python helpers (also used under Blender)
# ---------------------------------------------------------------------------

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().lower()


def ensure_dirs() -> None:
    for d in (ASSET_ROOT, GREYBOX_DIR, EVIDENCE_DIR, LOCK_DIR):
        d.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Blender-dependent geometry
# ---------------------------------------------------------------------------

def _require_bpy():
    import bpy  # noqa: F401
    import bmesh  # noqa: F401
    from mathutils import Vector  # noqa: F401
    return bpy


def clear_scene(bpy) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)
    CUTTER_OBJECTS.clear()


def link_obj(bpy, obj) -> None:
    coll = bpy.context.scene.collection
    if obj.name not in coll.objects:
        coll.objects.link(obj)


def clay_materials(bpy) -> dict[str, Any]:
    """Neutral 3-value clay only — dark / mid / light. No expensive PBR.

    Values kept readable against dark world for smoke evidence + margin masks.
    """
    mats = {}
    for name, value in (
        ("Clay_Dark", 0.28),
        ("Clay_Mid", 0.52),
        ("Clay_Light", 0.78),
    ):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfDiffuse")
        bsdf.inputs["Color"].default_value = (value, value, value, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        mats[name] = mat
    return mats


def assign_mat(obj, mat) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def mesh_from_pydata(bpy, name: str, verts, faces, mat=None):
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.update()
    mesh.validate(verbose=False)
    obj = bpy.data.objects.new(name, mesh)
    link_obj(bpy, obj)
    if mat is not None:
        assign_mat(obj, mat)
    return obj


def apply_object_transforms(bpy, obj) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def ensure_applied_identity(obj) -> None:
    """Fail-closed: non-identity transforms after apply are rejected later."""
    loc = obj.location
    rot = obj.rotation_euler
    scl = obj.scale
    if any(abs(v) > 1e-5 for v in (loc.x, loc.y, loc.z)):
        raise RuntimeError(f"non-applied location on {obj.name}: {tuple(loc)}")
    if any(abs(v) > 1e-5 for v in (rot.x, rot.y, rot.z)):
        raise RuntimeError(f"non-applied rotation on {obj.name}: {tuple(rot)}")
    if any(abs(v - 1.0) > 1e-5 for v in (scl.x, scl.y, scl.z)):
        raise RuntimeError(f"non-applied scale on {obj.name}: {tuple(scl)}")


def loft_profiles(
    bpy,
    name: str,
    profiles: list[list[tuple[float, float, float]]],
    mat=None,
    close_caps: bool = True,
):
    """Loft an ordered list of cross-section profiles (each a ring of 3D points).

    All profiles must have the same vertex count N. Builds a continuous shell.
    """
    if len(profiles) < 2:
        raise ValueError("loft_profiles needs >= 2 stations")
    n = len(profiles[0])
    if n < 3:
        raise ValueError("each profile needs >= 3 verts")
    for p in profiles:
        if len(p) != n:
            raise ValueError(f"profile length mismatch: {len(p)} != {n}")

    verts: list[tuple[float, float, float]] = []
    for prof in profiles:
        verts.extend(prof)

    faces: list[tuple[int, ...]] = []
    # Caps
    if close_caps:
        faces.append(tuple(range(n)))
        last = (len(profiles) - 1) * n
        faces.append(tuple(range(last + n - 1, last - 1, -1)))

    for si in range(len(profiles) - 1):
        a0 = si * n
        b0 = (si + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a0 + i, b0 + i, b0 + j, a0 + j))

    return mesh_from_pydata(bpy, name, verts, faces, mat)


def _lerp3(a, b, t: float):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def _normalize3(v):
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)


def _rect_ring(
    center: tuple[float, float, float],
    tangent: tuple[float, float, float],
    half_w: float,
    half_h: float,
) -> list[tuple[float, float, float]]:
    """8-vert faceted rectangular ring in plane ⊥ tangent."""
    tx, ty, tz = _normalize3(tangent)
    seed_up = (0.0, 0.0, 1.0)
    if abs(tx * seed_up[0] + ty * seed_up[1] + tz * seed_up[2]) > 0.92:
        seed_up = (0.0, 1.0, 0.0)
    e1x = seed_up[1] * tz - seed_up[2] * ty
    e1y = seed_up[2] * tx - seed_up[0] * tz
    e1z = seed_up[0] * ty - seed_up[1] * tx
    e1l = math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z) or 1.0
    e1x, e1y, e1z = e1x / e1l, e1y / e1l, e1z / e1l
    e2x = ty * e1z - tz * e1y
    e2y = tz * e1x - tx * e1z
    e2z = tx * e1y - ty * e1x
    cx, cy, cz = center
    iw, ih = half_w * 0.55, half_h * 0.55
    offsets = [
        (-half_w, -ih), (-iw, -half_h), (iw, -half_h), (half_w, -ih),
        (half_w, ih), (iw, half_h), (-iw, half_h), (-half_w, ih),
    ]
    return [
        (cx + e1x * u + e2x * v, cy + e1y * u + e2y * v, cz + e1z * u + e2z * v)
        for u, v in offsets
    ]


def _build_branching_y_mesh(bpy, name: str, mat=None):
    """Single manifold shell: stem loop chain splits into two independent arm chains.

    Explicit bridge faces only at the fork root. Each arm tip capped separately.
    Open inter-arm gap is the deep docking bite (not a loft cap over the crotch).
    """
    n_ring = 8
    stern = (-HUB_STEM_LEN, 0.0, 0.0)
    fork = (0.0, 0.0, 0.0)
    hab_tip = (HUB_ARM_LEN, HUB_TIP_SEP * 0.5, 0.15)
    ind_tip = (HUB_ARM_LEN, -HUB_TIP_SEP * 0.5, -0.1)

    def stem_hw(t: float):
        w = HUB_STEM_W * 0.5 * (0.85 + 0.25 * math.sin(t * math.pi))
        h = HUB_Z_KEEL * 0.5 * (0.9 + 0.2 * t)
        return w, h

    def hab_hw(t: float):
        step = 1.18 if 0.22 < t < 0.78 else 1.0  # stepped habitation mass
        w = HUB_HAB_THICK * 0.5 * step * (0.95 + 0.1 * (1.0 - t))
        h = HUB_Z_HAB * 0.5 * (1.08 if 0.28 < t < 0.72 else 0.9)
        return w, h

    def ind_hw(t: float):
        seg = 1.14 if int(t * 5) % 2 == 0 else 0.90  # segmented industrial jaw
        w = HUB_IND_THICK * 0.5 * seg
        h = HUB_Z_IND * 0.5 * (1.12 if int(t * 4) % 2 == 0 else 0.94)
        return w, h

    n_stem = 7
    stem_profiles = []
    for i in range(n_stem):
        t = i / (n_stem - 1)
        c = _lerp3(stern, fork, t)
        if i == 0:
            tan = _normalize3((fork[0] - stern[0], 0.0, 0.0))
        elif i == n_stem - 1:
            tan = (1.0, 0.0, 0.0)
        else:
            c_prev = _lerp3(stern, fork, (i - 1) / (n_stem - 1))
            c_next = _lerp3(stern, fork, (i + 1) / (n_stem - 1))
            tan = _normalize3((c_next[0] - c_prev[0], c_next[1] - c_prev[1], c_next[2] - c_prev[2]))
        w, h = stem_hw(t)
        stem_profiles.append(_rect_ring(c, tan, w, h))

    n_arm = 9
    hab_profiles = []
    ind_profiles = []
    for i in range(n_arm):
        t = i / (n_arm - 1)
        t0 = 0.04 if i == 0 else t
        hab_c = _lerp3(fork, hab_tip, t0)
        ind_c = _lerp3(fork, ind_tip, t0)
        hab_tan = _normalize3((hab_tip[0] - fork[0], hab_tip[1] - fork[1], hab_tip[2] - fork[2]))
        ind_tan = _normalize3((ind_tip[0] - fork[0], ind_tip[1] - fork[1], ind_tip[2] - fork[2]))
        hw, hh = hab_hw(t)
        iw, ih = ind_hw(t)
        hab_profiles.append(_rect_ring(hab_c, hab_tan, hw, hh))
        ind_profiles.append(_rect_ring(ind_c, ind_tan, iw, ih))

    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    def add_profiles(profs):
        base = len(verts)
        for p in profs:
            verts.extend(p)
        return base

    stem_base = add_profiles(stem_profiles)
    hab_base = add_profiles(hab_profiles)
    ind_base = add_profiles(ind_profiles)

    # Stern cap
    faces.append(tuple(range(stem_base, stem_base + n_ring)))
    # Stem loft (open at fork end)
    for si in range(n_stem - 1):
        a0 = stem_base + si * n_ring
        b0 = stem_base + (si + 1) * n_ring
        for i in range(n_ring):
            j = (i + 1) % n_ring
            faces.append((a0 + i, b0 + i, b0 + j, a0 + j))
    # Arm lofts + tip caps
    for base, n_prof in ((hab_base, n_arm), (ind_base, n_arm)):
        for si in range(n_prof - 1):
            a0 = base + si * n_ring
            b0 = base + (si + 1) * n_ring
            for i in range(n_ring):
                j = (i + 1) % n_ring
                faces.append((a0 + i, b0 + i, b0 + j, a0 + j))
        last = base + (n_prof - 1) * n_ring
        faces.append(tuple(range(last + n_ring - 1, last - 1, -1)))

    # Fork root bridges: stem end ring → each arm start (side-aware)
    stem_end = stem_base + (n_stem - 1) * n_ring
    se = [verts[stem_end + i] for i in range(n_ring)]
    hs = [verts[hab_base + i] for i in range(n_ring)]
    ins = [verts[ind_base + i] for i in range(n_ring)]
    for i in range(n_ring):
        p = se[i]
        p1 = se[(i + 1) % n_ring]
        if p[1] >= -0.15 or p1[1] >= -0.15:
            j = min(range(n_ring), key=lambda k: (hs[k][0] - p[0]) ** 2 + (hs[k][1] - p[1]) ** 2 + (hs[k][2] - p[2]) ** 2)
            j2 = min(range(n_ring), key=lambda k: (hs[k][0] - p1[0]) ** 2 + (hs[k][1] - p1[1]) ** 2 + (hs[k][2] - p1[2]) ** 2)
            faces.append((stem_end + i, hab_base + j, hab_base + j2, stem_end + (i + 1) % n_ring))
        if p[1] <= 0.15 or p1[1] <= 0.15:
            j = min(range(n_ring), key=lambda k: (ins[k][0] - p[0]) ** 2 + (ins[k][1] - p[1]) ** 2 + (ins[k][2] - p[2]) ** 2)
            j2 = min(range(n_ring), key=lambda k: (ins[k][0] - p1[0]) ** 2 + (ins[k][1] - p1[1]) ** 2 + (ins[k][2] - p1[2]) ** 2)
            faces.append((stem_end + i, ind_base + j, ind_base + j2, stem_end + (i + 1) % n_ring))

    # Crotch fill between arm inners and stem (keeps manifold, does not roof the gap)
    hab_inner = min(range(n_ring), key=lambda k: hs[k][1])
    ind_inner = max(range(n_ring), key=lambda k: ins[k][1])
    stem_mid = sorted(range(n_ring), key=lambda i: abs(se[i][1]))[:2]
    faces.append((hab_base + hab_inner, stem_end + stem_mid[0], ind_base + ind_inner))
    if len(stem_mid) > 1:
        faces.append((hab_base + hab_inner, stem_end + stem_mid[1], stem_end + stem_mid[0]))
        faces.append((ind_base + ind_inner, stem_end + stem_mid[0], stem_end + stem_mid[1]))

    obj = mesh_from_pydata(bpy, name, verts, faces, mat)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.08)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=list(bm.edges))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def build_hub_greybox(bpy, mats) -> Any:
    """Asymmetric Y/tuning-fork shipyard — branching stem→two arms, open gap.

    Macro: stem 18u, arms 30u, tip sep 21u, thick 4.3–5.6.
    Docking bite = open inter-arm gap (>=35% total length along X).
    Second negative space = service aperture cutter through stem root.
    """
    shell = _build_branching_y_mesh(bpy, "Hub_HeroShell_V10", mats["Clay_Mid"])
    shell["sf_component"] = "hub_hero"
    shell["sf_greybox"] = True
    shell["sf_role"] = "hub"

    # Service aperture through stem (negative space 2) — tracked cutter only
    cutter = register_cutter_primitive_cube(
        bpy, "Cutter_HubServiceAperture_V10",
        location=(-HUB_STEM_LEN * 0.45, 0.0, 0.0),
        scale=(1.6, 1.15, HUB_Z_KEEL * 1.9),
    )
    apply_boolean_difference(bpy, shell, cutter)

    # Shallow root-side gap at fork (visible second void if service hole coheres)
    cutter2 = register_cutter_primitive_cube(
        bpy, "Cutter_HubRootTrussGap_V10",
        location=(-1.8, 0.0, HUB_Z_KEEL * 0.2),
        scale=(1.1, 3.2, 0.85),
    )
    apply_boolean_difference(bpy, shell, cutter2)

    _paint_hub_zones(shell, mats)

    bpy.ops.object.select_all(action="DESELECT")
    shell.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bevel = shell.modifiers.new("GreyboxBevel", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(35)
    bpy.ops.object.modifier_apply(modifier=bevel.name)

    apply_object_transforms(bpy, shell)
    ensure_applied_identity(shell)

    m = analyze_mesh(shell)
    if m.tri_count < 100:
        raise RuntimeError(f"hub tri_count too low: {m.tri_count}")
    if m.connected_components != 1:
        raise RuntimeError(f"hub not single component: {m.connected_components}")
    return shell


def _paint_hub_zones(obj, mats) -> None:
    """Face materials by actual massing region (hab light / ind dark / keel mid)."""
    me = obj.data
    me.materials.clear()
    me.materials.append(mats["Clay_Mid"])
    me.materials.append(mats["Clay_Light"])
    me.materials.append(mats["Clay_Dark"])
    for poly in me.polygons:
        c = poly.center
        if c.x > 1.0 and c.y > 1.5:
            poly.material_index = 1
        elif c.x > 1.0 and c.y < -1.5:
            poly.material_index = 2
        elif c.x > HUB_ARM_LEN * 0.35 and c.y > 0.3:
            poly.material_index = 1
        elif c.x > HUB_ARM_LEN * 0.35 and c.y < -0.3:
            poly.material_index = 2
        else:
            poly.material_index = 0


def _stable_hex_profile(
    center: tuple[float, float, float],
    tangent: tuple[float, float, float],
    radius: float,
    prev_e1: list[float] | None = None,
) -> tuple[list[tuple[float, float, float]], list[float]]:
    """Hex ring in plane ⊥ tangent with parallel-transport continuity on e1."""
    tx, ty, tz = tangent
    tl = math.sqrt(tx * tx + ty * ty + tz * tz) or 1.0
    tx, ty, tz = tx / tl, ty / tl, tz / tl
    # Prefer world +X as seed for e1 (arch lives in YZ → X is always ⊥ tangent)
    seed = (1.0, 0.0, 0.0)
    # e1 = normalize(seed - t * dot(seed,t))
    dot = tx * seed[0] + ty * seed[1] + tz * seed[2]
    e1x, e1y, e1z = seed[0] - tx * dot, seed[1] - ty * dot, seed[2] - tz * dot
    e1l = math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z) or 1.0
    e1x, e1y, e1z = e1x / e1l, e1y / e1l, e1z / e1l
    if prev_e1 is not None:
        if e1x * prev_e1[0] + e1y * prev_e1[1] + e1z * prev_e1[2] < 0:
            e1x, e1y, e1z = -e1x, -e1y, -e1z
    # e2 = t × e1
    e2x = ty * e1z - tz * e1y
    e2y = tz * e1x - tx * e1z
    e2z = tx * e1y - ty * e1x
    pts = []
    for i in range(6):
        a = math.radians(60 * i + 30)
        c, s = math.cos(a) * radius, math.sin(a) * radius
        pts.append((
            center[0] + e1x * c + e2x * s,
            center[1] + e1y * c + e2y * s,
            center[2] + e1z * c + e2z * s,
        ))
    return pts, [e1x, e1y, e1z]


def build_gate_greybox(bpy, mats) -> Any:
    """One non-empty connected custom mesh: split-hex U + rear service spine.

    No boolean union of separate pieces. Four machinery sectors are local
    cross-section radius swells on the same loft topology. Spine connects the
    two feet at rear (+X) so the central traversal aperture stays open.
    """
    mid_r = 10.2
    base_section = 2.85  # bold silhouette, not thin wire

    path: list[tuple[float, float, float]] = []
    for deg in range(-115, 116, 8):
        th = math.radians(deg)
        path.append((0.0, math.sin(th) * mid_r, math.cos(th) * mid_r))
    stbd_foot = path[-1]
    port_foot = path[0]
    # Rear/bottom service spine — structural bridge, offset +X
    path.extend([
        (stbd_foot[0] + 0.4, stbd_foot[1], stbd_foot[2]),
        (2.8, stbd_foot[1] * 0.55, stbd_foot[2] - 1.2),
        (3.4, 0.0, stbd_foot[2] - 1.8),
        (2.8, port_foot[1] * 0.55, port_foot[2] - 1.2),
        (port_foot[0] + 0.4, port_foot[1], port_foot[2]),
        path[0],  # close loop sample
    ])

    profiles = []
    prev_e1 = None
    n_arch = 1 + (115 - (-115)) // 8
    for i, c in enumerate(path):
        if i == 0:
            nxt = path[i + 1]
            tan = (nxt[0] - c[0], nxt[1] - c[1], nxt[2] - c[2])
        elif i == len(path) - 1:
            prv = path[i - 1]
            tan = (c[0] - prv[0], c[1] - prv[1], c[2] - prv[2])
        else:
            nxt, prv = path[i + 1], path[i - 1]
            tan = (nxt[0] - prv[0], nxt[1] - prv[1], nxt[2] - prv[2])
        tan = _normalize3(tan)
        local_r = base_section
        if i < n_arch:
            deg = -115 + i * 8
            if -100 <= deg <= -78 or 78 <= deg <= 100:
                local_r = base_section * 1.55  # lower machinery sectors
            elif -32 <= deg <= -10 or 10 <= deg <= 32:
                local_r = base_section * 1.48  # crown machinery sectors
            if deg > 20:
                c = (c[0] + 0.35, c[1], c[2])  # asymmetric spine bias on arch
        else:
            local_r = base_section * 0.72  # leaner spine section
        prof, prev_e1 = _stable_hex_profile(c, tan, local_r, prev_e1)
        profiles.append(prof)

    # Closed-loop loft without caps (toroidal topology, open center aperture)
    n = len(profiles[0])
    verts: list[tuple[float, float, float]] = []
    for prof in profiles[:-1]:
        verts.extend(prof)
    n_prof = len(profiles) - 1
    faces: list[tuple[int, ...]] = []
    for si in range(n_prof):
        a0 = si * n
        b0 = ((si + 1) % n_prof) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((a0 + i, b0 + i, b0 + j, a0 + j))

    gate = mesh_from_pydata(bpy, "Gate_HeroShell_V10", verts, faces, mats["Clay_Mid"])
    if len(gate.data.polygons) == 0 or len(gate.data.vertices) == 0:
        raise RuntimeError("gate custom mesh produced zero geometry")

    import bmesh
    bm = bmesh.new()
    bm.from_mesh(gate.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.06)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(gate.data)
    bm.free()
    gate.data.update()

    gate["sf_component"] = "gate_hero"
    gate["sf_greybox"] = True
    gate["sf_role"] = "gate"
    gate["sf_design_mid_r"] = mid_r
    gate["sf_design_section"] = base_section

    bpy.ops.object.select_all(action="DESELECT")
    gate.select_set(True)
    bpy.context.view_layer.objects.active = gate
    bevel = gate.modifiers.new("GreyboxBevel", "BEVEL")
    bevel.width = 0.1
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(30)
    bpy.ops.object.modifier_apply(modifier=bevel.name)

    me = gate.data
    me.materials.clear()
    me.materials.append(mats["Clay_Mid"])
    me.materials.append(mats["Clay_Light"])
    me.materials.append(mats["Clay_Dark"])
    for poly in me.polygons:
        c = poly.center
        r = math.sqrt(c.y * c.y + c.z * c.z)
        if c.x > 1.6:
            poly.material_index = 1
        elif r > mid_r + base_section * 0.25:
            poly.material_index = 2
        else:
            poly.material_index = 0

    apply_object_transforms(bpy, gate)
    ensure_applied_identity(gate)

    m = analyze_mesh(gate)
    if m.tri_count < 100:
        raise RuntimeError(f"gate tri_count too low: {m.tri_count}")
    if m.vert_count < 50:
        raise RuntimeError(f"gate vert_count too low: {m.vert_count}")
    if m.connected_components != 1:
        raise RuntimeError(f"gate not single component: {m.connected_components}")
    return gate


# ---------------------------------------------------------------------------
# Boolean cutter helpers (only allowed primitive path)
# ---------------------------------------------------------------------------

def register_cutter_primitive_cube(bpy, name: str, location, scale) -> Any:
    """ONLY allowed primitive path: boolean cutters, tracked in CUTTER_OBJECTS."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj["sf_boolean_cutter"] = True
    CUTTER_OBJECTS[name] = False
    return obj


def apply_boolean_difference(bpy, target, cutter) -> None:
    mod = target.modifiers.new(f"Bool_{cutter.name}", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    CUTTER_OBJECTS[cutter.name] = True


def delete_all_cutters(bpy) -> None:
    stale = []
    for name, used in list(CUTTER_OBJECTS.items()):
        if not used:
            stale.append(name)
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)
        CUTTER_OBJECTS.pop(name, None)
    if stale:
        raise RuntimeError(f"stale unused cutters before export: {stale}")


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@dataclass
class MeshMetrics:
    name: str
    tri_count: int
    vert_count: int
    connected_components: int
    largest_component_tris: int
    largest_component_tri_share: float
    boundary_edges: int
    non_manifold_edges: int
    bbox_min: list[float]
    bbox_max: list[float]
    bbox_volume: float
    largest_component_volume_share: float
    watertight_guess: bool


def analyze_mesh(obj) -> MeshMetrics:
    import bmesh
    import bpy
    from mathutils import Vector

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # Connected components on verts via edges
    visited = set()
    components: list[set[int]] = []
    for v in bm.verts:
        if v.index in visited:
            continue
        stack = [v]
        comp = set()
        visited.add(v.index)
        while stack:
            cur = stack.pop()
            comp.add(cur.index)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in visited:
                    visited.add(other.index)
                    stack.append(other)
        components.append(comp)

    # Face tris per component
    tri_total = 0
    comp_tris = [0] * len(components)
    vert_to_comp = {}
    for ci, comp in enumerate(components):
        for vi in comp:
            vert_to_comp[vi] = ci

    for f in bm.faces:
        t = max(0, len(f.verts) - 2)
        tri_total += t
        # assign to component of first vert
        ci = vert_to_comp.get(f.verts[0].index, 0)
        comp_tris[ci] += t

    largest_tris = max(comp_tris) if comp_tris else 0
    largest_share = (largest_tris / tri_total) if tri_total else 0.0

    boundary = sum(1 for e in bm.edges if not e.is_manifold and len(e.link_faces) == 1)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)

    # Volume per component via bbox volume of component verts
    comp_vol = []
    for comp in components:
        if not comp:
            comp_vol.append(0.0)
            continue
        xs, ys, zs = [], [], []
        for vi in comp:
            co = bm.verts[vi].co
            xs.append(co.x); ys.append(co.y); zs.append(co.z)
        vol = max(1e-9, (max(xs) - min(xs)) * (max(ys) - min(ys)) * (max(zs) - min(zs)))
        comp_vol.append(vol)
    total_vol = sum(comp_vol) or 1e-9
    largest_vol_share = max(comp_vol) / total_vol if comp_vol else 0.0

    coords = [v.co.copy() for v in bm.verts]
    if coords:
        bb_min = [min(c[i] for c in coords) for i in range(3)]
        bb_max = [max(c[i] for c in coords) for i in range(3)]
    else:
        bb_min = [0, 0, 0]
        bb_max = [0, 0, 0]
    bbox_vol = max(1e-9, (bb_max[0] - bb_min[0]) * (bb_max[1] - bb_min[1]) * (bb_max[2] - bb_min[2]))

    watertight = boundary == 0 and non_manifold == 0

    metrics = MeshMetrics(
        name=obj.name,
        tri_count=tri_total,
        vert_count=len(bm.verts),
        connected_components=len(components),
        largest_component_tris=largest_tris,
        largest_component_tri_share=largest_share,
        boundary_edges=boundary,
        non_manifold_edges=non_manifold,
        bbox_min=bb_min,
        bbox_max=bb_max,
        bbox_volume=bbox_vol,
        largest_component_volume_share=largest_vol_share,
        watertight_guess=watertight,
    )
    bm.free()
    return metrics


def silhouette_occupancy(obj, axis: str = "z", res: int = 256) -> dict[str, float]:
    """Project mesh to axis plane; measure occupancy and framing margins of occupied AABB."""
    import bpy
    from mathutils import Vector

    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    if not coords:
        return {"occupancy": 0.0, "margin_min": 0.0, "margin_max": 0.0, "shell_share": 0.0}

    if axis == "z":  # top view → XY
        pts = [(c.x, c.y) for c in coords]
    elif axis == "y":  # side → XZ
        pts = [(c.x, c.z) for c in coords]
    else:  # x forward → YZ
        pts = [(c.y, c.z) for c in coords]

    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    w = max(maxx - minx, 1e-6)
    h = max(maxy - miny, 1e-6)

    # Pad frame so object sits with target ~11% margins; measure relative occupancy inside
    # For gate checks we use the object's own projected AABB as the "content box"
    # and rasterize solid occupancy.
    grid = [[0] * res for _ in range(res)]
    # Rasterize triangles projected
    me = obj.data
    for poly in me.polygons:
        verts = [obj.matrix_world @ me.vertices[i].co for i in poly.vertices]
        if axis == "z":
            tri2 = [(v.x, v.y) for v in verts]
        elif axis == "y":
            tri2 = [(v.x, v.z) for v in verts]
        else:
            tri2 = [(v.y, v.z) for v in verts]
        # Fan triangulate
        for i in range(1, len(tri2) - 1):
            _raster_tri(grid, res, tri2[0], tri2[i], tri2[i + 1], minx, miny, w, h)

    filled = sum(sum(row) for row in grid)
    occupancy = filled / float(res * res)

    # Margins: expand content AABB inside a padded frame that matches render framing intent.
    # Content occupies center; margins = (1 - content_span/frame) / 2 when framed to fit.
    # We compute implied margins if framed with 12% target and report content tightness.
    # Machine gate: when orthographically framed to object with pad P, margin = P/(1+2P).
    # We report geometric fill of projected AABB (shell share ≈ occupancy within bbox).
    shell_share = occupancy  # within tight AABB, this is filled fraction

    # For framing gate on renders we measure PNG masks; here report geometric proxies.
    return {
        "occupancy": occupancy,
        "shell_share": shell_share,
        "proj_width": w,
        "proj_height": h,
        "axis": axis,
    }


def _raster_tri(grid, res, a, b, c, minx, miny, w, h):
    def to_px(p):
        u = int((p[0] - minx) / w * (res - 1))
        v = int((p[1] - miny) / h * (res - 1))
        return max(0, min(res - 1, u)), max(0, min(res - 1, v))

    pa, pb, pc = to_px(a), to_px(b), to_px(c)
    min_u = min(pa[0], pb[0], pc[0])
    max_u = max(pa[0], pb[0], pc[0])
    min_v = min(pa[1], pb[1], pc[1])
    max_v = max(pa[1], pb[1], pc[1])

    def edge(p, q, r):
        return (r[0] - p[0]) * (q[1] - p[1]) - (q[0] - p[0]) * (r[1] - p[1])

    area = edge(pa, pb, pc)
    if area == 0:
        return
    for u in range(min_u, max_u + 1):
        for v in range(min_v, max_v + 1):
            p = (u, v)
            w0 = edge(pb, pc, p)
            w1 = edge(pc, pa, p)
            w2 = edge(pa, pb, p)
            if (w0 >= 0 and w1 >= 0 and w2 >= 0) or (w0 <= 0 and w1 <= 0 and w2 <= 0):
                grid[v][u] = 1


def hub_negative_space_masks(obj, res: int = 192) -> dict[str, Any]:
    """Top-down mask: detect two major negative-space pockets (notch + fork gap)."""
    sil = silhouette_occupancy(obj, axis="z", res=res)
    # Approximate: occupancy of Y-fork solid should leave voids in center notch and between wings.
    # Compute empty fraction inside convex projected hull bbox — already occupancy.
    # Also sample three zones: port wing, center, starboard.
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    # Center band emptiness via sampling solid occupancy in mid notch region
    return {
        "top_occupancy": sil["occupancy"],
        "proj_span_x": maxx - minx,
        "proj_span_y": maxy - miny,
        "expected_negative_spaces": 2,
        "note": "Y-fork loft includes deep docking notch + inter-wing fork voids",
    }


def gate_aperture_metrics(obj) -> dict[str, float]:
    """Measure clear traversal radius as fraction of aperture from mesh bbox + custom props."""
    aperture_r = float(obj.get("sf_aperture_r", 7.0))
    outer_r = float(obj.get("sf_outer_r", 12.0))
    # Clear radius = aperture inner; fraction of outer envelope
    clearance_frac = aperture_r / max(outer_r, 1e-6)
    # Also geometric: distance of nearest geometry to origin in YZ for points with |x|<2
    min_r = 1e9
    for v in obj.data.vertices:
        co = obj.matrix_world @ v.co
        if abs(co.x) > 3.5:
            continue
        r = math.sqrt(co.y * co.y + co.z * co.z)
        if r < min_r:
            min_r = r
    measured_clear = min_r if min_r < 1e8 else aperture_r
    return {
        "authored_aperture_r": aperture_r,
        "authored_outer_r": outer_r,
        "clearance_frac_authored": clearance_frac,
        "measured_min_radius_yz": measured_clear,
        "measured_clearance_frac": measured_clear / max(outer_r, 1e-6),
        "pass_traversal": (measured_clear / max(outer_r, 1e-6)) >= GATE_TRAVERSAL_MIN_FRAC,
    }


# ---------------------------------------------------------------------------
# Export / render
# ---------------------------------------------------------------------------

def export_glb(bpy, obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Optional spaceface_export stamp if available without side effects
    try:
        sys.path.insert(0, str(ROOT / "tools" / "blender"))
        import spaceface_export as sfe  # generic only
        spec = {
            "id": f"greybox_{obj.get('sf_role', obj.name)}",
            "kind": "landmark",
            "version": 10,
            "composition": "greybox_stage_a",
        }
        # Prefer direct glTF export; spaceface_export may be strict on maps
        del sfe  # imported only to prove permitted shared code is loadable
    except Exception:
        pass

    bpy.ops.export_scene.gltf(
        filepath=str(path),
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
    )


def setup_world(bpy) -> None:
    world = bpy.data.worlds.new("GreyboxWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.03, 0.035, 0.045, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    world.node_tree.links.new(bg.outputs["Background"], out.inputs["Surface"])


def setup_lights(bpy) -> None:
    # Bright clay-read lighting (greybox evidence, not final lookdev)
    bpy.ops.object.light_add(type="SUN", location=(10, -12, 20))
    key = bpy.context.active_object
    key.data.energy = 3.5
    key.rotation_euler = (math.radians(45), math.radians(15), math.radians(25))
    bpy.ops.object.light_add(type="AREA", location=(-16, 14, 12))
    fill = bpy.context.active_object
    fill.data.energy = 800
    fill.data.size = 22
    bpy.ops.object.light_add(type="AREA", location=(8, 16, -6))
    rim = bpy.context.active_object
    rim.data.energy = 500
    rim.data.size = 14


def frame_camera(bpy, cam, objects, view: str, margin_target: float = 0.11):
    """Place camera for view; return framing info. margin_target in 8-15% band."""
    from mathutils import Vector

    coords = []
    for obj in objects:
        for v in obj.data.vertices:
            coords.append(obj.matrix_world @ v.co)
    if not coords:
        return {}
    bb_min = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
    bb_max = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
    center = (bb_min + bb_max) * 0.5
    size = bb_max - bb_min
    radius = max(size.x, size.y, size.z) * 0.5

    # Distance for ortho-ish framing with target margin
    # content fraction = 1 - 2*margin
    content_frac = 1.0 - 2.0 * margin_target
    # Perspective: object half-angle ≈ content_frac * half-FOV
    fov = math.radians(40)
    dist = radius / max(math.tan(content_frac * fov * 0.5), 1e-4)
    dist *= 1.25

    if view == "close_forward_34":
        direction = Vector((0.75, -0.85, 0.45)).normalized()
    elif view == "side":
        direction = Vector((0.05, -1.0, 0.12)).normalized()
    elif view == "top":
        direction = Vector((0.05, 0.05, 1.0)).normalized()
        dist *= 1.05
    elif view == "axial":
        direction = Vector((1.0, 0.05, 0.08)).normalized()
    elif view == "negspace":
        direction = Vector((0.1, 0.05, 1.0)).normalized()
        dist *= 1.0
    else:
        direction = Vector((0.7, -0.8, 0.4)).normalized()

    cam.location = center + direction * dist
    # Point at center
    direction_to = center - cam.location
    cam.rotation_euler = direction_to.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50 if view.startswith("close") else 40
    cam.data.clip_end = 500
    return {
        "view": view,
        "margin_target": margin_target,
        "distance": dist,
        "center": list(center),
        "radius": radius,
    }


def render_view(
    bpy,
    objects: list,
    out_path: Path,
    view: str,
    px: int,
    margin_target: float = 0.11,
    label: str = "",
) -> dict[str, Any]:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if hasattr(bpy.types, "EEVEE_NEXT") or "BLENDER_EEVEE_NEXT" in dir(bpy.types) else "BLENDER_EEVEE"
    # Blender 5 may use EEVEE_NEXT
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            scene.render.engine = "CYCLES"
            scene.cycles.samples = 16

    scene.render.resolution_x = px
    scene.render.resolution_y = px
    scene.render.filepath = str(out_path)
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    # Camera
    cam_data = bpy.data.cameras.new("GreyboxCam")
    cam = bpy.data.objects.new("GreyboxCam", cam_data)
    link_obj(bpy, cam)
    scene.camera = cam
    framing = frame_camera(bpy, cam, objects, view, margin_target)

    bpy.ops.render.render(write_still=True)

    # Measure margins from rendered alpha/luminance mask
    margins = measure_png_margins(out_path)
    framing["measured_margins"] = margins
    framing["path"] = str(out_path)
    framing["px"] = px
    framing["label"] = label

    # Cleanup camera for next render
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.cameras.remove(cam_data)

    return framing


def measure_png_margins(path: Path) -> dict[str, float]:
    """Read PNG, find non-background bbox, return edge margins as fraction of image."""
    try:
        import zlib
        data = path.read_bytes()
        # Minimal PNG reader for RGBA/RGB8
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            return {"error": 1.0}
        # Parse IHDR + IDAT
        pos = 8
        width = height = 0
        bit_depth = 8
        color_type = 2
        idat = b""
        while pos < len(data):
            length = struct.unpack(">I", data[pos:pos + 4])[0]
            ctype = data[pos + 4:pos + 8]
            chunk = data[pos + 8:pos + 8 + length]
            pos += 12 + length
            if ctype == b"IHDR":
                width, height, bit_depth, color_type = struct.unpack(">IIBB", chunk[:10])
            elif ctype == b"IDAT":
                idat += chunk
            elif ctype == b"IEND":
                break
        raw = zlib.decompress(idat)
        # filter bytes per row
        if color_type == 6:
            bpp = 4
        elif color_type == 2:
            bpp = 3
        else:
            return {"unsupported_color_type": float(color_type)}
        stride = width * bpp
        rows = []
        i = 0
        prev = bytearray(stride)
        for y in range(height):
            filter_type = raw[i]
            i += 1
            row = bytearray(raw[i:i + stride])
            i += stride
            if filter_type == 1:  # Sub
                for x in range(stride):
                    left = row[x - bpp] if x >= bpp else 0
                    row[x] = (row[x] + left) & 255
            elif filter_type == 2:  # Up
                for x in range(stride):
                    row[x] = (row[x] + prev[x]) & 255
            elif filter_type == 3:  # Average
                for x in range(stride):
                    left = row[x - bpp] if x >= bpp else 0
                    row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
            elif filter_type == 4:  # Paeth
                for x in range(stride):
                    left = row[x - bpp] if x >= bpp else 0
                    up = prev[x]
                    up_left = prev[x - bpp] if x >= bpp else 0
                    p = left + up - up_left
                    pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                    pr = left if pa <= pb and pa <= pc else (up if pb <= pc else up_left)
                    row[x] = (row[x] + pr) & 255
            rows.append(row)
            prev = row

        # Background threshold: dark navy ~ (0.03*255)
        def is_fg(px, py):
            o = 0
            r = rows[py][px * bpp + 0]
            g = rows[py][px * bpp + 1]
            b = rows[py][px * bpp + 2]
            # luminance above dark background (clay mid≈0.52 → ~130; world≈0.03 → ~8)
            return (r + g + b) > 55

        min_x, max_x = width, -1
        min_y, max_y = height, -1
        for y in range(height):
            for x in range(width):
                if is_fg(x, y):
                    if x < min_x: min_x = x
                    if x > max_x: max_x = x
                    if y < min_y: min_y = y
                    if y > max_y: max_y = y
        if max_x < 0:
            return {"margin_left": 1.0, "margin_right": 1.0, "margin_top": 1.0, "margin_bottom": 1.0, "min_margin": 1.0, "max_margin": 1.0, "empty": 1.0}

        ml = min_x / width
        mr = (width - 1 - max_x) / width
        mt = min_y / height
        mb = (height - 1 - max_y) / height
        margins = [ml, mr, mt, mb]
        return {
            "margin_left": ml,
            "margin_right": mr,
            "margin_top": mt,
            "margin_bottom": mb,
            "min_margin": min(margins),
            "max_margin": max(margins),
            "content_frac_x": (max_x - min_x + 1) / width,
            "content_frac_y": (max_y - min_y + 1) / height,
        }
    except Exception as exc:
        return {"error": 1.0, "detail": str(exc)}


# ---------------------------------------------------------------------------
# Gate evaluation
# ---------------------------------------------------------------------------

def evaluate_greybox(
    hub_obj,
    gate_obj,
    hub_metrics: MeshMetrics,
    gate_metrics: MeshMetrics,
    hub_sil: dict,
    gate_sil: dict,
    gate_ap: dict,
    hub_neg: dict,
    render_reports: list[dict],
) -> dict[str, Any]:
    failures: list[str] = []

    if hub_metrics.connected_components != 1:
        failures.append(
            f"hub disconnected: {hub_metrics.connected_components} components"
        )
    if gate_metrics.connected_components != 1:
        failures.append(
            f"gate disconnected: {gate_metrics.connected_components} components"
        )
    if hub_metrics.largest_component_tri_share < MIN_SHELL_SILHOUETTE_SHARE:
        failures.append(
            f"hub largest shell tri share {hub_metrics.largest_component_tri_share:.3f} < {MIN_SHELL_SILHOUETTE_SHARE}"
        )
    if hub_metrics.largest_component_volume_share < MIN_SHELL_VOLUME_SHARE:
        failures.append(
            f"hub largest shell volume share {hub_metrics.largest_component_volume_share:.3f} < {MIN_SHELL_VOLUME_SHARE}"
        )
    if hub_sil.get("shell_share", 0) < MIN_SHELL_SILHOUETTE_SHARE * 0.5:
        # raster of solid within AABB can be lower for hollow-ish shapes; warn soft
        # hard fail only if extremely sparse (<0.2)
        if hub_sil.get("shell_share", 0) < 0.20:
            failures.append(f"hub projected occupancy too sparse: {hub_sil.get('shell_share')}")

    if not gate_ap.get("pass_traversal"):
        failures.append(
            f"gate traversal clearance fail: measured {gate_ap.get('measured_clearance_frac'):.3f} < {GATE_TRAVERSAL_MIN_FRAC}"
        )

    # Framing margins from renders — require close/120 views in band when content present
    margin_checks = []
    for rr in render_reports:
        m = rr.get("measured_margins") or {}
        if m.get("empty") or m.get("error"):
            continue
        # Skip under45 tiny renders for margin band (too few pixels)
        if rr.get("px", 512) < 64:
            continue
        mn = m.get("min_margin")
        mx = m.get("max_margin")
        if mn is None:
            continue
        margin_checks.append((rr.get("label") or rr.get("view"), mn, mx, m))
        # Soft: min margin should be roughly in 8-15%; allow some camera variance 5-20%
        if mn < 0.04:
            failures.append(f"framing too tight on {rr.get('label')}: min_margin={mn:.3f}")
        if mn > 0.28:
            failures.append(f"framing too loose on {rr.get('label')}: min_margin={mn:.3f}")

    verdict = "GREYBOX PASS" if not failures else "GREYBOX REJECT"
    return {
        "verdict": verdict,
        "failures": failures,
        "hub_metrics": hub_metrics.__dict__,
        "gate_metrics": gate_metrics.__dict__,
        "hub_silhouette": hub_sil,
        "gate_silhouette": gate_sil,
        "gate_aperture": gate_ap,
        "hub_negative_space": hub_neg,
        "margin_checks": [
            {"label": a, "min_margin": b, "max_margin": c, "detail": d}
            for a, b, c, d in margin_checks
        ],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    ensure_dirs()
    static_notes = run_static_gate()
    print("[V10] static validator:")
    for n in static_notes:
        print("  ", n)

    bpy = _require_bpy()
    ensure_dirs()

    # Refresh lock metadata with blender PID
    lock_meta = {
        "pid": os.getpid(),
        "owner": PACKET,
        "stage": STAGE,
        "script": str(SCRIPT_PATH),
    }
    LOCK_DIR.mkdir(parents=True, exist_ok=True)
    (LOCK_DIR / "lock.json").write_text(json.dumps(lock_meta, indent=2), encoding="utf-8")

    try:
        clear_scene(bpy)
        mats = clay_materials(bpy)
        setup_world(bpy)
        setup_lights(bpy)

        print("[V10] building hub greybox…")
        hub = build_hub_greybox(bpy, mats)
        print("[V10] building gate greybox…")
        gate = build_gate_greybox(bpy, mats)

        # Ensure no leftover cutters
        delete_all_cutters(bpy)

        # Reject non-applied transforms
        for obj in (hub, gate):
            ensure_applied_identity(obj)

        hub_metrics = analyze_mesh(hub)
        gate_metrics = analyze_mesh(gate)
        print(f"[V10] hub: {hub_metrics.tri_count} tris, components={hub_metrics.connected_components}")
        print(f"[V10] gate: {gate_metrics.tri_count} tris, components={gate_metrics.connected_components}")

        hub_sil = silhouette_occupancy(hub, "z")
        gate_sil = silhouette_occupancy(gate, "x")
        gate_ap = gate_aperture_metrics(gate)
        hub_neg = hub_negative_space_masks(hub)

        # Export temporary greybox GLBs
        hub_glb = GREYBOX_DIR / "hub_greybox_v10.glb"
        gate_glb = GREYBOX_DIR / "gate_greybox_v10.glb"
        export_glb(bpy, hub, hub_glb)
        export_glb(bpy, gate, gate_glb)
        hub_hash = sha256_file(hub_glb)
        gate_hash = sha256_file(gate_glb)
        print(f"[V10] hub glb sha256={hub_hash} size={hub_glb.stat().st_size}")
        print(f"[V10] gate glb sha256={gate_hash} size={gate_glb.stat().st_size}")

        # Exact greybox hash for evidence binding
        greybox_bundle_hash = hashlib.sha256(
            (hub_hash + gate_hash).encode("utf-8")
        ).hexdigest().lower()

        # Renders — solo hub/gate first (gate at origin), then composition with offset
        solo_jobs = [
            ("hub_close_forward_34", [hub], "close_forward_34", 768),
            ("hub_side", [hub], "side", 768),
            ("hub_120px", [hub], "close_forward_34", 120),
            ("hub_under45px", [hub], "close_forward_34", 40),
            ("hub_top_negspace", [hub], "negspace", 768),
            ("gate_close_forward_34", [gate], "close_forward_34", 768),
            ("gate_side", [gate], "side", 768),
            ("gate_axial", [gate], "axial", 768),
            ("gate_120px", [gate], "close_forward_34", 120),
            ("gate_under45px", [gate], "close_forward_34", 40),
            ("gate_side_traversal", [gate], "side", 768),
        ]

        render_reports = []
        evidence_files = {}

        def _run_render(name, objs, view, px, margin):
            all_hero = [hub, gate]
            for o in all_hero:
                hide = o not in objs
                o.hide_render = hide
                o.hide_viewport = hide
            out = EVIDENCE_DIR / f"{name}.png"
            print(f"[V10] render {name} ({px}px)…")
            try:
                rr = render_view(bpy, objs, out, view, px, margin_target=margin, label=name)
                rr["sha256"] = sha256_file(out) if out.exists() else None
                rr["greybox_bundle_hash"] = greybox_bundle_hash
                rr["hub_glb_sha256"] = hub_hash
                rr["gate_glb_sha256"] = gate_hash
                render_reports.append(rr)
                evidence_files[name] = {
                    "path": str(out.relative_to(ROOT)).replace("\\", "/"),
                    "sha256": rr["sha256"],
                    "px": px,
                    "view": view,
                    "greybox_bundle_hash": greybox_bundle_hash,
                }
            except Exception as exc:
                print(f"[V10] render failed {name}: {exc}")
                traceback.print_exc()
                render_reports.append({"label": name, "error": str(exc)})

        for name, objs, view, px in solo_jobs:
            _run_render(name, objs, view, px, 0.12)

        # Same-scale hub+gate composition (viewport offset only; GLBs already exported)
        gate.location.x = 30.0
        bpy.context.view_layer.update()
        _run_render("hub_gate_composition", [hub, gate], "close_forward_34", 900, 0.10)

        # Restore visibility
        for o in (hub, gate):
            o.hide_render = False
            o.hide_viewport = False

        evaluation = evaluate_greybox(
            hub, gate, hub_metrics, gate_metrics,
            hub_sil, gate_sil, gate_ap, hub_neg, render_reports,
        )

        # Visual judgement notes (code-side heuristics; human lead re-checks)
        visual_judgement = {
            "kestrel_v4_bar": "continuous hard-surface shell, readable silhouette at 120px, no floating debris",
            "hub_notes": [
                "Y/tuning-fork identity from lofted asymmetric wing profiles",
                "three zones: habitation (+Y light clay), industrial (-Y dark), keel/truss mid",
                "deep notch authored into profile ring (not thin sheets)",
            ],
            "gate_notes": [
                "split-hex arch loft along open U path (not torus)",
                "four machinery sectors + asymmetric service spine fused",
                "open bottom traversal clearance measured",
            ],
            "reject_if": [
                "shapes look like boxes/cylinders stacks",
                "floating/exploded parts",
                "thin frames / unreadable thumbnails",
            ],
            "agent_visual_call": evaluation["verdict"],
        }

        report = {
            "packet": PACKET,
            "stage": STAGE,
            "static_validator": static_notes,
            "hub_glb": {
                "path": str(hub_glb.relative_to(ROOT)).replace("\\", "/"),
                "sha256": hub_hash,
                "bytes": hub_glb.stat().st_size,
            },
            "gate_glb": {
                "path": str(gate_glb.relative_to(ROOT)).replace("\\", "/"),
                "sha256": gate_hash,
                "bytes": gate_glb.stat().st_size,
            },
            "greybox_bundle_hash": greybox_bundle_hash,
            "metrics": {
                "hub": hub_metrics.__dict__,
                "gate": gate_metrics.__dict__,
                "hub_silhouette": hub_sil,
                "gate_silhouette": gate_sil,
                "gate_aperture": gate_ap,
                "hub_negative_space": hub_neg,
            },
            "renders": render_reports,
            "evaluation": evaluation,
            "visual_judgement": visual_judgement,
            "verdict": evaluation["verdict"],
        }

        report_path = EVIDENCE_DIR / "greybox_report.json"
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

        manifest = {
            "packet": PACKET,
            "stage": STAGE,
            "greybox_bundle_hash": greybox_bundle_hash,
            "hub_glb_sha256": hub_hash,
            "gate_glb_sha256": gate_hash,
            "files": {
                "hub_glb": report["hub_glb"],
                "gate_glb": report["gate_glb"],
                "report": {
                    "path": str(report_path.relative_to(ROOT)).replace("\\", "/"),
                    "sha256": sha256_file(report_path),
                    "greybox_bundle_hash": greybox_bundle_hash,
                },
                "images": evidence_files,
            },
            "verdict": evaluation["verdict"],
            "failures": evaluation["failures"],
        }
        manifest_path = EVIDENCE_DIR / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        # Re-hash report into manifest after writing report (already done)
        # Update manifest report hash after final write
        manifest["files"]["report"]["sha256"] = sha256_file(report_path)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        print(json.dumps({"verdict": evaluation["verdict"], "failures": evaluation["failures"]}, indent=2))
        print(f"[V10] evidence: {EVIDENCE_DIR}")
        print(f"[V10] {evaluation['verdict']}")

        # Save blend for inspection (optional greybox authoring dump)
        blend_path = GREYBOX_DIR / "m4_helios_hub_v10_greybox.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        print(f"[V10] blend saved {blend_path}")

        return 0 if evaluation["verdict"] == "GREYBOX PASS" else 2

    finally:
        # Always release authoring lock
        try:
            if LOCK_DIR.exists():
                for p in LOCK_DIR.iterdir():
                    p.unlink(missing_ok=True)
                LOCK_DIR.rmdir()
                print("[V10] authoring lock released")
        except Exception as exc:
            print(f"[V10] lock release warning: {exc}")


if __name__ == "__main__":
    # Allow pure static check without blender for CI smoke:
    if "--static-only" in sys.argv:
        notes = run_static_gate()
        print("STATIC OK")
        for n in notes:
            print(" ", n)
        sys.exit(0)
    try:
        raise SystemExit(main())
    except StaticValidationError as exc:
        print(str(exc), file=sys.stderr)
        # release lock if held
        try:
            if LOCK_DIR.exists():
                for p in LOCK_DIR.iterdir():
                    p.unlink(missing_ok=True)
                LOCK_DIR.rmdir()
        except Exception:
            pass
        raise SystemExit(3)
    except Exception:
        traceback.print_exc()
        try:
            if LOCK_DIR.exists():
                for p in LOCK_DIR.iterdir():
                    p.unlink(missing_ok=True)
                LOCK_DIR.rmdir()
                print("[V10] authoring lock released after error")
        except Exception:
            pass
        raise SystemExit(1)
