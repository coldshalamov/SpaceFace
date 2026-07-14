"""Build the V12 Helios hub family from CC0 source geometry.

This is an authoring candidate only. It deliberately writes only inside the V12
candidate folder and never promotes release assets.
"""

from pathlib import Path
import math
import random

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
SOURCE = ROOT / "assets/third_party/helios_v12/c04_blenderkit_scifi_station/blenderkit_scifi_station_cc0.blend"
EVIDENCE = OUT / "evidence"
BLEND_OUT = OUT / "helios_hub_v12_candidate.blend"


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                  bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def material(name, base, metallic=0.0, rough=0.45, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*base, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def relink(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def smooth_bevel(obj, amount=0.35, segments=3):
    if obj.type != "MESH":
        return obj
    bevel = obj.modifiers.new("Production bevel", "BEVEL")
    bevel.width = amount
    bevel.segments = segments
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(25)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def extruded_poly(name, points, depth, z, mat, coll, bevel=0.45):
    n = len(points)
    hz = depth / 2.0
    verts = [(x, y, z - hz) for x, y in points] + [(x, y, z + hz) for x, y in points]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    return smooth_bevel(obj, bevel, 4)


def cube(name, loc, scale, mat, coll, bevel=0.25, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    relink(obj, coll)
    obj.data.materials.append(mat)
    return smooth_bevel(obj, bevel, 3)


def cylinder(name, loc, radius, depth, mat, coll, vertices=16, rotation=(0, 0, 0), bevel=0.18):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    relink(obj, coll)
    obj.data.materials.append(mat)
    return smooth_bevel(obj, bevel, 3)


def beam_between(name, a, b, width, depth, mat, coll, bevel=0.22):
    a, b = Vector(a), Vector(b)
    mid = (a + b) * 0.5
    delta = b - a
    length = delta.length
    obj = cube(name, mid, (width / 2, length / 2, depth / 2), mat, coll, bevel)
    obj.rotation_euler = delta.to_track_quat("Y", "Z").to_euler()
    return obj


def append_primary_source(coll, materials):
    with bpy.data.libraries.load(str(SOURCE), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith("Sci-Fi_Station_")]
    root = bpy.data.objects.new("HUB_Crown_Primary_CC0", None)
    coll.objects.link(root)
    root.location = (-1.5, -1.0, 3.8)
    root.scale = (0.145, 0.145, 0.075)
    imported = []
    for obj in dst.objects:
        if obj is None or obj.type != "MESH" or obj.data is None:
            continue
        coll.objects.link(obj)
        obj.parent = root
        obj.name = "CC0_" + obj.name.replace("Sci-Fi_Station_", "")
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        if "lights" in obj.name.lower():
            obj.data.materials.append(materials["cyan"])
        elif "spike" in obj.name.lower():
            obj.data.materials.append(materials["armor"])
        elif "pod" in obj.name.lower():
            obj.data.materials.append(materials["light"])
        else:
            obj.data.materials.append(materials["hull"])
        imported.append(obj)
    return root, imported


def linked_source_detail(template, name, loc, scale, mat, coll, rotation=(0, 0, 0)):
    obj = template.copy()
    obj.data = template.data
    obj.name = name
    obj.parent = None
    obj.location = loc
    obj.scale = scale
    obj.rotation_euler = rotation
    coll.objects.link(obj)
    obj.data = obj.data.copy()
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def build_hub(m, coll):
    # One connected tuning-fork/Y silhouette. Every primary mass overlaps the
    # crown or another mass; the central negative space is a real docking bite.
    stem = extruded_poly("HUB_CommandSpine",
        [(-9, -38), (7, -35), (11, -22), (10, -4), (6, 9), (-7, 10), (-12, -5), (-13, -25)],
        7.0, 1.0, m["hull"], coll, 0.75)
    left = extruded_poly("HUB_ForgeArm",
        [(-8, 4), (-20, 6), (-34, 14), (-43, 27), (-42, 45), (-33, 53), (-23, 48), (-22, 31), (-14, 18), (-4, 11)],
        6.0, 1.6, m["armor"], coll, 0.8)
    right = extruded_poly("HUB_CommercialArm",
        [(5, 5), (16, 8), (28, 17), (34, 31), (33, 45), (25, 50), (17, 43), (18, 29), (12, 18), (2, 12)],
        5.4, 1.3, m["light"], coll, 0.75)
    extruded_poly("HUB_CentralKeel",
        [(-15, -8), (-8, -16), (5, -14), (16, -4), (14, 10), (4, 16), (-10, 13), (-18, 3)],
        8.5, 0.3, m["hull"], coll, 0.9)

    root, source_objs = append_primary_source(coll, m)
    detail_template = next(o for o in source_objs if "outer ring pods" in o.name.lower())

    # Docking jaws: inward-facing armored collars physically rooted in each fork.
    linked_source_detail(detail_template, "HUB_DockCollar_Port", (-28.5, 42.5, 4.4),
                         (0.075, 0.075, 0.052), m["hull"], coll)
    linked_source_detail(detail_template, "HUB_DockCollar_Starboard", (25.0, 40.5, 4.0),
                         (0.068, 0.068, 0.048), m["light"], coll)
    beam_between("HUB_DockJaw_Port", (-25, 38, 2.5), (-10.8, 35, 2.5), 2.7, 4.0, m["armor"], coll, 0.45)
    beam_between("HUB_DockJaw_Starboard", (23, 37, 2.3), (10.8, 34, 2.3), 2.3, 3.6, m["light"], coll, 0.4)
    # The bite stays physically open between x=-8..8 for a ship approach corridor.
    for y in (24, 30, 36, 42):
        cube(f"HUB_BiteLight_L_{y}", (-9.4, y, 4.8), (0.5, 1.25, 0.28), m["cyan"], coll, 0.12)
        cube(f"HUB_BiteLight_R_{y}", (9.4, y, 4.8), (0.5, 1.25, 0.28), m["cyan"], coll, 0.12)

    # Forge zone: thick heat exchangers, tanks and a vertical furnace stack.
    for i, y in enumerate((19, 26, 33, 40)):
        cube(f"HUB_ForgeRadiator_{i}", (-35.5, y, 6.0), (4.6, 1.1, 2.5), m["orange"], coll, 0.32)
        beam_between(f"HUB_ForgeBrace_{i}", (-31, y, 2.5), (-35.5, y, 5.0), 0.8, 0.9, m["dark"], coll, 0.12)
    cylinder("HUB_ForgeTower", (-29.5, 21.0, 10.0), 4.2, 15.0, m["armor"], coll, 12, bevel=0.38)
    cylinder("HUB_ForgeCrown", (-29.5, 21.0, 18.0), 5.0, 1.6, m["orange"], coll, 16, bevel=0.22)
    for z in (7, 11, 15):
        cylinder(f"HUB_ForgeBand_{z}", (-29.5, 21.0, z), 4.45, 0.7, m["dark"], coll, 16, bevel=0.12)

    # Commercial zone: terraced habitation with luminous navigation ribs.
    for i, (x, y, sx, sy, z) in enumerate(((19, 18, 4.8, 5.5, 5.0), (24, 25, 5.5, 6, 6.2),
                                            (27, 34, 5, 5.8, 7.2), (25, 43, 4.4, 4.4, 6.0))):
        extruded_poly(f"HUB_HabTerrace_{i}",
            [(x-sx, y-sy), (x+sx*0.8, y-sy*0.8), (x+sx, y+sy*0.55), (x, y+sy), (x-sx*0.9, y+sy*0.45)],
            2.0, z, m["light"] if i % 2 == 0 else m["hull"], coll, 0.38)
        cube(f"HUB_HabWindow_{i}", (x-0.5, y-1.0, z+1.25), (2.6, 0.35, 0.32), m["cyan"], coll, 0.1,
             rotation=(0, 0, math.radians(-18)))

    # Command zone: vertical identity and attached sensor planes.
    cylinder("HUB_CommandTower", (-3.0, -22.0, 11.5), 5.2, 19.0, m["hull"], coll, 10, bevel=0.5)
    cylinder("HUB_CommandLantern", (-3.0, -22.0, 21.3), 3.8, 1.2, m["cyan"], coll, 12, bevel=0.2)
    cylinder("HUB_SensorMast", (-3.0, -22.0, 28.0), 0.75, 13.0, m["dark"], coll, 12, bevel=0.12)
    for idx, ang in enumerate((0, 120, 240)):
        a = math.radians(ang)
        beam_between(f"HUB_SensorVane_{idx}", (-3, -22, 28),
                     (-3 + math.cos(a)*6.5, -22 + math.sin(a)*6.5, 31),
                     0.7, 0.55, m["cyan"], coll, 0.12)

    # Structural underside braces make every zone read as one engineered object.
    for idx, (a, b) in enumerate((
        ((-7, 3, -2.8), (-32, 29, -3.1)), ((6, 4, -2.6), (26, 29, -2.8)),
        ((-8, -10, -3.1), (-3, -33, -3.1)), ((-16, 13, -2.5), (17, 14, -2.5)))):
        beam_between(f"HUB_UndersideTruss_{idx}", a, b, 1.25, 1.3, m["dark"], coll, 0.18)

    return [stem, left, right, root]


def build_split_hex_gate(m, coll, origin=(61, -24, 4)):
    ox, oy, oz = origin
    # A tall split-hex: two separately anchored halves and a luminous transit gap.
    pts = [(-12, 0), (-6, 10.4), (6, 10.4), (12, 0), (6, -10.4), (-6, -10.4)]
    segs = [(0, 1), (1, 2), (5, 0), (2, 3), (3, 4), (4, 5)]
    for i, (a, b) in enumerate(segs):
        pa, pb = pts[a], pts[b]
        beam_between(f"GATE_HexSegment_{i}", (ox+pa[0], oy, oz+pa[1]),
                     (ox+pb[0], oy, oz+pb[1]), 1.8, 2.2, m["armor"], coll, 0.3)
    # split seam, anchored pylons and field emitters
    for side in (-1, 1):
        x = ox + side * 6.0
        cylinder(f"GATE_Anchor_{side}", (x, oy, oz-13.0), 3.0, 6.0, m["hull"], coll, 12, bevel=0.35)
        cylinder(f"GATE_Emitter_{side}", (ox + side*11.2, oy, oz), 1.35, 3.0, m["cyan"], coll, 12,
                 rotation=(math.radians(90), 0, 0), bevel=0.18)
    cube("GATE_Field", (ox, oy+0.35, oz), (0.18, 0.15, 9.0), m["cyan_soft"], coll, 0.08)
    return origin


def hero_rock(name, loc, scale, seed, rock_mat, ore_mat, coll):
    random.seed(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    relink(obj, coll)
    obj.data.materials.append(rock_mat)
    obj.data.materials.append(ore_mat)
    for v in obj.data.vertices:
        n = v.co.normalized()
        wave = (0.14 * math.sin(n.x*9.0 + seed) + 0.10 * math.sin(n.y*13.0-seed*0.3)
                + 0.08 * math.cos(n.z*17.0+seed*0.7))
        crater = -0.16 * max(0.0, math.sin(n.x*5.0+n.z*7.0+seed))**5
        v.co *= 1.0 + wave + crater
    obj.scale = scale
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Embedded ore seams are face materials on the closed rock mesh: no floating sheets.
    for p in obj.data.polygons:
        c = p.center.normalized()
        seam = abs(math.sin(c.x*12.0 + c.y*7.0 + seed*0.6))
        p.material_index = 1 if seam > 0.91 and c.z > -0.5 else 0
        p.use_smooth = True
    obj["watertightIntent"] = True
    obj["heroRockVariant"] = seed
    return obj


def build_rocks(m, coll):
    return [
        hero_rock("ROCK_HeliosFerrite", (-56, -29, 2), (8.5, 6.2, 5.6), 11, m["rock_a"], m["ore_orange"], coll),
        hero_rock("ROCK_IceFracture", (-70, -13, 3), (6.5, 8.8, 6.0), 23, m["rock_b"], m["ore_cyan"], coll),
        hero_rock("ROCK_CobaltCrown", (-48, -7, 3), (5.5, 5.8, 9.2), 37, m["rock_c"], m["ore_violet"], coll),
    ]


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_camera(name, loc, target, lens=52, ortho=None):
    data = bpy.data.cameras.new(name + "_Data")
    cam = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    data.lens = lens
    if ortho:
        data.type = "ORTHO"
        data.ortho_scale = ortho
    look_at(cam, target)
    return cam


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.world.color = (0.003, 0.006, 0.012)
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.002, 0.006, 0.014, 1)
    bg.inputs["Strength"].default_value = 0.16
    scene.view_settings.look = "AgX - Medium High Contrast"

    key_data = bpy.data.lights.new("Helios_Key", "AREA")
    key_data.energy = 2600
    key_data.shape = "DISK"
    key_data.size = 48
    key = bpy.data.objects.new("Helios_Key", key_data)
    scene.collection.objects.link(key)
    key.location = (-45, -55, 85)
    look_at(key, (0, 5, 0))
    rim_data = bpy.data.lights.new("Helios_Rim", "AREA")
    rim_data.energy = 1900
    rim_data.color = (0.15, 0.5, 1.0)
    rim_data.size = 34
    rim = bpy.data.objects.new("Helios_Rim", rim_data)
    scene.collection.objects.link(rim)
    rim.location = (55, 55, 55)
    look_at(rim, (0, 5, 0))
    warm_data = bpy.data.lights.new("Forge_Fill", "POINT")
    warm_data.energy = 900
    warm_data.color = (1.0, 0.22, 0.04)
    warm_data.shadow_soft_size = 18
    warm = bpy.data.objects.new("Forge_Fill", warm_data)
    scene.collection.objects.link(warm)
    warm.location = (-35, 24, 25)


def render_evidence():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    cameras = [
        ("v12_hub_close_shaded.png", add_camera("CAM_Close", (92, -103, 92), (0, 7, 3), 58, None), (1440, 900)),
        ("v12_hub_120wu_shaded.png", add_camera("CAM_120WU", (0, -110, 116), (0, 6, 0), 54, None), (1440, 900)),
        ("v12_family_shaded.png", add_camera("CAM_Family", (55, -170, 145), (0, 0, 0), 56, None), (1440, 900)),
        ("v12_hub_contact_lt45px.png", add_camera("CAM_Contact", (0, 0, 400), (0, 5, 0), 50, 940), (512, 512)),
    ]
    for filename, cam, res in cameras:
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.filepath = str(EVIDENCE / filename)
        bpy.ops.render.render(write_still=True)


def main():
    reset_scene()
    m = {
        "hull": material("MAT_HeliosHull", (0.055, 0.085, 0.12), 0.82, 0.27),
        "armor": material("MAT_ForgeArmor", (0.13, 0.17, 0.20), 0.88, 0.24),
        "light": material("MAT_HabitatCeramic", (0.38, 0.46, 0.52), 0.55, 0.25),
        "dark": material("MAT_StructureDark", (0.018, 0.026, 0.035), 0.9, 0.31),
        "orange": material("MAT_ForgeIdentity", (0.48, 0.085, 0.018), 0.65, 0.26,
                           (1.0, 0.16, 0.025), 3.5),
        "cyan": material("MAT_HeliosNavigation", (0.01, 0.22, 0.34), 0.3, 0.18,
                         (0.01, 0.78, 1.0), 5.5),
        "cyan_soft": material("MAT_GateField", (0.01, 0.15, 0.24), 0.1, 0.12,
                              (0.02, 0.55, 1.0), 8.0),
        "rock_a": material("MAT_RockFerrite", (0.095, 0.074, 0.063), 0.3, 0.88),
        "rock_b": material("MAT_RockIce", (0.065, 0.11, 0.15), 0.18, 0.64),
        "rock_c": material("MAT_RockCobalt", (0.11, 0.085, 0.14), 0.26, 0.78),
        "ore_orange": material("MAT_OreFerrite", (0.35, 0.07, 0.015), 0.55, 0.3,
                               (1.0, 0.1, 0.01), 2.2),
        "ore_cyan": material("MAT_OreCrysal", (0.01, 0.27, 0.38), 0.4, 0.25,
                             (0.02, 0.72, 1.0), 2.8),
        "ore_violet": material("MAT_OreCobalt", (0.19, 0.03, 0.30), 0.45, 0.27,
                               (0.45, 0.06, 1.0), 2.5),
    }
    hub = collection("V12_HeliosHub")
    gate = collection("V12_SplitHexGate")
    rocks = collection("V12_HeroRocks")
    build_hub(m, hub)
    build_split_hex_gate(m, gate)
    build_rocks(m, rocks)
    setup_render()
    bpy.context.scene["spacefaceAsset"] = {
        "id": "m4_helios_hub_v12", "kind": "candidate_family", "version": 12,
        "source": "BlenderKit Sci-Fi Station CC0 + authored connected construction",
        "promotion": "forbidden_until_visual_and_runtime_evidence_pass",
    }
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
    render_evidence()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.data]
    print("V12_BUILD_OK", BLEND_OUT)
    print("V12_MESHES", len(meshes), "V12_POLYGONS", sum(len(o.data.polygons) for o in meshes))


if __name__ == "__main__":
    main()
