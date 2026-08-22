"""PQ-050.01 Hornet MTX builder. Hitch untouched. --mtx-cycle N writes cycle stills."""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from fleet_construction import (  # noqa: E402
    add_folded_sheet,
    add_overlap_plate,
    add_radiator_cassette,
    add_rcs_cluster,
    add_sensor_dish,
    add_service_hatch,
    add_tapered_vane,
    add_tile_bank,
    apply_modifiers,
    boolean_cut_box,
    densify_ring,
    loft_shell,
    station_ring,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    render_chase_still,
    render_cycle_chase_stills,
)

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "hornet"
TEX_DIR = FAMILY / "source" / "textures"
# Texture size per LOD, not one size for every level.
#
# 512 everywhere is far under the contract floor: MTX-17 wants 256-512 px/m at LOD0 and a 512 map
# on a 10.7 m ship is about 34 px/m at best, which is why every reviewer reads the surface as
# unpainted plastic. But raising it to a flat 2048 (cycle 56) inflated all three levels together to
# 64.6 / 64.5 / 63.1 MB - roughly 192 MB for one ship, against 15.3 MB for the entire live player
# ship release, with LOD2 (the level that exists to be cheap) the same size as LOD0. A ship that
# large would hit the same admission failure place_station_trade_hub already demonstrates at 75 MB
# (docs/COMMON_BUGS.md 12).
#
# So: LOD0 carries the density the contract asks for, and the levels a player only ever sees small
# carry less.
# LOD0 is 1024, not 2048, and that is a hardware finding rather than an art choice.
#
# 2048 renders fine on the sparse cycle-56 body (4,951 hull triangles) but crashes Blender in
# igc64.dll -- the Intel graphics compiler -- during render setup on the cycle-54 body (21,240 hull
# triangles). Reproduced twice in a row at the same point, after all three LODs had already
# exported cleanly, so it is the render step and not the export.
#
# 1024 gives about 96 px/m on a 10.7 m ship. That is triple the old 512 and still below MTX-17's
# 256 px/m floor, which needs roughly a 2740 px map. So the contract's density target is not
# reachable on this machine through this render path, and that limit belongs in the record rather
# than in a build that dies. Raise it on a machine that survives 2048, or split the bake out of
# the still-render pass.
# Restored to the intended ladder after a control run settled what the render crash is NOT.
#
# 2048 exports and renders cleanly (cycle 57). Later the same day 2048 crashed Blender in
# igc64.dll during render setup; so did 1024; and so did a control at 512 — cycle 54's exact
# configuration, which had rendered without complaint a few hours earlier. A configuration that
# worked and then stopped working, with nothing between, is the machine and not the build. Every
# one of those runs exported all three LODs correctly first, so the fault is confined to the
# still-render pass.
#
# Do not lower these to chase that crash. Take the stills on a fresh GPU state.
# LOD0 is 1024, and the reason is repository weight, not looks.
#
# 2048 gives about 191 px/m on a 10.7 m ship, the closest any setting here gets to MTX-17's
# 256 px/m floor. It also produces a 65.8 MB source GLB, which GitHub rejects as oversized
# (>50 MB) and which, across the 22 ships in this campaign, would add roughly 1.4 GB of permanent
# history. 1024 lands about 96 px/m in a ~33 MB file: triple the old 512, and affordable.
#
# So the contract's density target is not reachable through committed source at fleet scale, and
# that is a pipeline problem rather than an authoring one. The fix, when someone takes it, is to
# keep high maps out of git — bake at 2048 into the release artifact only, or stream them — not to
# quietly accept 34 px/m and keep asking reviewers why the hulls look like plastic.
TEX_BY_LOD = {0: 1024, 1: 512, 2: 512}
TEX = TEX_BY_LOD[0]

# Runtime-faithful play size for chase stills.
#
# The game never displays an authored whole-ship body at its authored metres. partsLibrary
# buildComposedShip instantiates the hull record at ASSEMBLY_HULL_UNITS length and shipKit
# finalizeShip then scales that hull group by entity.radius ("normalized assembly scaled to
# entity radius", src/render/partsLibrary.js renderContract). For Hornet, collisionRadius is 16
# WU (src/data/ships.js), so the player sees a craft about 1.72 * 16 = 27.5 WU long no matter
# what this script authored. The camera-law bands in ADVANCED_MODEL_TECHNIQUE_CONTRACT.md 0.5
# (~8-22% of frame width at D=144) describe THAT displayed size.
#
# Cycle 149 rendered the raw authored body (~10.8 m) and landed near 4% of frame width - below
# the legal band - because the capture was missing the runtime normalization, not because the
# form had failed. Measure the export and rescale the render scene to the live game's display
# size before any chase still is taken.
ASSEMBLY_HULL_UNITS = 1.72       # partsLibrary.js buildComposedShip hull targetLength
HORNET_COLLISION_RADIUS = 16.0   # src/data/ships.js ship_hornet collisionRadius
CYCLE = 1
for i, tok in enumerate(sys.argv):
    if tok.startswith("--mtx-cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--mtx-cycle" and i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[i + 1])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for item in list(bucket):
            bucket.remove(item)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def h01(x, y, s=0):
    v = (x * 374761393 + y * 668265263 + s * 362437) & 0xFFFFFFFF
    v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 255) / 255.0


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels = pixels
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    path = TEX_DIR / f"{name}.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    import time
    for attempt in range(6):
        try:
            img.save()
            break
        except Exception as exc:
            print(f"write_pixels retry {name} {attempt}: {exc}")
            time.sleep(0.25 * (attempt + 1))
    img.pack()
    return img


def role_maps(role, rgb, size=None, prefix=None):
    # size=None, not size=TEX: a default argument is evaluated once when the function is defined,
    # so size=TEX would freeze LOD0's map size and silently ignore the ladder.
    size = TEX if size is None else size
    """Unique Hornet maps. Not a tint of the shared fleet sheet."""
    prefix = prefix or role
    br, bg, bb = rgb
    albedo, orm, nrm = [], [], []
    if role == "hull":
        # C158: large plates, not a waffle. Dirt stays tiny so Hitch-white survives.
        pw, ph = 96, 64
    elif role == "armor":
        pw, ph = 72, 48
    elif role == "mechanical":
        pw, ph = 22, 10
    elif role == "ceramic":
        pw, ph = 0, 0
    elif role in {"glass", "thruster"}:
        pw, ph = 0, 0
    else:
        pw, ph = 80, 80
    for y in range(size):
        for x in range(size):
            if pw == 0:
                dx = dy = 99
                seam = 0.0
                soft = 0.0
            else:
                dx = min(x % pw, pw - (x % pw))
                dy = min(y % ph, ph - (y % ph))
                seam = 1.0 if (dx <= 1 or dy <= 1) else 0.0
                soft = max(0.0, 1.0 - min(dx, dy) / 3.0) if min(dx, dy) <= 3 else 0.0
            gf = h01(x, y, 11)
            gf2 = h01(x // 3, y // 3, 29)
            cav = (0.15 + 0.25 * gf2) if pw == 0 else (
                # C153: the 0.62-amplitude low-frequency term photographed as soft airbrushed
                # dirt blotches on the light hull. Panels must read as crisp seams + tight
                # course-edge shading, not smudges.
                max(0.0, 0.62 - abs(math.sin(x * 0.04) * math.cos(y * 0.05)) * 0.5) * 0.12 + soft * 0.25 + seam * 0.35
            )
            dirt = min(1.0, (0.12 * gf + 0.18 * gf2) if pw == 0 else (soft * 0.28 + seam * 0.2 + cav * 0.5 + gf2 * 0.06))
            edge = 0.0 if pw == 0 else (1.0 if (dx <= 3 or dy <= 3) else 0.0)
            stencil = 0.0
            if role == "hull" and 70 <= x <= 150 and 210 <= y <= 268:
                # Broken spray stencil HN, no thickness.
                col = x - 70
                row = y - 210
                if 6 <= col <= 18 and 8 <= row <= 50:
                    stencil = 0.85
                if 18 <= col <= 34 and 8 <= row <= 16:
                    stencil = 0.8
                if 18 <= col <= 30 and 26 <= row <= 34:
                    stencil = 0.75
                if 40 <= col <= 52 and 8 <= row <= 50:
                    stencil = 0.82
                if 52 <= col <= 68 and (8 <= row <= 16 or 42 <= row <= 50):
                    stencil = 0.7
                if gf > 0.82:
                    stencil *= 0.35
            if role == "hull":
                # C160: seams only. Dirt/cav/normal maps photographed as mud (C158).
                r = max(0, min(1, br - seam * 0.14))
                g = max(0, min(1, bg - seam * 0.14))
                b = max(0, min(1, bb - seam * 0.13))
                rough = 0.48
                metal = 0.02
                dirt = 0.0
                cav = 0.0
                if stencil > 0:
                    r = r * (1 - stencil) + 0.04 * stencil
                    g = g * (1 - stencil) + 0.36 * stencil
                    b = b * (1 - stencil) + 0.44 * stencil
                rough = 0.40 + dirt * 0.14 - edge * 0.08
                metal = 0.04 + edge * 0.12
            elif role == "armor":
                r = max(0, min(1, br * (1.0 - dirt * 0.28) - seam * 0.06))
                g = max(0, min(1, bg * (1.0 - dirt * 0.22) - seam * 0.04))
                b = max(0, min(1, bb * (1.0 - dirt * 0.18)))
                rough = 0.34 + dirt * 0.18
                metal = 0.38 + edge * 0.2
            elif role == "mechanical":
                heat = max(0.0, 0.5 - x / size) * 0.35
                r = max(0, min(1, br * (0.88 + gf * 0.16) + heat * 0.35))
                g = max(0, min(1, bg * (0.9 + gf * 0.1) + heat * 0.08))
                b = max(0, min(1, bb * (0.92 + (1 - gf) * 0.08)))
                rough = 0.24 + dirt * 0.2 + heat * 0.15
                metal = 0.86
            elif role == "ceramic":
                r = max(0, min(1, br * (0.9 + gf2 * 0.12) - dirt * 0.15))
                g = max(0, min(1, bg * (0.88 + gf * 0.08) - dirt * 0.12))
                b = max(0, min(1, bb * (0.82 - dirt * 0.1)))
                rough = 0.62 + dirt * 0.12
                metal = 0.0
            elif role == "accent":
                pulse = 0.75 + 0.25 * math.sin(x * 0.07)
                r, g, b = br * pulse, bg * pulse, bb * pulse
                rough, metal = 0.34, 0.1
            elif role == "warning":
                r, g, b = br * (1 - dirt * 0.2), bg * (1 - dirt * 0.15), bb
                rough, metal = 0.46, 0.05
            elif role == "glass":
                r, g, b = br, bg, bb
                rough, metal = 0.06, 0.03
            elif role == "thruster":
                r, g, b = br, bg, bb
                rough, metal = 0.22, 0.2
            else:
                r, g, b = br, bg, bb
                rough, metal = 0.5, 0.2
            ao = max(0.18, 1.0 - cav * 0.55 - dirt * 0.2)
            nx = 0.5 + (dx / max(1, pw) - 0.5) * 0.08 * (1 if dx <= 4 else 0.2)
            ny = 0.5 + (dy / max(1, ph) - 0.5) * 0.08 * (1 if dy <= 4 else 0.2)
            albedo.extend((r, g, b, 1.0))
            orm.extend((ao, max(0.04, min(0.95, rough)), max(0.0, min(1.0, metal)), 1.0))
            nrm.extend((nx, ny, 1.0, 1.0))
    base = write_pixels(f"hornet_{prefix}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"hornet_{prefix}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"hornet_{prefix}_normal", nrm, size, "Non-Color")
    return base, orm_img, nrm_img


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def wire_albedo_only(material, bsdf, image):
    """Unique paint without ORM/normal. Those maps turned Hitch-white to charcoal."""
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    links.new(uv0.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])


def wire_maps(material, bsdf, maps, coat=0.0, emission=None, metallic_from_map=True):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    uv1 = nodes.new("ShaderNodeUVMap")
    uv1.uv_map = "UV1"
    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = maps[0]
    tex_o = nodes.new("ShaderNodeTexImage")
    tex_o.image = maps[1]
    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = maps[2]
    links.new(uv0.outputs["UV"], tex_a.inputs["Vector"])
    links.new(uv0.outputs["UV"], tex_o.inputs["Vector"])
    links.new(uv0.outputs["UV"], tex_n.inputs["Vector"])
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(tex_o.outputs["Color"], sep.inputs["Color"])
    links.new(tex_a.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    if metallic_from_map:
        links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.space = "TANGENT"
    nmap.inputs["Strength"].default_value = 0.85
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.08
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]


def create_materials():
    specs = {
        # C153: hull to the Hitch bar's bright light gray; dirt damped so panels read as crisp
        # seams, not airbrushed blotches.
        # C154: Hitch-white hull so dark wells and charcoal wings can break value at D=144.
        "Material_Hull": ((0.82, 0.83, 0.85), 0.02, 0.50, "hull", 0.0, None),
        "Material_Armor": ((0.07, 0.075, 0.082), 0.08, 0.50, "armor", 0.0, None),
        "Material_Mechanical": ((0.50, 0.48, 0.44), 0.90, 0.22, "mechanical", 0.0, None),
        "Material_Accent": ((0.04, 0.40, 0.50), 0.10, 0.34, "accent", 0.2, None),
        "Material_Warning": ((0.98, 0.14, 0.02), 0.04, 0.38, "warning", 0.0, None),
        # C153: bells still photographed tan against the palette. Near-charcoal gunmetal bronze.
        "Material_Ceramic": ((0.10, 0.075, 0.055), 0.35, 0.78, "ceramic", 0.0, None),
        "Material_Radiator": ((0.12, 0.10, 0.08), 0.62, 0.62, "mechanical", 0.0, None),
        "Material_Canopy": ((0.02, 0.025, 0.03), 0.00, 0.04, "glass", 0.0, None),
        "Material_Thruster": ((0.98, 0.32, 0.06), 0.00, 0.22, "thruster", 0.0, ((0.98, 0.34, 0.05), 6.0)),
    }
    mats = {}
    for name, (rgb, metal, rough, role, coat, emit) in specs.items():
        material = bpy.data.materials.new(name)
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        # Warning maps washed the seat to peach. Canopy maps turned the pane into a gray slab.
        # C118 chrome-black came from metallic_from_map driving Metallic to 1; hull/armor/wing now
        # carry roughness+normal+AO relief with metallic pinned by the constant, not the map.
        if name not in ("Material_Warning", "Material_Canopy", "Material_Ceramic", "Material_Hull", "Material_Thruster"):
            maps = role_maps(role, rgb, prefix=name.replace("Material_", "").lower())
            wire_maps(material, bsdf, maps, coat=coat, emission=emit, metallic_from_map=False)
        elif emit:
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*emit[0], 1)
            elif "Emission" in bsdf.inputs:
                bsdf.inputs["Emission"].default_value = (*emit[0], 1)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = emit[1]
        if name == "Material_Canopy":
            # MTX-07/36: dark dielectric shell, coat, no volume transmission.
            # Hashed transmission photographed as a milky slab (C123 bay) or vanished (3Q).
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.0
            elif "Transmission" in bsdf.inputs:
                bsdf.inputs["Transmission"].default_value = 0.0
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.52
            if "Coat Weight" in bsdf.inputs:
                bsdf.inputs["Coat Weight"].default_value = 0.18
                bsdf.inputs["Coat Roughness"].default_value = 0.12
            bsdf.inputs["Base Color"].default_value = (0.004, 0.007, 0.010, 1)
            bsdf.inputs["Metallic"].default_value = 0.0
            # C154: near-opaque dark dielectric. C153 alpha 0.60 still sold the seat as an
            # orange inset. Chase needs one framed dark rectangle, not a window into furniture.
            bsdf.inputs["Roughness"].default_value = 0.08
            bsdf.inputs["Alpha"].default_value = 0.94
            if hasattr(material, "blend_method"):
                try:
                    material.blend_method = "BLEND"
                except TypeError:
                    pass
            if hasattr(material, "surface_render_method"):
                try:
                    material.surface_render_method = "BLENDED"
                except TypeError:
                    pass
            if hasattr(material, "shadow_method"):
                try:
                    material.shadow_method = "NONE"
                except (TypeError, ValueError):
                    pass
            if hasattr(material, "use_backface_culling"):
                material.use_backface_culling = True
            if hasattr(material, "use_screen_refraction"):
                material.use_screen_refraction = False
        material["spacefaceRole"] = role
        mats[name] = material
    soot = bpy.data.materials.new("Material_Soot")
    sbsdf = principled(soot)
    sbsdf.inputs["Base Color"].default_value = (0.022, 0.020, 0.018, 1)
    sbsdf.inputs["Metallic"].default_value = 0.0
    sbsdf.inputs["Roughness"].default_value = 0.78
    soot["spacefaceRole"] = "thruster"
    mats["Material_Soot"] = soot
    gap = bpy.data.materials.new("Material_Gap")
    gbsdf = principled(gap)
    gbsdf.inputs["Base Color"].default_value = (0.035, 0.036, 0.040, 1)
    gbsdf.inputs["Metallic"].default_value = 0.0
    gbsdf.inputs["Roughness"].default_value = 0.72
    gap["spacefaceRole"] = "armor"
    mats["Material_Gap"] = gap
    # C154: charcoal wings against Hitch-white hull so the delta reads at stamp size.
    wing = bpy.data.materials.new("Material_Wing")
    wbsdf = principled(wing)
    wbsdf.inputs["Base Color"].default_value = (0.08, 0.085, 0.095, 1)
    wbsdf.inputs["Metallic"].default_value = 0.06
    wbsdf.inputs["Roughness"].default_value = 0.48
    wing["spacefaceRole"] = "armor"
    mats["Material_Wing"] = wing
    return mats


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj, material, bevel=0.03):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def add_box(name, loc, scale, material, collection, bevel=0.03, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=18, bevel=0.02, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def loft_from_rings(name, rings, material, collection, bevel, cap=True):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def ellipse_ring(x, y, z, rx, rz, sides=16):
    return [
        (x, y + math.cos(math.tau * i / sides) * rx, z + math.sin(math.tau * i / sides) * rz)
        for i in range(sides)
    ]


def boolean_cut(host, cutter_name, loc, scale, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    cutter = bpy.context.object
    cutter.name = cutter_name
    cutter.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_modifiers(host)
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new(cutter_name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    try:
        mod.solver = "EXACT"
    except Exception:
        pass
    mod_name = mod.name
    bpy.ops.object.modifier_apply(modifier=mod_name)
    host.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)


def recalc_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.remove_doubles(threshold=0.0005)
    except TypeError:
        bpy.ops.mesh.merge_by_distance(distance=0.0005)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    return obj


def subdivide_mesh(obj, cuts=1):
    apply_modifiers(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=int(cuts))
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    return obj


def safe_boolean_cut(host, name, loc, scale, rot=(0, 0, 0)):
    """FAST/FLOAT difference with a mesh backup. Exact deleted the C66 hull."""
    apply_modifiers(host)
    backup = host.data.copy()
    n0 = len(host.data.vertices)
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    cutter = bpy.context.object
    cutter.name = name
    cutter.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new(name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    solver_name = "DEFAULT"
    for solver in ("FLOAT", "FAST"):
        try:
            mod.solver = solver
            solver_name = solver
            break
        except Exception:
            continue
    mod_name = mod.name
    try:
        result = bpy.ops.object.modifier_apply(modifier=mod_name)
        if result != {"FINISHED"} or host.modifiers.get(mod_name) is not None:
            raise RuntimeError("cut apply did not finish")
    except Exception as exc:
        print(f"safe_boolean_cut skip {name}: {exc}")
        remaining = host.modifiers.get(mod_name)
        if remaining is not None:
            host.modifiers.remove(remaining)
        host.data = backup
        bpy.data.objects.remove(cutter, do_unlink=True)
        return False
    n1 = len(host.data.vertices)
    print(f"safe_boolean_cut {name}: {n0} -> {n1} verts solver={solver_name}")
    if n1 < max(400, int(n0 * 0.50)) or n1 == 0:
        print(f"safe_boolean_cut revert {name}: hull collapsed")
        host.data = backup
        bpy.data.objects.remove(cutter, do_unlink=True)
        return False
    bpy.data.objects.remove(cutter, do_unlink=True)
    recalc_mesh(host)
    return True


def thicken_shell(obj, thickness=0.10):
    """Give a paper loft a wall so later cuts are pockets, not tunnels."""
    apply_modifiers(obj)
    solid = obj.modifiers.new("HullSkin", "SOLIDIFY")
    solid.thickness = float(thickness)
    solid.offset = -1.0
    try:
        solid.use_even_offset = True
    except Exception:
        pass
    apply_modifiers(obj)
    return recalc_mesh(obj)


def report_shells(obj, tag):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seen = set()
    islands = 0
    for vert in bm.verts:
        if vert.index in seen:
            continue
        stack = [vert]
        seen.add(vert.index)
        while stack:
            cur = stack.pop()
            for edge in cur.link_edges:
                other = edge.other_vert(cur)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        islands += 1
    boundary = sum(1 for edge in bm.edges if edge.is_boundary)
    bm.free()
    print(f"{tag}: {islands} shells, {boundary} boundary")
    return islands, boundary


def add_five_wall_tub(tag, loc, inner, wall, material, collection):
    """Line a cut hole. inner is (hx, hy, hz) half-extents of the empty volume."""
    x, y, z = loc
    hx, hy, hz = inner
    t = float(wall)
    add_box(f"{tag}_Floor", (x, y, z - hz + t * 0.5), (hx, hy, t * 0.5), material, collection, 0.003)
    add_box(f"{tag}_Fore", (x + hx - t * 0.5, y, z), (t * 0.5, hy, hz), material, collection, 0.003)
    add_box(f"{tag}_Aft", (x - hx + t * 0.5, y, z), (t * 0.5, hy, hz), material, collection, 0.003)
    add_box(f"{tag}_Port", (x, y - hy + t * 0.5, z), (hx - t, t * 0.5, hz), material, collection, 0.003)
    add_box(f"{tag}_Stbd", (x, y + hy - t * 0.5, z), (hx - t, t * 0.5, hz), material, collection, 0.003)


def delete_faces_in_box(obj, x0, x1, y0, y1, z0, z1, normal=None, normal_min=0.35):
    """Open a well by deleting faces. Does not Exact-boolean the whole loft."""
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    victims = []
    for face in bm.faces:
        center = face.calc_center_median()
        if not (x0 <= center.x <= x1 and y0 <= center.y <= y1 and z0 <= center.z <= z1):
            continue
        if normal == "z" and face.normal.z < normal_min:
            continue
        if normal == "z-" and face.normal.z > -normal_min:
            continue
        if normal == "y+" and face.normal.y < normal_min:
            continue
        if normal == "y-" and face.normal.y > -normal_min:
            continue
        if normal == "x-" and face.normal.x > -normal_min:
            continue
        if normal == "x+" and face.normal.x < normal_min:
            continue
        victims.append(face)
    print(f"delete_faces_in_box {len(victims)} faces")
    if victims:
        bmesh.ops.delete(bm, geom=victims, context="FACES")
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0005)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def delete_faces_in_cylinder(obj, x0, x1, yc, zc, radius, normal=None, normal_min=0.18):
    """Circular throat in a transom. Does not empty the whole house."""
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    r2 = float(radius) * float(radius)
    victims = []
    for face in bm.faces:
        center = face.calc_center_median()
        if not (x0 <= center.x <= x1):
            continue
        if (center.y - yc) ** 2 + (center.z - zc) ** 2 > r2:
            continue
        if normal == "z" and face.normal.z < normal_min:
            continue
        if normal == "z-" and face.normal.z > -normal_min:
            continue
        if normal == "x-" and face.normal.x > -normal_min:
            continue
        if normal == "x+" and face.normal.x < normal_min:
            continue
        victims.append(face)
    print(f"delete_faces_in_cylinder {len(victims)} faces")
    if victims:
        bmesh.ops.delete(bm, geom=victims, context="FACES")
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0005)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def flip_normals(obj):
    apply_modifiers(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def add_interior_vane(tag, cx, cy, cz, angle, s, material, collection, outboard=0.0, cant_y=0.55, cant_z=0.28):
    """Thin tapered vane. Fat 6.8° slabs photographed as a plus-sign of boxes."""
    half = math.radians(1.5)
    a0, a1 = angle - half, angle + half
    # C143: vanes sit in the ceramic bowl, ~15 cm short of the rim. C142 hid them
    # in the bore (empty tan cups). Reaching the rim photographed as a black plus.
    sections = (
        (-0.50 * s, 0.10 * s, 0.20 * s),
        (-0.85 * s, 0.16 * s, 0.40 * s),
        (-1.15 * s, 0.22 * s, 0.58 * s),
        (-1.40 * s, 0.26 * s, 0.74 * s),
    )
    verts = []
    for xo, inner, outer in sections:
        t = abs(xo) / max(2.00 * s, 1e-4)
        yo = cy + outboard * cant_y * t * s
        zo = cz + cant_z * t * s
        for radius in (inner, outer):
            for ang in (a0, a1):
                verts.append((
                    cx + xo,
                    yo + math.cos(ang) * radius,
                    zo + math.sin(ang) * radius,
                ))
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5), (8, 9, 11, 10), (12, 13, 15, 14),
        (0, 4, 5, 1), (4, 8, 9, 5), (8, 12, 13, 9),
        (2, 3, 7, 6), (6, 7, 11, 10), (10, 11, 15, 14),
        (0, 2, 6, 4), (4, 6, 10, 8), (8, 10, 14, 12),
        (1, 5, 7, 3), (5, 9, 11, 7), (9, 13, 15, 11),
    ]
    mesh = bpy.data.meshes.new(f"{tag}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(tag, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, 0.003)


def add_hollow_bell(tag, x, y, z, scale, mats, collection):
    """Spun bottle: cylindrical barrel, flare, rolled lip, dark liner, interior vanes.

    Inner and outer are separate meshes so the throat stays near-black instead of
    inheriting the casing's light mechanical albedo. Mouth is open; the only cap
    is a small inboard bore wall.
    """
    s = scale
    ceramic, mech, armor, soot = (
        mats["Material_Ceramic"],
        mats["Material_Mechanical"], mats["Material_Armor"],
        mats["Material_Soot"],
    )
    # C151: bells were ~30% of ship length combined and nearly as tall as the aft hull —
    # reviewers read "two brass megaphones on a dark tube". Shorter barrels, tighter flare:
    # each bell is now under a tenth of the ship and clearly smaller than its hull section.
    bell_len = 1.02 * s
    outboard = 1.0 if y >= 0.0 else -1.0
    # C158: more cant so play_chase looks into a circular bore, not a jagged cup silhouette.
    cant_y, cant_z = 0.10, 0.92
    def ring_at(t, r, sides=48):
        xi = x - 0.04 * s - t * bell_len
        yo = y + outboard * cant_y * t * s
        zo = z + cant_z * t * s
        return ellipse_ring(xi, yo, zo, r * s, r * s, sides)

    case_rings = [ring_at(t, r) for t, r in ((0.00, 0.28), (0.22, 0.28), (0.40, 0.30))]
    loft_from_rings(f"BellCase_{tag}", case_rings, soot, collection, 0.0, cap=False)
    outer_rings = [ring_at(t, r) for t, r in ((0.40, 0.30), (0.62, 0.36), (0.82, 0.42), (1.00, 0.46))]
    outer = loft_from_rings(f"Bell_{tag}", outer_rings, soot, collection, 0.0, cap=False)
    loft_from_rings(
        f"BellLip_{tag}",
        [ring_at(0.98, 0.46), ring_at(1.04, 0.46)],
        armor, collection, 0.0, cap=False,
    )
    liner_rings = [
        ring_at(t, r, 32)
        for t, r in (
            (0.08, 0.17),
            (0.22, 0.18),
            (0.36, 0.24),
        )
    ]
    liner = loft_from_rings(f"BellLiner_{tag}", liner_rings, soot, collection, 0.0, cap=False)
    flip_normals(liner)
    # C141: ceramic wall is most of the visible interior so 3Q looking in sees the throat, not a black plus-plug.
    ceramic_liner = loft_from_rings(
        f"BellThroat_{tag}",
        [ring_at(t, r, 32) for t, r in ((0.38, 0.22), (0.58, 0.30), (0.78, 0.36), (0.94, 0.40))],
        soot, collection, 0.0, cap=False,
    )
    flip_normals(ceramic_liner)
    add_cylinder(f"BellBore_{tag}", (x - 0.12 * s, y, z), 0.16 * s, 0.020 * s, soot, collection, 24, 0.001)
    # C134 BellLip was a solid cylinder and photographed as a tan lid over the throat. Do not cap.
    pitch_up = math.atan2(cant_z * s, bell_len)
    yaw = outboard * math.atan2(cant_y * s, bell_len)
    # Ceramic collar on the flare OD — 3Q-readable. Mech flange photographed as chrome jewelry.
    heat_t = 0.58
    add_cylinder(
        f"BellHeat_{tag}",
        (
            x - 0.04 * s - heat_t * bell_len,
            y + outboard * cant_y * heat_t * s,
            z + cant_z * heat_t * s,
        ),
        0.38 * s, 0.10 * s, soot, collection, 28, 0.002,
        rot=(0.0, math.pi / 2 - pitch_up, yaw),
    )
    add_cylinder(f"BellCollar_{tag}", (x + 0.02 * s, y, z), 0.32 * s, 0.16 * s, armor, collection, 28, 0.003)
    add_cylinder(f"BellClamp_{tag}", (x + 0.16 * s, y, z), 0.34 * s, 0.06 * s, armor, collection, 28, 0.002)
    hub_t = 0.28
    add_cylinder(
        f"BellHub_{tag}",
        (
            x - 0.04 * s - hub_t * bell_len,
            y + outboard * cant_y * hub_t * s,
            z + cant_z * hub_t * s,
        ),
        0.12 * s, 0.18 * s, soot, collection, 20, 0.001,
        rot=(0.0, math.pi / 2 - pitch_up, yaw),
    )
    glow_t = 0.72
    add_cylinder(
        f"BellGlow_{tag}",
        (
            x - 0.04 * s - glow_t * bell_len,
            y + outboard * cant_y * glow_t * s,
            z + cant_z * glow_t * s,
        ),
        0.10 * s, 0.04 * s, mats["Material_Thruster"], collection, 16, 0.001,
        rot=(0.0, math.pi / 2 - pitch_up, yaw),
    )
    for index in range(6):
        ang = math.tau * index / 6
        add_interior_vane(
            f"BellVane_{tag}_{index}", x, y, z, ang, s * 0.82, soot, collection,
            outboard=outboard, cant_y=cant_y, cant_z=cant_z,
        )
    return outer


def diamond_ring(x, yc, zc, hw, hh):
    """Hard-chine diamond. Crown, shoulder, chine, keel — not a scaled box."""
    return [
        (x, yc + 0.00, zc + hh),
        (x, yc + hw * 0.40, zc + hh * 0.70),
        (x, yc + hw, zc + hh * 0.10),
        (x, yc + hw * 0.68, zc - hh * 0.38),
        (x, yc + 0.00, zc - hh),
        (x, yc - hw * 0.68, zc - hh * 0.38),
        (x, yc - hw, zc + hh * 0.10),
        (x, yc - hw * 0.40, zc + hh * 0.70),
    ]


def add_delta_wing(name, sign, material, collection):
    """Solid folded-plate delta. Visible root thickness, not a lofted card."""
    s = sign
    verts = [
        (1.45, 1.28 * s, 0.16),
        (-1.55, 1.28 * s, 0.12),
        (-2.15, 4.38 * s, -0.06),
        (-0.15, 4.38 * s, -0.02),
        (1.45, 1.28 * s, -0.10),
        (-1.55, 1.28 * s, -0.14),
        (-2.15, 4.38 * s, -0.18),
        (-0.15, 4.38 * s, -0.14),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 3, 7, 4),
        (1, 5, 6, 2),
        (0, 4, 5, 1),
        (3, 2, 6, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, 0.018)


def add_manufactured_delta(name, sign, material, collection):
    """Solid plated slab-delta. Thickness is the form; no card airfoil."""
    s = sign
    verts = [
        (1.55, 0.95 * s, 0.28),
        (-0.85, 0.95 * s, 0.22),
        (-1.85, 3.55 * s, 0.08),
        (0.15, 3.55 * s, 0.10),
        (1.55, 0.95 * s, -0.22),
        (-0.85, 0.95 * s, -0.20),
        (-1.85, 3.55 * s, -0.10),
        (0.15, 3.55 * s, -0.08),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 3, 7, 4),
        (1, 5, 6, 2),
        (0, 4, 5, 1),
        (3, 2, 6, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    wing = bpy.data.objects.new(name, mesh)
    collection.objects.link(wing)
    finish_mesh(wing, material, 0.016)
    add_folded_sheet(
        f"{name}_SkinFore",
        (1.20, 1.10 * s, 0.32),
        (0.05, 2.15 * s, 0.24),
        (-0.10, 2.15 * s, 0.10),
        (1.05, 1.10 * s, 0.08),
        0.050, material, collection, 0.004,
    )
    add_folded_sheet(
        f"{name}_SkinAft",
        (0.15, 2.00 * s, 0.22),
        (-1.15, 3.25 * s, 0.12),
        (-1.30, 3.25 * s, 0.02),
        (0.00, 2.00 * s, 0.06),
        0.044, material, collection, 0.004,
    )
    add_folded_sheet(
        f"{name}_Leading",
        (1.58, 1.05 * s, 0.16),
        (0.35, 3.20 * s, 0.12),
        (0.20, 3.20 * s, -0.04),
        (1.40, 1.05 * s, -0.14),
        0.070, material, collection, 0.005,
    )
    add_folded_sheet(
        f"{name}_Flap",
        (-0.70, 1.35 * s, 0.08),
        (-1.55, 3.15 * s, 0.02),
        (-1.70, 3.15 * s, -0.08),
        (-0.88, 1.35 * s, -0.06),
        0.040, material, collection, 0.003,
    )
    add_folded_sheet(
        f"{name}_TipCap",
        (-0.05, 3.48 * s, 0.12),
        (-1.70, 3.62 * s, 0.06),
        (-1.80, 3.62 * s, -0.08),
        (-0.20, 3.48 * s, -0.08),
        0.055, material, collection, 0.003,
    )
    add_folded_sheet(
        f"{name}_Under",
        (1.10, 1.20 * s, -0.24),
        (-0.70, 3.05 * s, -0.14),
        (-0.55, 3.05 * s, -0.04),
        (1.25, 1.20 * s, -0.06),
        0.040, material, collection, 0.003,
    )
    add_overlap_plate(f"{name}_TileA", (0.55, 1.45 * s, 0.30), (0.38, 0.22, 0.022), material, collection, 0.004)
    add_overlap_plate(f"{name}_TileB", (-0.15, 2.15 * s, 0.24), (0.32, 0.20, 0.020), material, collection, 0.004)
    add_overlap_plate(f"{name}_TileC", (-0.85, 2.85 * s, 0.16), (0.28, 0.18, 0.018), material, collection, 0.004)
    add_overlap_plate(f"{name}_TileD", (0.20, 1.70 * s, -0.22), (0.34, 0.20, 0.018), material, collection, 0.004)
    add_overlap_plate(f"{name}_TileE", (0.85, 1.25 * s, 0.28), (0.26, 0.16, 0.018), material, collection, 0.003)
    add_overlap_plate(f"{name}_TileF", (-0.45, 2.55 * s, 0.20), (0.24, 0.16, 0.016), material, collection, 0.003)
    add_overlap_plate(f"{name}_TileG", (-1.10, 3.10 * s, 0.12), (0.22, 0.14, 0.016), material, collection, 0.003)
    add_overlap_plate(f"{name}_TileH", (0.40, 2.00 * s, -0.20), (0.26, 0.16, 0.016), material, collection, 0.003)
    return wing


def teardrop_airfoil(x_le, y, z, chord, thick):
    """Full-radius circular nose, sharp tail. Side view must read a sausage."""
    radius = min(max(thick * 0.50, 0.04), chord * 0.28)
    cx = x_le - radius

    def le(deg):
        ang = math.radians(deg)
        return (cx + math.cos(ang) * radius, y, z + math.sin(ang) * radius)

    return [
        le(0),
        le(22),
        le(45),
        le(70),
        le(90),
        (x_le - chord * 0.28, y, z + radius * 0.92),
        (x_le - chord * 0.50, y, z + radius * 0.62),
        (x_le - chord * 0.72, y, z + radius * 0.28),
        (x_le - chord, y, z + 0.055),
        (x_le - chord, y, z - 0.055),
        (x_le - chord * 0.72, y, z - radius * 0.28),
        (x_le - chord * 0.50, y, z - radius * 0.62),
        (x_le - chord * 0.28, y, z - radius * 0.92),
        le(-90),
        le(-70),
        le(-45),
        le(-22),
    ]


def diamond_airfoil(x_le, y, z, chord, thick):
    """Twelve-point airfoil. Rounder leading edge, sharp trailing edge, camber on top."""
    return [
        (x_le, y, z),
        (x_le - chord * 0.06, y, z + thick * 0.42),
        (x_le - chord * 0.16, y, z + thick * 0.82),
        (x_le - chord * 0.32, y, z + thick),
        (x_le - chord * 0.52, y, z + thick * 0.78),
        (x_le - chord * 0.74, y, z + thick * 0.38),
        (x_le - chord * 0.92, y, z + thick * 0.10),
        (x_le - chord, y, z),
        (x_le - chord * 0.78, y, z - thick * 0.42),
        (x_le - chord * 0.50, y, z - thick * 0.62),
        (x_le - chord * 0.22, y, z - thick * 0.48),
        (x_le - chord * 0.06, y, z - thick * 0.22),
    ]


def add_hung_plates(prefix, x0, x1, y, z, n, half_y, half_z, gap, material, collection):
    """Armor hung off the skin. Gap is a real channel of hull, not a scored line."""
    span = abs(x1 - x0)
    plate = (span - gap * max(n - 1, 0)) / max(n, 1)
    direction = 1.0 if x1 >= x0 else -1.0
    for i in range(n):
        cx = x0 + direction * (plate * 0.50 + i * (plate + gap))
        add_overlap_plate(
            f"{prefix}_{i}",
            (cx, y, z),
            (plate * 0.46, half_y, half_z),
            material, collection, 0.004,
        )


def add_sheet_course(prefix, x0, x1, y0, y1, z0, z1, n, gap, thick, material, collection):
    """Folded plate course with hull channels. Not a row of cubes."""
    span = abs(x1 - x0)
    plate = (span - gap * max(n - 1, 0)) / max(n, 1)
    direction = 1.0 if x1 >= x0 else -1.0
    for i in range(n):
        a = x0 + direction * i * (plate + gap)
        b = a + direction * plate
        lift = 0.010 if i % 2 else 0.0
        add_folded_sheet(
            f"{prefix}_{i}",
            (a, y0, z0 + lift), (b, y0, z0 + lift),
            (b, y1, z1 + lift), (a, y1, z1 + lift),
            thick, material, collection, 0.003,
        )


def knife_inset_courses(obj, x0, x1, y0, y1, z0, z1, nx, ny, channel, depth, normal="z", normal_min=0.28):
    """Seat a few large plate courses into the hull. C127 inset every face and became a waffle."""
    apply_modifiers(obj)
    backup = obj.data.copy()
    n0 = len(obj.data.vertices)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    axis = {"x": 0, "y": 1, "z": 2, "y-": 1, "z-": 2}[normal]
    sign = -1.0 if str(normal).endswith("-") else 1.0
    xa, xb = (min(x0, x1), max(x0, x1))
    ya, yb = (min(y0, y1), max(y0, y1))
    za, zb = (min(z0, z1), max(z0, z1))
    gap = max(float(channel), 0.012)
    total = 0
    for i in range(max(int(nx), 1)):
        for j in range(max(int(ny), 1)):
            bm.faces.ensure_lookup_table()
            bm.normal_update()
            fx0 = xa + (xb - xa) * i / max(int(nx), 1)
            fx1 = xa + (xb - xa) * (i + 1) / max(int(nx), 1)
            fy0 = ya + (yb - ya) * j / max(int(ny), 1)
            fy1 = ya + (yb - ya) * (j + 1) / max(int(ny), 1)
            band = []
            for face in bm.faces:
                center = face.calc_center_median()
                if not (fx0 + gap <= center.x <= fx1 - gap and fy0 + gap <= center.y <= fy1 - gap):
                    continue
                if not (za <= center.z <= zb):
                    continue
                if face.normal[axis] * sign < normal_min:
                    continue
                band.append(face)
            if len(band) < 2:
                continue
            try:
                bmesh.ops.inset_region(
                    bm,
                    faces=band,
                    thickness=float(channel),
                    depth=float(depth),
                    use_boundary=True,
                    use_even_offset=True,
                )
                total += 1
            except Exception as exc:
                print(f"inset_region skip: {exc}")
    print(f"hull_courses bands={total} ch={channel:.3f} d={depth:.3f} {normal}")
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0004)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    if len(obj.data.vertices) < n0 * 0.55:
        print("hull_courses collapsed — restore")
        obj.data = backup
    else:
        bpy.data.meshes.remove(backup)


def paint_gap_faces(obj, material, x0, x1, y0, y1, z0, z1):
    """Darker coating on inset channel walls so gaps are not the hull shader."""
    apply_modifiers(obj)
    if material.name not in [slot.name for slot in obj.data.materials]:
        obj.data.materials.append(material)
    slot = obj.data.materials.find(material.name)
    xa, xb = min(x0, x1), max(x0, x1)
    ya, yb = min(y0, y1), max(y0, y1)
    za, zb = min(z0, z1), max(z0, z1)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    n = 0
    for face in bm.faces:
        center = face.calc_center_median()
        if not (xa <= center.x <= xb and ya <= center.y <= yb and za <= center.z <= zb):
            continue
        if face.calc_area() > 0.018:
            continue
        if abs(face.normal.z) > 0.38:
            continue
        face.material_index = slot
        n += 1
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    print(f"gap faces {n}")


def add_station_hoop(tag, x, hw, hh, zc, flat, box, keel, material, collection, stand=0.030, half=0.036):
    """Thin hoop that follows the hull station. Not a rectangular cage."""
    rings = [
        densify_ring(station_ring(x - half, 0, zc, hw + stand, hh + stand, flat=flat, box=box, keel=keel), 3),
        densify_ring(station_ring(x + half, 0, zc, hw + stand, hh + stand, flat=flat, box=box, keel=keel), 3),
    ]
    return loft_from_rings(tag, rings, material, collection, 0.003, cap=True)


def loft_volume(name, specs, material, collection, thick=0.12):
    """One manufactured hull volume. specs are (x, hw, hh, zc, flat, box, keel)."""
    rings = [
        densify_ring(station_ring(x, 0, zc, hw, hh, flat=flat, box=box, keel=keel), 6)
        for x, hw, hh, zc, flat, box, keel in specs
    ]
    obj = loft_from_rings(name, rings, material, collection, 0.010, cap=True)
    thicken_shell(obj, thick)
    report_shells(obj, name)
    return obj


def add_blended_interceptor_wing(name, sign, skin, armor, collection, soot=None):
    """Delta on the house. Whole wing is armor so chase sees a dark planform, not a white card with a brick flap."""
    s = float(sign)
    soot = soot or armor
    # C176: one charcoal skin. C175 armor flap on a hull wing photographed as a TE brick.
    skin = armor
    # y, le, chord, thick, z — roots on the house, aft of the held waist.
    main = (
        (1.48, -1.55, 2.20, 1.10, 0.18),
        (2.35, -2.20, 1.80, 0.80, 0.28),
        (3.20, -2.85, 1.30, 0.50, 0.38),
        (4.05, -3.40, 0.78, 0.32, 0.48),
    )
    rings = [
        densify_ring(diamond_airfoil(le, y * s, z, chord, thick), 4)
        for y, le, chord, thick, z in main
    ]
    wing = loft_from_rings(name, rings, skin, collection, 0.022, cap=True)
    loft_from_rings(f"{name}_Fillet", [
        densify_ring(diamond_airfoil(-1.42, 1.08 * s, 0.14, 1.90, 1.18), 4),
        densify_ring(diamond_airfoil(-1.48, 1.22 * s, 0.16, 2.00, 1.14), 4),
        densify_ring(diamond_airfoil(-1.52, 1.35 * s, 0.17, 2.10, 1.12), 4),
        densify_ring(diamond_airfoil(-1.55, 1.48 * s, 0.18, 2.20, 1.10), 4),
    ], skin, collection, 0.016, cap=True)
    add_folded_sheet(
        f"{name}_Leading",
        (-1.50, 1.48 * s, 0.26),
        (-2.70, 3.45 * s, 0.44),
        (-2.85, 3.45 * s, 0.10),
        (-1.65, 1.48 * s, -0.16),
        0.110, skin, collection, 0.006,
    )
    add_folded_sheet(
        f"{name}_FlapSlot",
        (-2.00, 1.50 * s, 0.14),
        (-2.85, 3.90 * s, 0.32),
        (-2.65, 3.90 * s, 0.00),
        (-1.80, 1.50 * s, -0.12),
        0.080, soot, collection, 0.002,
    )
    # C177: flap sits in the wing, not a proud cowl (C176 plastic lumps).
    add_folded_sheet(
        f"{name}_Flap",
        (-2.08, 1.52 * s, 0.22),
        (-2.98, 3.96 * s, 0.40),
        (-3.85, 3.96 * s, 0.10),
        (-3.12, 1.52 * s, -0.02),
        0.110, armor, collection, 0.003,
    )
    add_overlap_plate(f"{name}_TipMark", (-3.20, 3.88 * s, 0.46), (0.18, 0.14, 0.05), armor, collection, 0.003)
    return wing


def add_merged_nacelle(tag, sign, lod, mats, collection):
    """Drive house grown out of the aft body. One bell per side, no stacked second drive."""
    hull = mats["Material_Hull"]
    y = 0.70 * sign
    nacelle = loft_from_rings(f"Nacelle_{tag}", [
        densify_ring(station_ring(-2.90, y, 0.12, 0.40, 0.46, flat=0.14, box=0.84, keel=0.12)),
        densify_ring(station_ring(-3.60, y, 0.13, 0.42, 0.48, flat=0.10, box=0.90, keel=0.08)),
        densify_ring(station_ring(-4.30, y, 0.14, 0.38, 0.44, flat=0.06, box=0.94, keel=0.06)),
        densify_ring(station_ring(-4.72, y, 0.14, 0.34, 0.40, flat=0.04, box=0.96, keel=0.04)),
    ], hull, collection, 0.010)
    add_hollow_bell(tag, -4.72, y, 0.14, 0.78, mats, collection)
    return nacelle


def add_greenhouse(tag, x, y, z, length, width, height, mats, collection):
    """Thin framed panes over a cut tub. Not a dark brick or lofted shoebox."""
    canopy = mats["Material_Canopy"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    xf = x + length * 0.50
    xa = x - length * 0.50
    yp = y - width
    ys = y + width
    z0 = z
    z1 = z + height
    add_folded_sheet(
        f"{tag}_PaneP",
        (xf - 0.04, yp, z0 + 0.03),
        (xa + 0.06, yp * 0.90, z0 + 0.05),
        (xa + 0.08, yp * 0.55, z1 * 0.90),
        (xf - 0.18, yp * 0.42, z1 * 0.62),
        0.012, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_PaneS",
        (xf - 0.04, ys, z0 + 0.03),
        (xf - 0.18, ys * 0.42, z1 * 0.62),
        (xa + 0.08, ys * 0.55, z1 * 0.90),
        (xa + 0.06, ys * 0.90, z0 + 0.05),
        0.012, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_Windscreen",
        (xf + 0.02, yp * 0.55, z0 + 0.04),
        (xf + 0.02, ys * 0.55, z0 + 0.04),
        (xf - 0.16, ys * 0.18, z1 * 0.64),
        (xf - 0.16, yp * 0.18, z1 * 0.64),
        0.012, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_RoofP",
        (xf - 0.18, yp * 0.18, z1 * 0.64),
        (xa + 0.10, yp * 0.22, z1 * 0.88),
        (xa + 0.10, 0.0, z1),
        (xf - 0.18, 0.0, z1 * 0.78),
        0.012, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_RoofS",
        (xf - 0.18, 0.0, z1 * 0.78),
        (xa + 0.10, 0.0, z1),
        (xa + 0.10, ys * 0.22, z1 * 0.88),
        (xf - 0.18, ys * 0.18, z1 * 0.64),
        0.012, canopy, collection, 0.002,
    )
    add_box(f"{tag}_Sill", (x, y, z0 + 0.006), (length * 0.46, width * 0.96, 0.010), armor, collection, 0.002)
    add_box(f"{tag}_Brow", (xf - 0.10, y, z0 + height * 0.22), (0.018, width * 0.36, height * 0.10), armor, collection, 0.002)
    add_box(f"{tag}_AftBulk", (xa + 0.08, y, z0 + height * 0.20), (0.016, width * 0.48, height * 0.14), armor, collection, 0.002)
    add_box(f"{tag}_Spine", (x - 0.04, y, z1 * 0.98), (length * 0.24, 0.008, 0.008), armor, collection, 0.002)
    for i, ox in enumerate((-0.42, -0.12, 0.16, 0.38)):
        add_cylinder(
            f"{tag}_Rivet_{i}", (x + ox, yp * 0.92, z0 + 0.02),
            0.009, 0.016, mech, collection, vertices=6, bevel=0.001, rot=(0, 0, 0),
        )


def airfoil_ring(x, y, z, chord, thick):
    le, te = chord * 0.42, chord * 0.58
    return [
        (x + le, y, z),
        (x + le * 0.62, y, z + thick * 0.48),
        (x + le * 0.12, y, z + thick),
        (x - te * 0.18, y, z + thick * 0.78),
        (x - te * 0.55, y, z + thick * 0.34),
        (x - te, y, z),
        (x - te * 0.55, y, z - thick * 0.26),
        (x - te * 0.18, y, z - thick * 0.58),
        (x + le * 0.12, y, z - thick * 0.88),
        (x + le * 0.62, y, z - thick * 0.40),
    ]


def inset_large_faces(obj, thickness=0.04, depth=0.02, min_area=0.16):
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    faces = [
        face for face in bm.faces
        if face.calc_area() >= min_area and abs(face.calc_center_median().x) < 6.2
    ]
    if faces:
        bmesh.ops.inset_individual(bm, faces=faces, thickness=thickness, depth=depth)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0004)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    finish_mesh(obj, obj.data.materials[0], bevel=0.012)


def add_curve_hose(name, points, material, collection, radius=0.018):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for index, point in enumerate(points):
        bp = spline.bezier_points[index]
        bp.co = point
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.select_set(False)
    return finish_mesh(obj, material, bevel=0.003)


def add_thin_canopy(tag, x, y, z, length, width, height, mats, collection):
    """Thin glass shell in a metal frame, sitting in a cut tub."""
    canopy, armor, mech = mats["Material_Canopy"], mats["Material_Armor"], mats["Material_Mechanical"]
    xf = x + length * 0.50
    xa = x - length * 0.50
    yp = y - width
    ys = y + width
    z0 = z
    z1 = z + height
    add_folded_sheet(
        f"{tag}_Windscreen",
        (xf + 0.02, yp * 0.70, z0 + 0.02),
        (xf + 0.02, ys * 0.70, z0 + 0.02),
        (xf - 0.14, ys * 0.20, z1 * 0.90),
        (xf - 0.14, yp * 0.20, z1 * 0.90),
        0.010, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_PaneP",
        (xf - 0.06, yp, z0 + 0.02),
        (xa + 0.08, yp * 0.92, z0 + 0.03),
        (xa + 0.10, yp * 0.52, z1 * 0.62),
        (xf - 0.16, yp * 0.38, z1 * 0.50),
        0.010, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_PaneS",
        (xf - 0.06, ys, z0 + 0.02),
        (xf - 0.16, ys * 0.38, z1 * 0.50),
        (xa + 0.10, ys * 0.52, z1 * 0.62),
        (xa + 0.08, ys * 0.92, z0 + 0.03),
        0.010, canopy, collection, 0.002,
    )
    add_box(f"{tag}_RailP", (x, yp * 0.28, z1 * 0.78), (length * 0.30, 0.012, 0.012), armor, collection, 0.001)
    add_box(f"{tag}_RailS", (x, ys * 0.28, z1 * 0.78), (length * 0.30, 0.012, 0.012), armor, collection, 0.001)
    add_box(f"{tag}_Sill", (x, y, z0 + 0.006), (length * 0.48, width * 0.94, 0.012), armor, collection, 0.002)
    add_box(f"{tag}_Brow", (xf - 0.08, y, z0 + height * 0.28), (0.024, width * 0.42, height * 0.12), armor, collection, 0.002)
    add_box(f"{tag}_AftBulk", (xa + 0.08, y, z0 + height * 0.22), (0.020, width * 0.52, height * 0.14), armor, collection, 0.002)
    add_box(f"{tag}_Mullion", (x + length * 0.02, y, z0 + height * 0.22), (0.012, width * 0.22, height * 0.10), armor, collection, 0.002)
    for i, ox in enumerate((-0.28, -0.06, 0.14, 0.32)):
        add_cylinder(
            f"{tag}_Rivet_{i}", (x + ox, yp * 0.90, z0 + 0.016),
            0.008, 0.014, mech, collection, vertices=6, bevel=0.001, rot=(0, 0, 0),
        )
    return None


def add_empty(name, loc, collection, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.2
    obj.location = loc
    if parent:
        obj.parent = parent
    obj["socket"] = True
    return obj


def sockets():
    """Mount points, in Blender space (x forward, y span, z up).

    Re-seated for the C59 raised interceptor. Names are the runtime contract.
    Envelope target: x -4.95 -> 5.60, span +/-3.64, z -1.05 -> 1.20.
    """
    return {
        "SOCKET_Weapon_Front": (5.28, 0.0, 0.14),
        "SOCKET_Mining_Front": (5.42, 0.0, -0.14),
        "SOCKET_Engine_Main": (-4.30, 0.0, 0.14),
        "SOCKET_Trail_Main": (-4.50, 0.0, 0.14),
        "SOCKET_Trail_Port": (-4.40, -1.05, 0.16),
        "SOCKET_Trail_Starboard": (-4.40, 1.05, 0.16),
        "SOCKET_Utility_Dorsal": (0.40, 0.0, 0.95),
        "SOCKET_Cargo_Ventral": (-0.40, 0.0, -0.90),
        "SOCKET_Camera_Focus": (0.80, 0.0, 0.28),
        "SOCKET_RCS_Port": (-0.20, -1.95, 0.16),
        "SOCKET_RCS_Starboard": (-0.20, 1.95, 0.16),
    }


def shade_and_uv(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    wn = obj.modifiers.new("ExportWN", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_modifiers(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.018, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if "UV1" in obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers["UV1"])
    uv1 = obj.data.uv_layers.new(name="UV1")
    uv0 = obj.data.uv_layers.active
    for loop in obj.data.loops:
        uv1.data[loop.index].uv = uv0.data[loop.index].uv * 8.0
    obj.select_set(False)


def bake_ao_into_albedo(obj, samples=12, size=None):
    size = TEX if size is None else size  # see role_maps: resolve at call time, not def time
    if obj.type != "MESH" or not obj.data.polygons or not obj.data.uv_layers.active:
        return
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 6
    img_name = f"AO_{obj.name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    ao = bpy.data.images.new(img_name, width=size, height=size, alpha=False)
    ao.colorspace_settings.name = "Non-Color"
    mat = obj.data.materials[0] if obj.data.materials else None
    if mat is None or not mat.use_nodes:
        return
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = ao
    node.name = "SF_AO_TARGET"
    mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.bake(type="AO", use_clear=True, margin=6)
    except Exception as exc:
        print(f"AO bake skip {obj.name}: {exc}")
        return
    finally:
        for victim in [n for n in mat.node_tree.nodes if n.name == "SF_AO_TARGET"]:
            mat.node_tree.nodes.remove(victim)
    albedo = next((n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "basecolor" in n.image.name), None)
    if albedo is None:
        return
    ap = list(albedo.pixels)
    op = list(ao.pixels)
    n = min(len(ap) // 4, len(op) // 4)
    for i in range(n):
        factor = 0.84 + 0.16 * op[i * 4]
        ap[i * 4] *= factor
        ap[i * 4 + 1] *= factor
        ap[i * 4 + 2] *= factor
    albedo.pixels = ap
    albedo.pack()


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"HORNET_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, armor, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    warning, accent, ceramic = mats["Material_Warning"], mats["Material_Accent"], mats["Material_Ceramic"]
    root = add_empty(f"HORNET_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_HORNET_PRODUCTION_V1", "partId": "hornet_production_v1",
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "embeddedPlume": False,
    }
    # C158: hold waist and house beam so dorsal chase is three volumes, not one diamond.
    body = loft_volume("Hull", (
        (5.48, 0.18, 0.18, 0.08, 0.04, 0.16, 0.90),
        (4.45, 0.52, 0.78, 0.32, 0.48, 0.30, 0.28),
        (3.30, 0.98, 0.56, 0.18, 0.14, 0.50, 0.22),
        (2.05, 1.42, 0.44, 0.08, 0.08, 0.72, 0.14),
        (0.70, 2.58, 0.46, 0.08, 0.50, 0.88, 0.10),
        (-0.50, 2.58, 0.46, 0.08, 0.50, 0.88, 0.10),
        (-1.80, 1.46, 0.50, 0.10, 0.06, 0.88, 0.10),
        (-3.10, 1.40, 0.50, 0.12, 0.04, 0.90, 0.08),
        (-4.35, 1.36, 0.46, 0.12, 0.03, 0.92, 0.06),
    ), hull, collection, 0.12)
    subdivide_mesh(body, 1)
    # C177: longer/wider tub so the white hull rim is the window frame at D=144.
    cut = safe_boolean_cut(body, "CockpitBoolean", (3.95, 0.0, 0.86), (1.40, 0.42, 0.30))
    print(f"cockpit boolean {'hit' if cut else 'miss — face delete'}")
    if not cut:
        delete_faces_in_box(body, 2.85, 5.20, -0.50, 0.50, 0.58, 2.00, normal="z", normal_min=0.18)
    # Bigger roof mouths so chase looks into bells, not painted squares. No connecting crate-cut.
    delete_faces_in_cylinder(body, -3.90, -2.85, 0.88, 0.70, 0.62, normal="z", normal_min=0.15)
    delete_faces_in_cylinder(body, -3.90, -2.85, -0.88, 0.70, 0.62, normal="z", normal_min=0.15)
    delete_faces_in_box(body, -1.80, -0.80, 1.85, 2.40, 0.05, 0.50, normal="y", normal_min=0.22)
    delete_faces_in_box(body, -1.80, -0.80, -2.40, -1.85, 0.05, 0.50, normal="y-", normal_min=0.22)
    report_shells(body, "hull after wells")
    bevel = body.modifiers.new("HullBevel", "BEVEL")
    bevel.width = 0.018
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(28)
    wn = body.modifiers.new("HullWN", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_modifiers(body)
    # C154: three large dorsal courses on the new stations, not a waffle and not hoops.
    knife_inset_courses(body, 2.40, 0.20, -0.90, 0.90, 0.28, 0.95, 2, 1, 0.034, 0.080, "z", 0.28)
    knife_inset_courses(body, -0.20, -2.00, -0.80, 0.80, 0.16, 0.78, 2, 1, 0.034, 0.076, "z", 0.24)
    knife_inset_courses(body, 2.20, -1.40, 1.20, 2.00, -0.02, 0.62, 2, 1, 0.028, 0.062, "y", 0.36)
    knife_inset_courses(body, 2.20, -1.40, -2.00, -1.20, -0.02, 0.62, 2, 1, 0.028, 0.062, "y-", 0.36)
    report_shells(body, "hull after plate courses")

    soot = mats["Material_Soot"]
    # Floor of the tub only. Visor sits down in the hole so the boolean rim is the white frame.
    add_box("Tub_Floor", (3.95, 0.0, 0.32), (1.15, 0.30, 0.012), soot, collection, 0.002)
    canopy = mats["Material_Canopy"]
    add_folded_sheet(
        "Canopy_Visor",
        (4.42, -0.18, 0.48),
        (4.42, 0.18, 0.48),
        (3.28, 0.16, 0.50),
        (3.28, -0.16, 0.50),
        0.014, canopy, collection, 0.002,
    )
    add_box("CanopyFrame_Fore", (4.72, 0.0, 0.88), (0.090, 0.46, 0.060), hull, collection, 0.002)
    add_box("CanopyFrame_Aft", (3.05, 0.0, 0.86), (0.090, 0.44, 0.060), hull, collection, 0.002)
    add_box("CanopyFrame_P", (3.88, -0.48, 0.87), (0.78, 0.070, 0.060), hull, collection, 0.002)
    add_box("CanopyFrame_S", (3.88, 0.48, 0.87), (0.78, 0.070, 0.060), hull, collection, 0.002)

    add_five_wall_tub("AvionicsTub", (0.85, -1.18, 0.22), (0.24, 0.10, 0.11), 0.040, mech, collection)
    add_box("AvionicsRack", (0.85, -1.18, 0.16), (0.16, 0.032, 0.05), armor, collection, 0.002)
    add_five_wall_tub("RadiatorTub", (-1.75, 0.98, 0.18), (0.28, 0.10, 0.11), 0.040, mech, collection)

    add_folded_sheet(
        "Belt_Nose_P",
        (4.85, -0.58, 0.08), (3.10, -1.22, 0.06),
        (3.10, -0.88, 0.50), (4.85, -0.28, 0.52),
        0.055, armor, collection, 0.004,
    )
    add_folded_sheet(
        "Belt_Nose_S",
        (4.85, 0.58, 0.08), (4.85, 0.28, 0.52),
        (3.10, 0.88, 0.50), (3.10, 1.22, 0.06),
        0.055, armor, collection, 0.004,
    )
    add_folded_sheet(
        "Belt_House_P",
        (-1.35, -1.58, 0.10), (-4.20, -1.42, 0.06),
        (-4.20, -1.08, 0.50), (-1.35, -1.22, 0.54),
        0.055, armor, collection, 0.004,
    )
    add_folded_sheet(
        "Belt_House_S",
        (-1.35, 1.58, 0.10), (-1.35, 1.22, 0.54),
        (-4.20, 1.08, 0.50), (-4.20, 1.42, 0.06),
        0.055, armor, collection, 0.004,
    )
    add_folded_sheet(
        "Belly_P",
        (2.20, -2.48, -0.12), (-1.10, -1.92, -0.08),
        (-1.10, -1.62, 0.30), (2.20, -2.18, 0.34),
        0.050, armor, collection, 0.004,
    )
    add_folded_sheet(
        "Belly_S",
        (2.20, 2.48, -0.12), (2.20, 2.18, 0.34),
        (-1.10, 1.62, 0.30), (-1.10, 1.92, -0.08),
        0.050, armor, collection, 0.004,
    )
    add_folded_sheet(
        "Keel_Spine",
        (1.40, -0.16, -0.42), (-0.40, -0.16, -0.38),
        (-0.40, 0.16, -0.38), (1.40, 0.16, -0.42),
        0.032, armor, collection, 0.004,
    )
    add_overlap_plate("Armor_CheekP", (1.40, -2.00, 0.14), (0.48, 0.040, 0.16), armor, collection, 0.006)
    add_overlap_plate("Armor_CheekS", (1.40, 2.00, 0.14), (0.48, 0.040, 0.16), armor, collection, 0.006)
    add_overlap_plate("Armor_NoseP", (5.05, -0.20, 0.24), (0.26, 0.022, 0.10), armor, collection, 0.004)
    add_overlap_plate("Armor_NoseS", (5.05, 0.20, 0.24), (0.26, 0.022, 0.10), armor, collection, 0.004)
    add_overlap_plate("Armor_KeelFore", (1.20, 0.00, -0.40), (0.40, 0.12, 0.018), armor, collection, 0.003)
    add_overlap_plate("Armor_WaistP", (0.20, -1.95, 0.16), (0.36, 0.032, 0.12), armor, collection, 0.004)
    add_overlap_plate("Armor_WaistS", (0.20, 1.95, 0.16), (0.36, 0.032, 0.12), armor, collection, 0.004)
    add_box("Accent_WaistP", (0.15, -1.62, 0.16), (0.32, 0.012, 0.05), accent, collection, 0.002)
    add_box("Accent_WaistS", (0.15, 1.62, 0.16), (0.32, 0.012, 0.05), accent, collection, 0.002)

    # C93/C94 keel tiles floated under the belly in starboard. Do not put them back.

    for sign, side in ((-1, "Port"), (1, "Starboard")):
        add_blended_interceptor_wing(f"Wing_{side}", sign, hull, armor, collection, soot=mats["Material_Soot"])
        # C154: bells sit on the rectangular house, mouths tilted up into the chase.
        add_hollow_bell(side, -3.20, 0.88 * sign, 0.08, 0.72, mats, collection)
        add_folded_sheet(
            f"GunCheek_{side}",
            (5.08, 0.18 * sign, -0.06), (4.28, 0.46 * sign, -0.08),
            (4.28, 0.46 * sign, 0.10), (5.08, 0.18 * sign, 0.12),
            0.028, armor, collection, 0.003,
        )
        add_overlap_plate(f"GunTrunnion_{side}", (4.58, 0.36 * sign, 0.00), (0.20, 0.07, 0.06), mech, collection, 0.004)
        add_cylinder(f"BarrelJacket_{side}", (4.85, 0.36 * sign, -0.02), 0.038, 0.22, mech, collection, vertices=10, bevel=0.002)
        add_five_wall_tub(f"RcsBay_{side}", (0.20, 2.05 * sign, 0.02), (0.22, 0.12, 0.10), 0.036, mech, collection)
        add_cylinder(f"RcsNoz_{side}", (0.32, 2.05 * sign, 0.02), 0.028, 0.10, soot, collection, 8, 0.001)
        add_rcs_cluster(side, (0.10, 1.95 * sign, 0.16), mats, collection, sign=sign)

    if lod <= 1:
        add_radiator_cassette("PortFlank", (-1.30, -1.80, 0.16), lod, mats, collection, length=0.80, height=0.18, yaw=0.0)
        add_radiator_cassette("StbdFlank", (-1.30, 1.80, 0.16), lod, mats, collection, length=0.80, height=0.18, yaw=0.0)
    rad = mats["Material_Radiator"]
    add_five_wall_tub("RadWellDorsal", (-1.50, 0.0, 0.44), (0.64, 0.22, 0.09), 0.040, mech, collection)
    for i in range(7):
        add_box(
            f"RadFinDorsal_{i}",
            (-1.50 - 0.48 + i * 0.16, 0.0, 0.58),
            (0.018, 0.22, 0.10),
            rad, collection, 0.001,
        )
    add_service_hatch("Dorsal", (-0.40, 0.28, 0.68), mats, collection, sx=0.18, sy=0.12)
    # C106 Repair_Patch photographed as a peach stamp on the spine. Leave it off.
    if lod == 0:
        add_curve_hose(
            "Hose_RadStbd",
            [(-1.75, 1.18, 0.28), (-2.10, 1.12, 0.22), (-2.80, 1.00, 0.18), (-3.40, 0.92, 0.16)],
            mech, collection, 0.016,
        )
        add_curve_hose(
            "Hose_RadPort",
            [(-1.75, -1.18, 0.28), (-2.10, -1.12, 0.22), (-2.80, -1.00, 0.18), (-3.40, -0.92, 0.16)],
            mech, collection, 0.016,
        )
        add_cylinder("HoseNut_StbdA", (-1.75, 1.18, 0.28), 0.038, 0.028, mech, collection, 8, 0.001)
        add_cylinder("HoseNut_StbdB", (-3.38, 0.92, 0.16), 0.038, 0.028, mech, collection, 8, 0.001)
        add_cylinder("HoseNut_PortA", (-1.75, -1.18, 0.28), 0.038, 0.028, mech, collection, 8, 0.001)
        add_cylinder("HoseNut_PortB", (-3.38, -0.92, 0.16), 0.038, 0.028, mech, collection, 8, 0.001)
        add_curve_hose(
            "Hose_CollarS",
            [(-2.85, 0.98, 0.22), (-3.05, 0.94, 0.18), (-3.22, 0.90, 0.14)],
            mech, collection, 0.014,
        )
        add_curve_hose(
            "Hose_CollarP",
            [(-2.85, -0.98, 0.22), (-3.05, -0.94, 0.18), (-3.22, -0.90, 0.14)],
            mech, collection, 0.014,
        )
        add_folded_sheet(
            "ServicePad_P",
            (-0.40, -1.38, 0.04), (-0.18, -1.38, 0.04),
            (-0.18, -1.22, 0.14), (-0.40, -1.22, 0.14),
            0.012, mech, collection, 0.002,
        )
        add_folded_sheet(
            "ServicePad_S",
            (-0.40, 1.38, 0.04), (-0.40, 1.22, 0.14),
            (-0.18, 1.22, 0.14), (-0.18, 1.38, 0.04),
            0.012, mech, collection, 0.002,
        )

    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        obj.parent = root

    groups = {}
    for obj in mesh_objects:
        name = obj.data.materials[0].name if obj.data.materials else "Material_Hull"
        groups.setdefault(name, []).append(obj)
    merged = []
    for material_name, objects in sorted(groups.items()):
        objects = [obj for obj in objects if obj.data and len(obj.data.vertices) > 0]
        if not objects:
            continue
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            apply_modifiers(obj)
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        if len(objects) > 1:
            result = bpy.ops.object.join()
            print(f"join {material_name} n={len(objects)} {result}")
        active.name = f"LOD{lod}_{material_name.replace('Material_', '')}"
        active.parent = root
        tri = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=tri.name)
        shade_and_uv(active)
        merged.append(active)

    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)
    bm = bmesh.new()
    for point in [
        (5.7, 0, 0.14), (0.2, -4.55, 0.12), (0.2, 4.55, 0.12),
        (-5.1, -1.4, 0.16), (-5.1, 1.4, 0.16),
        (1.2, -1.2, -1.05), (1.2, 1.2, -1.05),
        (3.2, 0, 1.10), (-0.6, 0, 1.00),
    ]:
        bm.verts.new(point)
    bm.verts.ensure_lookup_table()
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    collision_mesh = bpy.data.meshes.new("COLLISION_HULL_MESH")
    bm.to_mesh(collision_mesh)
    bm.free()
    collision = bpy.data.objects.new("COLLISION_HULL", collision_mesh)
    collection.objects.link(collision)
    collision.parent = root
    collision.hide_render = True
    collision["collision"] = True
    collision["nonRender"] = True
    hull_tris = next((sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged if "Hull" in obj.name), 0)
    return collection, {
        "lod": lod,
        "triangles": sum(sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged),
        "hullTriangles": hull_tris,
        "draws": len(merged),
        "materials": sorted(groups),
    }


def export_lod(collection, lod):
    out = FAMILY / "source" / "wholeships" / f"hornet_production_v1_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    tmp = out.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    for attempt in range(6):
        try:
            if out.exists():
                out.unlink()
            shutil.move(str(tmp), str(out))
            break
        except OSError:
            if attempt == 5:
                raise
            import time
            time.sleep(0.35 * (attempt + 1))
    return out


def look_at(obj, target=(0, 0, 0.1)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_studio(light_scale=1.0):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    try:
        scene.view_settings.look = "AgX - Medium Contrast"
    except TypeError:
        scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.85
    eevee = getattr(scene, "eevee", None)
    if eevee:
        for attr, val in (
            ("use_ssr", True),
            ("use_ssr_refraction", True),
            ("use_raytracing", True),
            ("use_shadows", True),
        ):
            if hasattr(eevee, attr):
                try:
                    setattr(eevee, attr, val)
                except Exception:
                    pass
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.036, 0.040, 0.046, 1)
    bg.inputs["Strength"].default_value = 1.85
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 560, (0.94, 0.96, 1), 22),
        ("Fill", (4, 16, 8), 980, (0.76, 0.80, 0.84), 20),
        ("Top", (2, 2, 16), 640, (0.88, 0.90, 0.94), 18),
        ("Rim", (-14, -5, 7), 620, (0.78, 0.84, 0.92), 14),
        ("Kick", (-6, 10, -4), 260, (0.74, 0.78, 0.84), 12),
        ("AftFill", (-10, -12, 8), 420, (0.80, 0.84, 0.90), 16),
        ("StbdFill", (0.9, 12.0, 3.8), 520, (0.88, 0.90, 0.94), 18),
    ):
        data = bpy.data.lights.new(name, "AREA")
        # Same relative lighting at the runtime display scale: distances/sizes scale with the
        # ship, area-light power with the square so illumination per hull area is unchanged.
        data.energy = energy * light_scale * light_scale
        data.color = color
        data.size = size * light_scale
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = tuple(component * light_scale for component in loc)
        look_at(obj)
    return camera


def snap(camera, path, loc, target, lens):
    camera.location = loc
    camera.data.lens = lens
    look_at(camera, target)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def override_emission(meshes, color_fn, clay=False):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        mat = bpy.data.materials.new(f"ISO_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        color, strength = color_fn(obj)
        if clay:
            bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.47, 1)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.58
            mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        else:
            emit = mat.node_tree.nodes.new("ShaderNodeEmission")
            emit.inputs["Color"].default_value = (*color, 1)
            emit.inputs["Strength"].default_value = strength
            mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        if obj.material_slots:
            obj.material_slots[0].material = mat
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name, [])
        for index, material in enumerate(mats):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def runtime_display_scale(collection):
    """Scale factor that reproduces the live game's displayed size for this export.

    The runtime shows the hull at ASSEMBLY_HULL_UNITS * HORNET_COLLISION_RADIUS world units of
    length regardless of authored metres. Measure the built collection's +X extent and return
    the uniform scale that makes the render match what a player at D=144 actually sees.
    """
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in collection.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x); mins.y = min(mins.y, world.y); mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x); maxs.y = max(maxs.y, world.y); maxs.z = max(maxs.z, world.z)
    extent_x = maxs.x - mins.x
    if extent_x < 1e-6:
        raise RuntimeError("hornet render collection has no measurable +X extent")
    target = ASSEMBLY_HULL_UNITS * HORNET_COLLISION_RADIUS
    scale = target / extent_x
    print(f"runtime display scale {scale:.3f} (authored {extent_x:.2f} m -> {target:.1f} WU)")
    return scale


def apply_render_scale(collection, scale):
    """Parent the rendered assembly's scene-root objects to one empty and scale about origin."""
    pivot = bpy.data.objects.new("RuntimeDisplayScale", None)
    bpy.context.scene.collection.objects.link(pivot)
    for obj in collection.objects:
        if obj.parent is not None:
            continue
        matrix = obj.matrix_world.copy()
        obj.parent = pivot
        obj.matrix_world = matrix
    pivot.scale = (scale, scale, scale)


def render_cycle(collection):
    for other in bpy.data.collections:
        other.hide_render = other is not collection
    display_scale = runtime_display_scale(collection)
    apply_render_scale(collection, display_scale)
    camera = setup_studio(light_scale=display_scale)
    out = FAMILY / "evidence" / "hornet" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    # Cycle stills are the live chase camera only. Studio three-quarter / seat
    # crops do not count — that is why the Hornet loop stalled.
    render_cycle_chase_stills(camera, out)
    views = {
        "grazing_close": ((6.6, -5.4, 2.0), (1.15, 0, 0.35), 48),
        "drive_rear": ((-6.6, -1.8, 0.55), (-3.90, 0.90, 0.12), 46),
    }
    meshes = [obj for obj in collection.objects if obj.type == "MESH" and not obj.get("collision")]
    for name in ("grazing_close", "drive_rear"):
        loc, target, lens = views[name]
        snap(
            camera,
            out / f"{name}.png",
            tuple(component * display_scale for component in loc),
            tuple(component * display_scale for component in target),
            lens,
        )

    # C155: skip glass so clay shows the canopy tub as a hole, not a gray lid.
    clay_meshes = [obj for obj in meshes if "Canopy" not in obj.name]
    backups = override_emission(clay_meshes, lambda _o: ((0.46, 0.46, 0.47), 1.0), clay=True)
    render_chase_still(camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0)
    render_chase_still(camera, out / "clay_play_chase_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0)
    restore_mats(meshes, backups)

    ids = {
        "Hull": (0.75, 0.75, 0.78), "Armor": (0.08, 0.16, 0.18), "Mechanical": (0.45, 0.45, 0.48),
        "Canopy": (0.02, 0.08, 0.1), "Accent": (0.05, 0.7, 0.85), "Warning": (0.9, 0.4, 0.05),
        "Ceramic": (0.7, 0.55, 0.35), "Thruster": (0.2, 0.7, 0.9), "Radiator": (0.35, 0.22, 0.12),
    }

    def id_color(obj):
        for key, color in ids.items():
            if key.lower() in obj.name.lower():
                return color, 1.0
        return (0.4, 0.4, 0.4), 1.0

    backups = override_emission(meshes, id_color)
    render_chase_still(camera, out / "id_or_material_id.png", distance=DISTANCE_CLOSE, heading_deg=0.0)
    restore_mats(meshes, backups)

    def map_emit(suffix):
        def fn(obj):
            mat = obj.data.materials[0] if obj.data.materials else None
            if not mat or not mat.use_nodes:
                return (0.5, 0.5, 0.5), 1.0
            img = next((n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and suffix in n.image.name), None)
            if img is None:
                return (0.3, 0.3, 0.3), 1.0
            # Average a few pixels so isolation is not black if sampling fails.
            return (0.55, 0.55, 0.55) if suffix == "orm" else (0.5, 0.5, 1.0), 1.0
        return fn

    backups = override_emission(meshes, map_emit("orm"))
    render_chase_still(camera, out / "orm_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0)
    restore_mats(meshes, backups)
    backups = override_emission(meshes, map_emit("normal"))
    render_chase_still(camera, out / "normal_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0)
    restore_mats(meshes, backups)
    return out


def main():
    # `global` must precede every use of the name in this function.
    global TEX
    FAMILY.mkdir(parents=True, exist_ok=True)
    reset_scene()
    print(f"hornet cycle {CYCLE}: map ladder {TEX_BY_LOD}")
    reports = []
    collections = []
    for lod in (0, 1, 2):
        # Rebuild the material set at this LOD's map size. Sharing one set across all three levels
        # is what made every level carry LOD0's textures.
        TEX = TEX_BY_LOD[lod]
        mats = create_materials()
        collection, report = build_lod(lod, mats)
        output = export_lod(collection, lod)
        report.update({"path": str(output.relative_to(FAMILY)).replace("\\", "/"), "bytes": output.stat().st_size, "sha256": sha256(output)})
        if report["hullTriangles"] < 12000:
            raise RuntimeError(f"hornet lod{lod} hull {report['hullTriangles']} < 12000")
        collections.append(collection)
        reports.append(report)
    stills = render_cycle(collections[0])
    report = {
        "schema": "spaceface.hornetMtx.cycle.v1",
        "shipId": "hornet",
        "cycle": CYCLE,
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
    }
    (FAMILY / "evidence" / "hornet").mkdir(parents=True, exist_ok=True)
    (FAMILY / "evidence" / "hornet" / f"cycle_{CYCLE:02d}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "cycle": CYCLE, "hull0": reports[0]["hullTriangles"], "tris0": reports[0]["triangles"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
