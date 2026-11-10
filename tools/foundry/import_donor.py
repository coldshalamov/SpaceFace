#!/usr/bin/env python3
"""Fleet Breadth Foundry — donor-part contract-surface dumper (Lane B harness).

Imports a dev-source part GLB (assets/ships/parts/<cat>/<id>.glb) and reports the
CONTRACT SURFACE a Phase-2 variant lane needs to graft new geometry onto a donor
without breaking the runtime part contract:

  * MOUNT_* / SOCKET_* / HOOK_* attachment empties, with world position + rotation
  * LOD0_* primary meshes (poly counts, world bbox)
  * lower-LOD proxy meshes (LOD1_/LOD2_/*SILHOUETTE) listed separately
  * material slot names in use
  * overall dims + forward-axis check (+X thrust / length convention)

Axis convention (after glTF import to Blender Z-up):
  +X = thrust / forward (length),  +Y = beam (lateral),  +Z = up (DORSAL).

DUAL MODE (single file), same pattern as render_contact_sheet.py:
  * SYSTEM PYTHON — the entry lanes run; spawns one headless Blender, prints the
    JSON contract and optionally writes it:
      python tools/foundry/import_donor.py --glb <part.glb> [--out <report.json>]
  * BLENDER PYTHON — invoked internally, OR imported as a module by an in-Blender
    variant script (`from import_donor import contract_surface, import_donor_glb`):
      blender -b --factory-startup -P import_donor.py -- --glb <part.glb> --json <out>

Deterministic: sorted keys, rounded floats, no wall-clock in output.
"""
from __future__ import annotations

import json
import os
import sys

try:
    import bpy  # noqa: F401
    IN_BLENDER = True
except Exception:
    IN_BLENDER = False

PROXY_TOKENS = ("LOD1_", "LOD2_", "LOD3_", "SILHOUETTE")
MOUNT_PREFIXES = ("MOUNT_", "SOCKET_", "HOOK_")


def _split_argv_after_dashes(argv):
    return argv[argv.index("--") + 1:] if "--" in argv else []


# ===========================================================================
# BLENDER MODE — importable module functions + JSON dump
# ===========================================================================
if IN_BLENDER:
    from mathutils import Vector

    def import_donor_glb(path):
        """Reset to an empty scene and import a donor GLB. Returns object count."""
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
        bpy.context.view_layer.update()
        return len(bpy.data.objects)

    def _round3(v):
        return [round(float(v[0]), 4), round(float(v[1]), 4), round(float(v[2]), 4)]

    def _is_proxy(name):
        nu = name.upper()
        return any(tok in nu for tok in PROXY_TOKENS)

    def _world_bbox(objs):
        mins = Vector((1e18, 1e18, 1e18))
        maxs = Vector((-1e18, -1e18, -1e18))
        found = False
        for obj in objs:
            for corner in obj.bound_box:
                wc = obj.matrix_world @ Vector(corner)
                mins = Vector((min(mins[i], wc[i]) for i in range(3)))
                maxs = Vector((max(maxs[i], wc[i]) for i in range(3)))
                found = True
        if not found:
            return None, None, None
        return _round3(mins), _round3(maxs), _round3(maxs - mins)

    def mount_sockets():
        """Attachment empties (MOUNT_/SOCKET_/HOOK_) with world pose."""
        out = []
        for obj in bpy.data.objects:
            if obj.type != "EMPTY":
                continue
            if not any(obj.name.upper().startswith(p) for p in MOUNT_PREFIXES):
                continue
            loc = obj.matrix_world.to_translation()
            rot = obj.matrix_world.to_euler()
            out.append({
                "name": obj.name,
                "kind": "MOUNT" if obj.name.upper().startswith("MOUNT_")
                        else ("SOCKET" if obj.name.upper().startswith("SOCKET_") else "HOOK"),
                "world_pos": _round3(loc),
                "world_rot_euler": [round(rot.x, 4), round(rot.y, 4), round(rot.z, 4)],
                "parent": obj.parent.name if obj.parent else None,
            })
        return sorted(out, key=lambda d: d["name"])

    def _mesh_record(obj):
        mn, mx, dims = _world_bbox([obj])
        return {
            "name": obj.name,
            "polys": len(obj.data.polygons),
            "material_slots": [s.material.name if s.material else "(none)" for s in obj.material_slots],
            "world_center": _round3((Vector(mn) + Vector(mx)) / 2) if mn else None,
            "world_dims": dims,
            "parent": obj.parent.name if obj.parent else None,
        }

    def lod0_meshes():
        out = [_mesh_record(o) for o in bpy.data.objects
               if o.type == "MESH" and o.name.upper().startswith("LOD0_")]
        return sorted(out, key=lambda d: d["name"])

    def render_meshes():
        out = [_mesh_record(o) for o in bpy.data.objects
               if o.type == "MESH" and not _is_proxy(o.name)]
        return sorted(out, key=lambda d: d["name"])

    def proxy_meshes():
        out = [_mesh_record(o) for o in bpy.data.objects
               if o.type == "MESH" and _is_proxy(o.name)]
        return sorted(out, key=lambda d: d["name"])

    def forward_axis_check():
        meshes = [o for o in bpy.data.objects if o.type == "MESH" and not _is_proxy(o.name)]
        mn, mx, dims = _world_bbox(meshes)
        if dims is None:
            return {"error": "no render meshes"}
        axes = ["X", "Y", "Z"]
        longest = axes[max(range(3), key=lambda i: dims[i])]
        x_is_longest = longest == "X"
        return {
            "dims": dims,
            "longest_axis": longest,
            "x_is_longest": x_is_longest,
            "convention": "+X=thrust/forward, +Y=beam, +Z=up(dorsal)",
            "note": "OK: +X is the longest axis (single-body length convention)."
                    if x_is_longest else
                    f"HEADS-UP: longest axis is {longest}, not X. Legitimate for laterally "
                    "spread layouts (e.g. a twin/quad engine spans +Y); confirm thrust is still +X.",
        }

    def contract_surface(glb_path):
        import_donor_glb(glb_path)
        materials = sorted({s.material.name
                            for o in bpy.data.objects if o.type == "MESH"
                            for s in o.material_slots if s.material})
        render = render_meshes()
        total_polys = sum(m["polys"] for m in render)
        mn, mx, dims = _world_bbox([o for o in bpy.data.objects
                                    if o.type == "MESH" and not _is_proxy(o.name)])
        root = next((o for o in bpy.data.objects if o.parent is None and o.type == "EMPTY"), None)
        return {
            "part_id": os.path.splitext(os.path.basename(glb_path))[0],
            "root_node": root.name if root else None,
            "attachments": mount_sockets(),
            "lod0_meshes": lod0_meshes(),
            "render_meshes": render,
            "proxy_meshes": proxy_meshes(),
            "material_slots": materials,
            "render_poly_total": total_polys,
            "world_bbox": {"min": mn, "max": mx, "dims": dims},
            "forward_axis": forward_axis_check(),
            "axis_convention": "+X=thrust/forward, +Y=beam, +Z=up(dorsal) (Blender Z-up post-import)",
        }

    def _run_blender_cli():
        args = _split_argv_after_dashes(sys.argv)
        glb = None
        out_json = None
        i = 0
        while i < len(args):
            if args[i] == "--glb":
                glb = args[i + 1]; i += 2; continue
            if args[i] == "--json":
                out_json = args[i + 1]; i += 2; continue
            i += 1
        if not glb:
            raise SystemExit("import_donor (blender): --glb <part.glb> required")
        surface = contract_surface(glb)
        payload = json.dumps(surface, indent=2, sort_keys=True)
        if out_json:
            os.makedirs(os.path.dirname(os.path.abspath(out_json)), exist_ok=True)
            with open(out_json, "w", encoding="utf-8") as fh:
                fh.write(payload + "\n")
        # Sentinel-wrapped so the system side can extract the JSON from Blender's noisy stdout.
        print("CONTRACT_JSON_BEGIN")
        print(payload)
        print("CONTRACT_JSON_END")

    if __name__ == "__main__" and "--glb" in _split_argv_after_dashes(sys.argv):
        _run_blender_cli()


# ===========================================================================
# SYSTEM MODE — spawn Blender, extract + print/save the contract JSON
# ===========================================================================
if not IN_BLENDER:
    import argparse
    import subprocess

    def _find_blender():
        env = os.environ.get("SF_BLENDER")
        if env and os.path.isfile(env):
            return env
        for c in (r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe",
                  r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"):
            if os.path.isfile(c):
                return c
        raise SystemExit("Blender not found; set SF_BLENDER to blender.exe path")

    def main():
        ap = argparse.ArgumentParser(description="Dump a donor part's contract surface")
        ap.add_argument("--glb", required=True)
        ap.add_argument("--out", default=None, help="optional path to write the JSON report")
        args = ap.parse_args()
        blender = _find_blender()
        self_path = os.path.abspath(__file__)
        cmd = [blender, "-b", "--factory-startup", "-P", self_path, "--",
               "--glb", os.path.abspath(args.glb)]
        if args.out:
            cmd += ["--json", os.path.abspath(args.out)]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            sys.stderr.write(proc.stderr[-2000:])
            raise SystemExit(f"blender failed ({proc.returncode})")
        out = proc.stdout
        try:
            body = out.split("CONTRACT_JSON_BEGIN\n", 1)[1].split("\nCONTRACT_JSON_END", 1)[0]
        except IndexError:
            sys.stderr.write(out[-2000:])
            raise SystemExit("could not parse contract JSON from Blender output")
        print(body)

    if __name__ == "__main__":
        main()
