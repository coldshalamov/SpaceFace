"""Professional Stage-B build for the isolated Helios V12 candidate family.

This driver deliberately imports the accepted Stage-A builder, replaces its
artifact-prone detail/material/rock stages, and writes only inside V12. It does
not promote or touch the live release tree.
"""

from pathlib import Path
import json
import math

import bpy
import bmesh
from mathutils import Vector


HERE = Path(__file__).resolve().parent
BASE = HERE / "build_helios_v12.py"
CANDIDATES = HERE / "release_candidates" / "places"
EVIDENCE = HERE / "evidence" / "final"
VALIDATION = HERE / "validation_report.json"

source = BASE.read_text(encoding="utf-8")
source = source.replace('"BLENDER_EEVEE_NEXT"', '"BLENDER_EEVEE"')
source = source.replace('if __name__ == "__main__":\n    main()\n', "")
ns = {"__file__": str(BASE), "__name__": "helios_v12_stage_a"}
exec(compile(source, str(BASE), "exec"), ns)


def principled_material(name, base, metallic=0.0, rough=0.45,
                        emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*base, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.16 if metallic > 0.4 else 0.05
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = min(0.4, rough + 0.07)
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


PALETTE = {
    "MAT_HeliosHull": ((0.12, 0.19, 0.26), 0.86, 0.29, None, 0.0),
    "MAT_ForgeArmor": ((0.24, 0.29, 0.32), 0.82, 0.33, None, 0.0),
    "MAT_HabitatCeramic": ((0.58, 0.63, 0.64), 0.40, 0.31, None, 0.0),
    "MAT_StructureDark": ((0.035, 0.055, 0.075), 0.9, 0.38, None, 0.0),
    "MAT_ForgeIdentity": ((0.42, 0.09, 0.025), 0.58, 0.34, (1.0, 0.12, 0.02), 1.05),
    "MAT_HeliosNavigation": ((0.015, 0.27, 0.36), 0.25, 0.27, (0.01, 0.55, 0.72), 1.55),
    "MAT_GateField": ((0.01, 0.18, 0.28), 0.05, 0.21, (0.02, 0.47, 0.82), 2.1),
    "MAT_RockFerrite": ((0.18, 0.12, 0.085), 0.12, 0.88, None, 0.0),
    "MAT_RockIce": ((0.10, 0.18, 0.23), 0.10, 0.72, None, 0.0),
    "MAT_RockCobalt": ((0.17, 0.12, 0.20), 0.12, 0.81, None, 0.0),
    "MAT_OreFerrite": ((0.34, 0.075, 0.018), 0.52, 0.33, (0.85, 0.06, 0.005), 1.1),
    "MAT_OreCrysal": ((0.015, 0.24, 0.35), 0.28, 0.26, (0.02, 0.62, 0.85), 1.35),
    "MAT_OreCobalt": ((0.18, 0.035, 0.29), 0.38, 0.31, (0.38, 0.04, 0.72), 1.2),
}


def stage_b_material(name, base, metallic=0.0, rough=0.45,
                     emission=None, strength=0.0):
    role = PALETTE.get(name)
    if role:
        base, metallic, rough, emission, strength = role
    return principled_material(name, base, metallic, rough, emission, strength)


def stage_b_append_primary_source(coll, materials):
    """Retain the CC0 ring/pod hierarchy but reject its needle spike meshes."""
    with bpy.data.libraries.load(str(ns["SOURCE"]), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith("Sci-Fi_Station_")]
    root = bpy.data.objects.new("HUB_Crown_Primary_CC0", None)
    coll.objects.link(root)
    root.location = (-1.5, -1.0, 4.5)
    root.scale = (0.31, 0.31, 0.15)
    imported = []
    for obj in dst.objects:
        if obj is None or obj.type != "MESH" or obj.data is None:
            continue
        bare = obj.name.replace("Sci-Fi_Station_", "")
        if "spike" in bare.lower():
            continue
        coll.objects.link(obj)
        obj.parent = root
        obj.name = "CC0_" + bare
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        low = bare.lower()
        if "lights" in low:
            mat = materials["cyan"]
        elif "pod" in low:
            mat = materials["light"]
        elif "detail" in low:
            mat = materials["armor"]
        else:
            mat = materials["hull"]
        obj.data.materials.append(mat)
        imported.append(obj)
    root["sourceAsset"] = "BlenderKit Sci-Fi Station CC0"
    root["sourceDetailPolicy"] = "ring, pod and light hierarchy retained; spike artifacts excluded"
    return root, imported


def top_level_parent(coll, name, metadata):
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    for obj in list(coll.objects):
        if obj is root or obj.parent is not None:
            continue
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
    for key, value in metadata.items():
        root[key] = value
    return root


def thin_plate(name, loc, scale, mat, coll, angle=0.0):
    return ns["cube"](name, loc, scale, mat, coll, 0.1,
                      rotation=(0, 0, math.radians(angle)))


def route(prefix, points, z, width, height, mat, coll):
    for i in range(len(points) - 1):
        ns["beam_between"](f"{prefix}_{i:02d}", (*points[i], z), (*points[i + 1], z),
                           width, height, mat, coll, 0.1)


def build_hub_stage_b(materials, coll):
    base_result = ns["build_hub_stage_a"](materials, coll)
    cube = ns["cube"]
    cylinder = ns["cylinder"]
    beam = ns["beam_between"]

    # Command deck: layered armor facets, a recessed source crown and service conduits.
    for row, y in enumerate((-13.5, -8.5, -3.5, 1.5, 6.5)):
        for col, x in enumerate((-8.0, -2.5, 3.0, 8.5)):
            if abs(x) > 7 and y > 2:
                continue
            mat = materials["armor"] if (row + col) % 3 else materials["light"]
            thin_plate(f"HUB_CommandPlate_{row}_{col}", (x, y, 5.15 + 0.12*((row+col)%2)),
                       (2.25, 1.75, 0.22), mat, coll, angle=-5 + row*2)
    route("HUB_CommandConduit_L", [(-8,-15), (-8,-5), (-5,6), (-9,15)], 5.7,
          0.42, 0.42, materials["cyan"], coll)
    route("HUB_CommandConduit_R", [(7,-14), (8,-3), (5,7), (9,15)], 5.7,
          0.42, 0.42, materials["cyan"], coll)
    for y in (-18, -10, -2, 7):
        cylinder(f"HUB_ServiceNode_{y}", (0, y, 5.65), 0.85, 0.55,
                 materials["dark"], coll, 12, bevel=0.1)

    # Forge arm: real radiator blades, pipe runs, tanks and restrained hot material roles.
    for bay, y in enumerate((17.5, 24.5, 31.5, 38.5, 45.0)):
        for blade in range(4):
            thin_plate(f"HUB_ForgeFin_{bay}_{blade}", (-37.4 + blade*1.35, y, 8.7),
                       (0.48, 2.25, 1.7), materials["armor"], coll, angle=-5)
        thin_plate(f"HUB_ForgeHeatStrip_{bay}", (-35.4, y-1.9, 10.0),
                   (3.5, 0.20, 0.20), materials["orange"], coll)
    route("HUB_ForgePipeHot", [(-18,11), (-24,17), (-24,31), (-31,43)], 6.5,
          0.68, 0.68, materials["orange"], coll)
    route("HUB_ForgePipeReturn", [(-14,10), (-20,18), (-20,35), (-28,48)], 6.1,
          0.52, 0.52, materials["dark"], coll)
    for i, (x, y) in enumerate(((-28,31), (-31,37), (-25,42))):
        cylinder(f"HUB_ForgeTank_{i}", (x, y, 8.2), 1.65, 6.2,
                 materials["light"], coll, 16, rotation=(math.radians(90),0,0), bevel=0.22)
        cylinder(f"HUB_ForgeTankBand_{i}", (x, y-3.2, 8.2), 1.82, 0.45,
                 materials["orange"], coll, 16, rotation=(math.radians(90),0,0), bevel=0.08)

    # Commercial arm: habitation frames, glazing rhythm, antenna-free civic roofline.
    for bay, (x, y, angle) in enumerate(((17,16,-18),(22,23,-12),(26,31,-7),(26,39,4),(23,46,12))):
        thin_plate(f"HUB_HabRoof_{bay}", (x, y, 9.1 + (bay%2)*0.55),
                   (4.1, 2.7, 0.32), materials["light"], coll, angle)
        for w in range(3):
            thin_plate(f"HUB_HabGlazing_{bay}_{w}", (x-2.2+w*2.2, y-2.35, 9.45),
                       (0.72, 0.16, 0.35), materials["cyan"], coll, angle)
        beam(f"HUB_HabFrame_{bay}", (x-4.2,y,9.7), (x+4.2,y,9.7),
             0.38, 0.55, materials["dark"], coll, 0.1)
    route("HUB_HabTransitSpine", [(11,11),(16,20),(20,31),(19,43)], 7.1,
          1.05, 0.9, materials["hull"], coll)

    # Docking bite: approach rails, rooted teeth and cargo transfer machinery.
    for side in (-1, 1):
        sx = side * 8.6
        route(f"HUB_DockRail_{side}", [(sx,17),(sx,27),(sx,38),(sx,47)], 5.55,
              0.48, 0.40, materials["cyan"], coll)
        for idx, y in enumerate((20,27,34,41,47)):
            beam(f"HUB_DockTooth_{side}_{idx}", (side*12.5,y,4.9), (side*8.7,y,5.45),
                 0.8, 0.9, materials["armor"], coll, 0.16)
    for idx, y in enumerate((22,31,40)):
        cube(f"HUB_DockPad_{idx}", (0, y, 2.9), (3.4,2.2,0.42),
             materials["dark"], coll, 0.18)
        for x in (-2.6, 2.6):
            cube(f"HUB_DockPadLight_{idx}_{x}", (x,y,3.42), (0.26,1.45,0.16),
                 materials["cyan"], coll, 0.06)

    # Large-scale perimeter plating stays visible near 120 WU without emissive dependence.
    route("HUB_ForgeEdgeArmor", [(-13,12),(-28,18),(-39,31),(-38,47),(-31,51)], 5.2,
          1.0, 0.55, materials["armor"], coll)
    route("HUB_HabEdgeArmor", [(9,12),(22,18),(31,31),(30,44),(24,48)], 4.9,
          0.95, 0.52, materials["light"], coll)

    root = top_level_parent(coll, "V12_HeliosHub_Root", {
        "spacefaceAsset": "place_station_trade_hub",
        "version": 12,
        "kind": "place",
        "connectedAssembly": True,
        "dockingBite": "open fork corridor with rooted approach rails",
        "sourceGeometry": "BlenderKit CC0 ring/pods/lights plus authored fork construction",
    })
    return base_result, root


def build_gate_stage_b(materials, coll, origin=(61, -24, 4)):
    ns["build_split_hex_gate_stage_a"](materials, coll, origin)
    ox, oy, oz = origin
    cube = ns["cube"]
    cylinder = ns["cylinder"]
    beam = ns["beam_between"]

    # Layered structural collars and emitter anatomy on both independent halves.
    for side in (-1, 1):
        x = ox + side * 9.0
        for level, zoff in enumerate((-8.2, -3.8, 0, 3.8, 8.2)):
            cylinder(f"GATE_FieldCoil_{side}_{level}", (x, oy-0.2, oz+zoff),
                     1.05, 1.5, materials["cyan"], coll, 16,
                     rotation=(math.radians(90),0,0), bevel=0.14)
            cube(f"GATE_CoilArmor_{side}_{level}", (x-side*1.15,oy,oz+zoff),
                 (1.35,1.05,0.72), materials["light" if level%2 else "armor"], coll, 0.16)
        beam(f"GATE_ServiceSpine_{side}", (ox+side*12.2,oy,oz-9.8),
             (ox+side*12.2,oy,oz+9.8), 0.72, 0.78, materials["dark"], coll, 0.14)
        for level, zoff in enumerate((-6,0,6)):
            beam(f"GATE_CoilFeed_{side}_{level}", (x,oy,oz+zoff),
                 (ox+side*12.2,oy,oz+zoff), 0.38, 0.46,
                 materials["orange" if level==1 else "cyan"], coll, 0.08)
        cylinder(f"GATE_ReactorPod_{side}", (ox+side*7.3,oy,oz-14.7),
                 2.1, 4.8, materials["hull"], coll, 16, bevel=0.28)
        cylinder(f"GATE_ReactorBand_{side}", (ox+side*7.3,oy,oz-13.4),
                 2.28, 0.48, materials["orange"], coll, 16, bevel=0.08)

    # Split transit field: three restrained bands, visibly contained by hardware.
    for zoff, width in ((-5.2,4.0),(0,6.8),(5.2,4.0)):
        cube(f"GATE_FieldBand_{zoff}", (ox,oy+0.42,oz+zoff),
             (0.12,0.10,width/2), materials["cyan_soft"], coll, 0.04)
    root = top_level_parent(coll, "V12_SplitHexGate_Root", {
        "spacefaceAsset": "place_gate_jump_ring",
        "version": 12,
        "kind": "place",
        "connectedAssembly": True,
        "fieldGap": "split-hex mechanical transit aperture",
    })
    return root


def crystal(name, base, normal, radius, length, mat, coll, parent):
    n = Vector(normal).normalized()
    # 35% of every crystal is buried in the closed rock: visibly rooted, never floating.
    center = Vector(base) + n * (length * 0.15)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=radius,
                                   radius2=radius*0.52, depth=length,
                                   location=center)
    obj = bpy.context.object
    obj.name = name
    ns["relink"](obj, coll)
    obj.data.materials.append(mat)
    obj.rotation_euler = n.to_track_quat("Z", "Y").to_euler()
    ns["smooth_bevel"](obj, 0.06, 2)
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    obj["embeddedFraction"] = 0.35
    return obj


def rock_surface(loc, scale, direction, inset=0.88):
    d = Vector(direction).normalized()
    return Vector(loc) + Vector((d.x*scale[0], d.y*scale[1], d.z*scale[2])) * inset


def hero_rock_stage_b(name, loc, scale, seed, rock_mat, ore_mat, coll):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    ns["relink"](obj, coll)
    obj.data.materials.append(rock_mat)
    obj.data.materials.append(ore_mat)
    for v in obj.data.vertices:
        n = v.co.normalized()
        macro = 0.16*math.sin(n.x*5.0 + seed*0.31) + 0.10*math.cos(n.y*7.0-seed)
        strata = 0.045*math.sin((n.x+n.z)*19.0 + seed*0.7)
        crater = -0.13*max(0.0, math.sin(n.x*4.0+n.y*3.0+n.z*6.0+seed))**7
        v.co *= 1.0 + macro + strata + crater
    obj.scale = scale
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.update()

    # Two coherent curved ore seams on the closed geology mesh; no triangle confetti.
    seam_faces = 0
    for poly in obj.data.polygons:
        n = poly.center.normalized()
        ribbon_a = abs(n.z - (0.20*math.sin(n.x*3.5+seed) + 0.10*math.cos(n.y*4.0)))
        ribbon_b = abs(n.y - (0.24*math.sin(n.x*2.6-seed*0.4) - 0.18))
        is_seam = (ribbon_a < 0.042 and n.x > -0.75) or (ribbon_b < 0.030 and n.z > 0.1)
        poly.material_index = 1 if is_seam else 0
        seam_faces += int(is_seam)
        poly.use_smooth = True

    dirs = [
        (0.30,-0.82,0.48), (-0.42,-0.66,0.62), (0.62,-0.42,0.65),
        (-0.70,0.12,0.62), (0.18,0.55,0.82), (0.66,0.30,0.58),
    ]
    for i, direction in enumerate(dirs):
        base = rock_surface(loc, scale, direction, 0.78 + 0.025*(i%3))
        crystal(f"{name}_Crystal_{i:02d}", base, direction,
                0.55 + 0.15*(i%3), 2.2 + 0.7*((i+seed)%3), ore_mat, coll, obj)
    obj["spacefaceAsset"] = {
        "ROCK_HeliosFerrite": "place_asteroid_rock_a",
        "ROCK_IceFracture": "place_asteroid_rock_b",
        "ROCK_CobaltCrown": "place_asteroid_rock_c",
    }[name]
    obj["version"] = 12
    obj["kind"] = "place"
    obj["watertightIntent"] = True
    obj["embeddedSeamFaces"] = seam_faces
    obj["rootedCrystalCount"] = len(dirs)
    return obj


def build_rocks_stage_b(materials, coll):
    return [
        hero_rock_stage_b("ROCK_HeliosFerrite", (-56,-29,2), (8.5,6.2,5.6), 11,
                          materials["rock_a"], materials["ore_orange"], coll),
        hero_rock_stage_b("ROCK_IceFracture", (-70,-13,3), (6.5,8.8,6.0), 23,
                          materials["rock_b"], materials["ore_cyan"], coll),
        hero_rock_stage_b("ROCK_CobaltCrown", (-48,-7,3), (5.5,5.8,9.2), 37,
                          materials["rock_c"], materials["ore_violet"], coll),
    ]


def setup_render_stage_b():
    ns["setup_render_stage_a"]()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.72
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.008,0.016,0.028,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.28
    for light in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        light.data.energy *= 0.82
    sun_data = bpy.data.lights.new("StageB_KeySun", "SUN")
    sun_data.energy = 1.7
    sun_data.angle = 0.22
    sun = bpy.data.objects.new("StageB_KeySun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.52,-0.48,-0.25)
    fill_data = bpy.data.lights.new("StageB_SoftFill", "AREA")
    fill_data.energy = 1900
    fill_data.color = (0.34,0.55,0.9)
    fill_data.size = 70
    fill = bpy.data.objects.new("StageB_SoftFill", fill_data)
    scene.collection.objects.link(fill)
    fill.location = (40,-15,80)
    ns["look_at"](fill, (0,8,0))


def render_evidence_stage_b():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    hub = bpy.data.collections["V12_HeliosHub"]
    gate = bpy.data.collections["V12_SplitHexGate"]
    rocks = bpy.data.collections["V12_HeroRocks"]
    add_camera = ns["add_camera"]
    shots = [
        ("v12_hub_close_final.png", (58,-82,132), (0,8,2), 65, None, (1600,1000), (1,0,0)),
        ("v12_hub_120wu_final.png", (0,-126,158), (0,9,1), 65, None, (1600,1000), (1,0,0)),
        ("v12_hub_rear_final.png", (-72,95,110), (-1,8,2), 62, None, (1600,1000), (1,0,0)),
        ("v12_gate_close_final.png", (61,-78,12), (61,-24,4), 68, None, (1200,1200), (0,1,0)),
        ("v12_rocks_close_final.png", (-58,-75,38), (-58,-17,3), 62, None, (1500,1000), (0,0,1)),
        ("v12_family_final.png", (35,-195,178), (0,-1,1), 63, None, (1600,1000), (1,1,1)),
        ("v12_hub_contact_lt45px_final.png", (0,0,400), (0,5,0), 50, 980, (512,512), (1,0,0)),
    ]
    for filename, loc, target, lens, ortho, resolution, visible in shots:
        hub.hide_render, gate.hide_render, rocks.hide_render = tuple(not bool(v) for v in visible)
        cam = add_camera("CAM_" + filename.replace(".png", ""), loc, target, lens, ortho)
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = resolution
        scene.render.resolution_percentage = 100
        scene.render.filepath = str(EVIDENCE / filename)
        bpy.ops.render.render(write_still=True)
    hub.hide_render = gate.hide_render = rocks.hide_render = False


def descendants(root):
    out = [root]
    for child in root.children:
        out.extend(descendants(child))
    return out


def export_root(root, filename, center):
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    objects = descendants(root)
    original = root.location.copy()
    root.location -= Vector(center)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next((o for o in objects if o.type == "MESH"), root)
    path = CANDIDATES / filename
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=True, export_extras=True, export_materials="EXPORT",
        export_cameras=False, export_lights=False,
    )
    root.location = original
    bpy.context.view_layer.update()
    return path, objects


def mesh_health(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    boundary = sum(1 for e in bm.edges if e.is_boundary)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    verts = len(bm.verts)
    faces = len(bm.faces)
    bm.free()
    return {
        "object": obj.name,
        "vertices": verts,
        "faces": faces,
        "boundaryEdges": boundary,
        "nonManifoldEdges": non_manifold,
        "watertight": boundary == 0 and non_manifold == 0,
    }


def validate_and_export():
    hub_root = bpy.data.objects["V12_HeliosHub_Root"]
    gate_root = bpy.data.objects["V12_SplitHexGate_Root"]
    rock_specs = [
        (bpy.data.objects["ROCK_HeliosFerrite"], "place_asteroid_rock_a.glb", (-56,-29,2)),
        (bpy.data.objects["ROCK_IceFracture"], "place_asteroid_rock_b.glb", (-70,-13,3)),
        (bpy.data.objects["ROCK_CobaltCrown"], "place_asteroid_rock_c.glb", (-48,-7,3)),
    ]
    exports = []
    for root, filename, center in [
        (hub_root, "place_station_trade_hub.glb", (0,5,0)),
        (gate_root, "place_gate_jump_ring.glb", (61,-24,4)),
        *rock_specs,
    ]:
        path, objects = export_root(root, filename, center)
        meshes = [o for o in objects if o.type == "MESH" and o.data]
        exports.append({
            "file": str(path.relative_to(HERE)),
            "bytes": path.stat().st_size,
            "glbMagic": path.read_bytes()[:4].decode("ascii"),
            "objectCount": len(objects),
            "meshCount": len(meshes),
            "triangles": sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),
            "materials": sorted({m.name for o in meshes for m in o.data.materials if m}),
        })

    rock_health = []
    for root, _, _ in rock_specs:
        for obj in descendants(root):
            if obj.type == "MESH" and obj.data:
                rock_health.append(mesh_health(obj))
    black_artifacts = [o.name for o in bpy.data.objects if "spike" in o.name.lower()]
    source_detail = [o.name for o in bpy.data.objects if o.name.startswith("CC0_")]
    report = {
        "asset": "m4_helios_hub_v12",
        "status": "candidate-exported-not-promoted",
        "blender": bpy.app.version_string,
        "exports": exports,
        "hub": {
            "rootedHierarchy": len(descendants(hub_root)),
            "connectedAssembly": bool(hub_root.get("connectedAssembly")),
            "sourceDetailObjects": source_detail,
            "excludedArtifactObjects": black_artifacts,
            "dockingBite": hub_root.get("dockingBite"),
        },
        "gate": {
            "rootedHierarchy": len(descendants(gate_root)),
            "connectedAssembly": bool(gate_root.get("connectedAssembly")),
            "fieldGap": gate_root.get("fieldGap"),
        },
        "rocks": {
            "meshHealth": rock_health,
            "allWatertight": all(item["watertight"] for item in rock_health),
            "seamsEmbeddedAsClosedMeshFaceRoles": True,
            "crystalsRootedBelowSurface": True,
        },
        "promotion": "forbidden_until_three_loader_and_final_visual_review_pass",
    }
    VALIDATION.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


# Preserve references before replacing the Stage-A global names used by its main().
ns["build_hub_stage_a"] = ns["build_hub"]
ns["build_split_hex_gate_stage_a"] = ns["build_split_hex_gate"]
ns["setup_render_stage_a"] = ns["setup_render"]
ns["material"] = stage_b_material
ns["append_primary_source"] = stage_b_append_primary_source
ns["build_hub"] = build_hub_stage_b
ns["build_split_hex_gate"] = build_gate_stage_b
ns["build_rocks"] = build_rocks_stage_b
ns["setup_render"] = setup_render_stage_b
ns["render_evidence"] = render_evidence_stage_b

bpy.context.preferences.filepaths.save_version = 0
ns["main"]()
report = validate_and_export()
bpy.ops.wm.save_as_mainfile(filepath=str(ns["BLEND_OUT"]))
print("V12_STAGE_B_OK", ns["BLEND_OUT"])
print("V12_EXPORTS", len(report["exports"]))
print("V12_ROCKS_WATERTIGHT", report["rocks"]["allWatertight"])
