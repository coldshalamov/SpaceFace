"""PQ-050.01 Hornet chase-camera complete body.

Rebuilds the live interceptor as one Hitch-world ship: dark gray dielectric
hull, teal-gray armor, skin-breaking wells, manufactured bells. Does not
edit Hitch. Does not write cycle still archives.
"""
from __future__ import annotations

import math
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
TOOLS = ROOT / "tools" / "blender"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import build_hornet_mtx as mtx  # noqa: E402
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    render_chase_still,
    render_cycle_chase_stills,
)

REVIEW_DIR = Path(tempfile.gettempdir()) / "sf-hornet-pq050-01"


def role_maps(role, rgb, size=None, prefix=None):
    size = mtx.TEX if size is None else size
    prefix = prefix or role
    br, bg, bb = rgb
    albedo, orm, nrm = [], [], []
    if role == "hull":
        pw, ph = 0, 0
    elif role == "armor":
        pw, ph = 320, 220
    elif role == "mechanical":
        pw, ph = 48, 18
    elif role in {"ceramic", "glass", "thruster"}:
        pw, ph = 0, 0
    else:
        pw, ph = 96, 64
    for y in range(size):
        for x in range(size):
            gf = mtx.h01(x, y, 11)
            gf2 = mtx.h01(x // 2, y // 3, 29)
            brush = 0.92 + 0.08 * mtx.h01(x, y // 4, 7)
            if pw == 0:
                seam = edge = 0.0
                dx = dy = 99
            else:
                dx = min(x % pw, pw - (x % pw))
                dy = min(y % ph, ph - (y % ph))
                seam = 1.0 if (dx <= 1 or dy <= 1) else 0.0
                edge = 1.0 if (dx <= 3 or dy <= 3) else 0.0
            stencil = 0.0
            if role == "hull" and 88 <= x <= 168 and 420 <= y <= 488:
                col = x - 88
                row = y - 420
                if 8 <= col <= 20 and 8 <= row <= 60:
                    stencil = 0.9
                if 20 <= col <= 38 and (8 <= row <= 16 or 28 <= row <= 36):
                    stencil = 0.85
                if 46 <= col <= 58 and 8 <= row <= 60:
                    stencil = 0.9
                if 58 <= col <= 74 and (8 <= row <= 16 or 52 <= row <= 60):
                    stencil = 0.8
            if role == "hull":
                r = max(0.0, min(1.0, br * (0.97 + gf * 0.03)))
                g = max(0.0, min(1.0, bg * (0.97 + gf * 0.03)))
                b = max(0.0, min(1.0, bb * (0.97 + gf2 * 0.03)))
                if stencil > 0:
                    r = r * (1 - stencil) + 0.07 * stencil
                    g = g * (1 - stencil) + 0.36 * stencil
                    b = b * (1 - stencil) + 0.40 * stencil
                rough, metal = 0.42, 0.04
            elif role == "armor":
                r = max(0.0, min(1.0, br * (0.96 + gf * 0.04) - seam * 0.04))
                g = max(0.0, min(1.0, bg * (0.96 + gf * 0.04) - seam * 0.03))
                b = max(0.0, min(1.0, bb * (0.96 + gf2 * 0.03) - seam * 0.02))
                rough, metal = 0.40, 0.08
            elif role == "mechanical":
                heat = max(0.0, 0.45 - x / size) * 0.22
                r = max(0.0, min(1.0, br * (0.88 + gf * 0.14) + heat * 0.28))
                g = max(0.0, min(1.0, bg * (0.90 + gf * 0.08) + heat * 0.06))
                b = max(0.0, min(1.0, bb * (0.92 + (1 - gf) * 0.06)))
                rough, metal = 0.26 + gf2 * 0.12, 0.82
            elif role == "ceramic":
                r = max(0.0, min(1.0, br * (0.9 + gf2 * 0.1)))
                g = max(0.0, min(1.0, bg * (0.88 + gf * 0.08)))
                b = max(0.0, min(1.0, bb * 0.84))
                rough, metal = 0.64, 0.0
            elif role == "accent":
                pulse = 0.82 + 0.18 * math.sin(x * 0.05)
                r, g, b = br * pulse, bg * pulse, bb * pulse
                rough, metal = 0.36, 0.08
            elif role == "warning":
                r, g, b = br, bg * (1 - gf * 0.08), bb
                rough, metal = 0.42, 0.04
            elif role == "glass":
                r, g, b = br, bg, bb
                rough, metal = 0.07, 0.02
            else:
                r, g, b = br, bg, bb
                rough, metal = 0.28, 0.2
            ao = max(0.22, 1.0 - seam * 0.22 - edge * 0.08)
            nx = 0.5 + (0.0 if pw == 0 else (dx / max(1, pw) - 0.5) * 0.05 * (1 if dx <= 4 else 0.15))
            ny = 0.5 + (0.0 if ph == 0 else (dy / max(1, ph) - 0.5) * 0.05 * (1 if dy <= 4 else 0.15))
            albedo.extend((r, g, b, 1.0))
            orm.extend((ao, max(0.05, min(0.92, rough)), max(0.0, min(1.0, metal)), 1.0))
            nrm.extend((nx, ny, 1.0, 1.0))
    base = mtx.write_pixels(f"hornet_{prefix}_basecolor", albedo, size, "sRGB")
    orm_img = mtx.write_pixels(f"hornet_{prefix}_orm", orm, size, "Non-Color")
    nrm_img = mtx.write_pixels(f"hornet_{prefix}_normal", nrm, size, "Non-Color")
    return base, orm_img, nrm_img


def create_materials():
    specs = {
        "Material_Hull": ((0.20, 0.22, 0.24), 0.04, 0.46, "hull", 0.04, None),
        "Material_Armor": ((0.10, 0.30, 0.32), 0.08, 0.40, "armor", 0.0, None),
        "Material_Mechanical": ((0.16, 0.15, 0.14), 0.86, 0.24, "mechanical", 0.0, None),
        "Material_Accent": ((0.10, 0.38, 0.42), 0.08, 0.36, "accent", 0.12, None),
        "Material_Warning": ((0.62, 0.18, 0.06), 0.04, 0.40, "warning", 0.0, None),
        "Material_Ceramic": ((0.20, 0.15, 0.11), 0.08, 0.72, "ceramic", 0.0, None),
        "Material_Radiator": ((0.10, 0.08, 0.07), 0.48, 0.58, "mechanical", 0.0, None),
        "Material_Canopy": ((0.012, 0.016, 0.020), 0.00, 0.07, "glass", 0.0, None),
        "Material_Thruster": ((0.98, 0.32, 0.06), 0.00, 0.22, "thruster", 0.0, ((0.98, 0.34, 0.05), 3.2)),
    }
    mats = {}
    for name, (rgb, metal, rough, role, coat, emit) in specs.items():
        material = mtx.bpy.data.materials.new(name)
        bsdf = mtx.principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        if name in ("Material_Hull", "Material_Armor"):
            maps = role_maps(role, rgb, prefix=name.replace("Material_", "").lower())
            mtx.wire_albedo_only(material, bsdf, maps[0])
            if coat > 0 and "Coat Weight" in bsdf.inputs:
                bsdf.inputs["Coat Weight"].default_value = coat
        elif name not in ("Material_Canopy", "Material_Thruster"):
            maps = role_maps(role, rgb, prefix=name.replace("Material_", "").lower())
            mtx.wire_maps(material, bsdf, maps, coat=coat, emission=emit, metallic_from_map=False)
        elif emit:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emit[0], 1)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emit[1]
        if name == "Material_Canopy":
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.0
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.52
            if "Coat Weight" in bsdf.inputs:
                bsdf.inputs["Coat Weight"].default_value = 0.22
                bsdf.inputs["Coat Roughness"].default_value = 0.10
            bsdf.inputs["Base Color"].default_value = (0.004, 0.007, 0.010, 1)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.08
            bsdf.inputs["Alpha"].default_value = 1.0
            if hasattr(material, "blend_method"):
                try:
                    material.blend_method = "OPAQUE"
                except TypeError:
                    pass
            if hasattr(material, "use_backface_culling"):
                material.use_backface_culling = True
        material["spacefaceRole"] = role
        mats[name] = material
    soot = mtx.bpy.data.materials.new("Material_Soot")
    sbsdf = mtx.principled(soot)
    sbsdf.inputs["Base Color"].default_value = (0.018, 0.016, 0.015, 1)
    sbsdf.inputs["Metallic"].default_value = 0.08
    sbsdf.inputs["Roughness"].default_value = 0.72
    soot["spacefaceRole"] = "thruster"
    mats["Material_Soot"] = soot
    gap = mtx.bpy.data.materials.new("Material_Gap")
    gbsdf = mtx.principled(gap)
    gbsdf.inputs["Base Color"].default_value = (0.04, 0.042, 0.046, 1)
    gbsdf.inputs["Metallic"].default_value = 0.0
    gbsdf.inputs["Roughness"].default_value = 0.70
    gap["spacefaceRole"] = "armor"
    mats["Material_Gap"] = gap
    wing = mtx.bpy.data.materials.new("Material_Wing")
    wbsdf = mtx.principled(wing)
    wbsdf.inputs["Base Color"].default_value = (0.26, 0.28, 0.30, 1)
    wbsdf.inputs["Metallic"].default_value = 0.06
    wbsdf.inputs["Roughness"].default_value = 0.46
    wing["spacefaceRole"] = "hull"
    mats["Material_Wing"] = wing
    return mats


def add_hollow_bell(tag, x, y, z, scale, mats, collection):
    s = scale
    ceramic = mats["Material_Ceramic"]
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    soot = mats["Material_Soot"]
    thruster = mats["Material_Thruster"]
    bell_len = 1.02 * s
    outboard = 1.0 if y >= 0.0 else -1.0
    cant_y, cant_z = 0.10, 0.92

    def ring_at(t, r, sides=48):
        xi = x - 0.04 * s - t * bell_len
        yo = y + outboard * cant_y * t * s
        zo = z + cant_z * t * s
        return mtx.ellipse_ring(xi, yo, zo, r * s, r * s, sides)

    mtx.loft_from_rings(f"BellCase_{tag}", [ring_at(t, r) for t, r in ((0.00, 0.28), (0.22, 0.28), (0.40, 0.30))], mech, collection, 0.0, cap=False)
    outer = mtx.loft_from_rings(f"Bell_{tag}", [ring_at(t, r) for t, r in ((0.40, 0.30), (0.62, 0.36), (0.82, 0.42), (1.00, 0.46))], mech, collection, 0.0, cap=False)
    mtx.loft_from_rings(f"BellLip_{tag}", [ring_at(0.98, 0.46), ring_at(1.04, 0.46)], ceramic, collection, 0.0, cap=False)
    liner = mtx.loft_from_rings(f"BellLiner_{tag}", [ring_at(t, r, 32) for t, r in ((0.08, 0.17), (0.22, 0.18), (0.36, 0.24))], soot, collection, 0.0, cap=False)
    mtx.flip_normals(liner)
    throat = mtx.loft_from_rings(f"BellThroat_{tag}", [ring_at(t, r, 32) for t, r in ((0.38, 0.22), (0.58, 0.30), (0.78, 0.36), (0.94, 0.40))], ceramic, collection, 0.0, cap=False)
    mtx.flip_normals(throat)
    mtx.add_cylinder(f"BellBore_{tag}", (x - 0.12 * s, y, z), 0.16 * s, 0.020 * s, soot, collection, 24, 0.001)
    pitch_up = math.atan2(cant_z * s, bell_len)
    yaw = outboard * math.atan2(cant_y * s, bell_len)
    heat_t = 0.58
    mtx.add_cylinder(
        f"BellHeat_{tag}",
        (x - 0.04 * s - heat_t * bell_len, y + outboard * cant_y * heat_t * s, z + cant_z * heat_t * s),
        0.38 * s, 0.10 * s, ceramic, collection, 28, 0.002,
        rot=(0.0, math.pi / 2 - pitch_up, yaw),
    )
    mtx.add_cylinder(f"BellCollar_{tag}", (x + 0.02 * s, y, z), 0.32 * s, 0.16 * s, armor, collection, 28, 0.003)
    mtx.add_cylinder(f"BellClamp_{tag}", (x + 0.16 * s, y, z), 0.34 * s, 0.06 * s, mech, collection, 28, 0.002)
    hub_t = 0.28
    mtx.add_cylinder(
        f"BellHub_{tag}",
        (x - 0.04 * s - hub_t * bell_len, y + outboard * cant_y * hub_t * s, z + cant_z * hub_t * s),
        0.12 * s, 0.18 * s, mech, collection, 20, 0.001,
        rot=(0.0, math.pi / 2 - pitch_up, yaw),
    )
    glow_t = 0.72
    mtx.add_cylinder(
        f"BellGlow_{tag}",
        (x - 0.04 * s - glow_t * bell_len, y + outboard * cant_y * glow_t * s, z + cant_z * glow_t * s),
        0.10 * s, 0.04 * s, thruster, collection, 16, 0.001,
        rot=(0.0, math.pi / 2 - pitch_up, yaw),
    )
    for index in range(6):
        ang = math.tau * index / 6
        mtx.add_interior_vane(
            f"BellVane_{tag}_{index}", x, y, z, ang, s * 0.82, ceramic, collection,
            outboard=outboard, cant_y=cant_y, cant_z=cant_z,
        )
    return outer


def add_blended_interceptor_wing(name, sign, hull, armor, collection, soot=None):
    s = float(sign)
    soot = soot or armor
    main = (
        (1.52, -1.35, 2.40, 1.18, 0.16),
        (2.50, -2.05, 1.90, 0.82, 0.24),
        (3.40, -2.85, 1.25, 0.48, 0.34),
        (4.20, -3.55, 0.70, 0.28, 0.42),
    )
    rings = [mtx.densify_ring(mtx.diamond_airfoil(le, y * s, z, chord, thick), 4) for y, le, chord, thick, z in main]
    wing = mtx.loft_from_rings(name, rings, hull, collection, 0.022, cap=True)
    mtx.loft_from_rings(f"{name}_Fillet", [
        mtx.densify_ring(mtx.diamond_airfoil(-1.22, 1.10 * s, 0.14, 2.05, 1.22), 4),
        mtx.densify_ring(mtx.diamond_airfoil(-1.28, 1.24 * s, 0.15, 2.18, 1.20), 4),
        mtx.densify_ring(mtx.diamond_airfoil(-1.32, 1.38 * s, 0.16, 2.30, 1.19), 4),
        mtx.densify_ring(mtx.diamond_airfoil(-1.35, 1.52 * s, 0.16, 2.40, 1.18), 4),
    ], hull, collection, 0.016, cap=True)
    mtx.add_folded_sheet(
        f"{name}_Leading",
        (-1.32, 1.52 * s, 0.26), (-2.55, 3.55 * s, 0.40),
        (-2.70, 3.55 * s, 0.08), (-1.48, 1.52 * s, -0.16),
        0.110, armor, collection, 0.006,
    )
    mtx.add_folded_sheet(
        f"{name}_FlapSlot",
        (-1.90, 1.55 * s, 0.14), (-2.80, 4.05 * s, 0.28),
        (-2.60, 4.05 * s, 0.00), (-1.70, 1.55 * s, -0.12),
        0.080, armor, collection, 0.002,
    )
    mtx.add_folded_sheet(
        f"{name}_Flap",
        (-1.98, 1.58 * s, 0.22), (-2.95, 4.10 * s, 0.36),
        (-3.90, 4.10 * s, 0.08), (-3.05, 1.58 * s, -0.02),
        0.110, armor, collection, 0.003,
    )
    mtx.add_overlap_plate(f"{name}_TipMark", (-3.30, 4.02 * s, 0.40), (0.18, 0.14, 0.05), armor, collection, 0.003)
    return wing


def render_cycle(collection):
    for other in mtx.bpy.data.collections:
        other.hide_render = other is not collection
    display_scale = mtx.runtime_display_scale(collection)
    mtx.apply_render_scale(collection, display_scale)
    camera = mtx.setup_studio(light_scale=display_scale)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    written = render_cycle_chase_stills(camera, REVIEW_DIR)
    meshes = [obj for obj in collection.objects if obj.type == "MESH" and not obj.get("collision")]
    clay_meshes = [obj for obj in meshes if "Canopy" not in obj.name]
    backups = mtx.override_emission(clay_meshes, lambda _o: ((0.46, 0.46, 0.47), 1.0), clay=True)
    render_chase_still(camera, REVIEW_DIR / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0)
    render_chase_still(camera, REVIEW_DIR / "clay_play_chase_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0)
    mtx.restore_mats(meshes, backups)
    return REVIEW_DIR, written


def main():
    global_tex = mtx
    mtx.FAMILY.mkdir(parents=True, exist_ok=True)
    mtx.reset_scene()
    print(f"hornet complete: map ladder {mtx.TEX_BY_LOD}")
    reports = []
    collections = []
    for lod in (0, 1, 2):
        global_tex.TEX = mtx.TEX_BY_LOD[lod]
        mats = create_materials()
        collection, report = mtx.build_lod(lod, mats)
        output = mtx.export_lod(collection, lod)
        report.update({
            "path": str(output.relative_to(mtx.FAMILY)).replace("\\", "/"),
            "bytes": output.stat().st_size,
            "sha256": mtx.sha256(output),
        })
        if report["hullTriangles"] < 8000:
            raise RuntimeError(f"hornet lod{lod} hull {report['hullTriangles']} < 8000")
        collections.append(collection)
        reports.append(report)
    stills, written = render_cycle(collections[0])
    report = {
        "schema": "spaceface.hornetComplete.v1",
        "shipId": "hornet",
        "revision": "hitch_world_chase_form",
        "lods": reports,
        "stills": str(stills),
        "chase": {name: str(path) for name, path in written.items()},
    }
    print(report)
    return 0


if __name__ == "__main__":
    mtx.create_materials = create_materials
    mtx.role_maps = role_maps
    mtx.add_hollow_bell = add_hollow_bell
    mtx.add_blended_interceptor_wing = add_blended_interceptor_wing
    mtx.render_cycle = render_cycle
    raise SystemExit(main())
