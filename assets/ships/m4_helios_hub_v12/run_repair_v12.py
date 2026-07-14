"""Single bounded visual repair for the V12 Helios candidate.

The first durable build proved geometry generation but exposed an Eevee studio
and 3D-beam framing failure. This runner keeps that source intact, patches the
authoring functions in memory, and regenerates the candidate deterministically.
"""

from pathlib import Path
import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
BASE = HERE / "build_helios_v12.py"
source = BASE.read_text(encoding="utf-8").replace("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE")
source = source.replace('if __name__ == "__main__":\n    main()\n', "")
ns = {"__file__": str(BASE), "__name__": "helios_v12_base"}
exec(compile(source, str(BASE), "exec"), ns)


base_material = ns["material"]
palette = {
    "MAT_HeliosHull": ((0.16, 0.25, 0.34), 0.78, 0.31, None, 0.0),
    "MAT_ForgeArmor": ((0.27, 0.31, 0.34), 0.82, 0.29, None, 0.0),
    "MAT_HabitatCeramic": ((0.52, 0.61, 0.67), 0.48, 0.31, None, 0.0),
    "MAT_StructureDark": ((0.065, 0.09, 0.12), 0.84, 0.35, None, 0.0),
    "MAT_ForgeIdentity": ((0.58, 0.13, 0.035), 0.58, 0.31, (1.0, 0.11, 0.018), 1.25),
    "MAT_HeliosNavigation": ((0.02, 0.32, 0.42), 0.25, 0.24, (0.01, 0.55, 0.8), 1.8),
    "MAT_GateField": ((0.015, 0.22, 0.32), 0.08, 0.18, (0.02, 0.50, 0.85), 2.4),
    "MAT_RockFerrite": ((0.22, 0.16, 0.12), 0.26, 0.82, None, 0.0),
    "MAT_RockIce": ((0.15, 0.26, 0.33), 0.14, 0.61, None, 0.0),
    "MAT_RockCobalt": ((0.24, 0.17, 0.29), 0.22, 0.73, None, 0.0),
}


def repaired_material(name, base, metallic=0.0, rough=0.45, emission=None, strength=0.0):
    role = palette.get(name)
    if role:
        base, metallic, rough, emission, strength = role
    elif emission:
        strength = min(strength, 1.8)
    return base_material(name, base, metallic, rough, emission, strength)


base_append = ns["append_primary_source"]


def repaired_append(coll, materials):
    root, imported = base_append(coll, materials)
    root.scale = (0.30, 0.30, 0.135)
    return root, imported


base_build_hub = ns["build_hub"]


def repaired_build_hub(materials, coll):
    result = base_build_hub(materials, coll)
    station_root = bpy.data.objects.new("HUB_HeliosPrime_ConnectedRoot", None)
    coll.objects.link(station_root)
    for obj in list(coll.objects):
        if obj is station_root or obj.parent is not None:
            continue
        world = obj.matrix_world.copy()
        obj.parent = station_root
        obj.matrix_world = world
    station_root["connectedAssembly"] = True
    station_root["dockingBite"] = "open approach between fork jaws"
    return result


base_setup = ns["setup_render"]


def repaired_setup_render():
    base_setup()
    scene = bpy.context.scene
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.15
    bg = scene.world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.018, 0.028, 0.045, 1.0)
    bg.inputs["Strength"].default_value = 0.48
    sun_data = bpy.data.lights.new("Studio_Sun", "SUN")
    sun_data.energy = 2.2
    sun_data.angle = 0.35
    sun = bpy.data.objects.new("Studio_Sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.48, -0.62, -0.35)
    fill_data = bpy.data.lights.new("Studio_Fill", "AREA")
    fill_data.energy = 3200
    fill_data.color = (0.42, 0.62, 1.0)
    fill_data.size = 60
    fill = bpy.data.objects.new("Studio_Fill", fill_data)
    scene.collection.objects.link(fill)
    fill.location = (15, 55, 70)
    ns["look_at"](fill, (0, 5, 0))


def repaired_render_evidence():
    evidence = ns["EVIDENCE"]
    evidence.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    hub = bpy.data.collections["V12_HeliosHub"]
    gate = bpy.data.collections["V12_SplitHexGate"]
    rocks = bpy.data.collections["V12_HeroRocks"]
    add_camera = ns["add_camera"]
    shots = [
        ("v12_hub_close_shaded.png", add_camera("CAM_Close", (68, -78, 150), (0, 8, 1), 68), (1440, 900), (1, 0, 0)),
        ("v12_hub_120wu_shaded.png", add_camera("CAM_120WU", (0, -120, 175), (0, 8, 0), 70), (1440, 900), (1, 0, 0)),
        ("v12_gate_close_shaded.png", add_camera("CAM_Gate", (61, -75, 5), (61, -24, 4), 72), (1024, 1024), (0, 1, 0)),
        ("v12_rocks_close_shaded.png", add_camera("CAM_Rocks", (-58, -74, 39), (-58, -17, 3), 65), (1200, 800), (0, 0, 1)),
        ("v12_family_shaded.png", add_camera("CAM_Family", (35, -190, 175), (0, -1, 0), 64), (1440, 900), (1, 1, 1)),
        # With an ~80 WU hub and 980 WU orthographic span this is ~42 px in 512.
        ("v12_hub_contact_lt45px.png", add_camera("CAM_Contact", (0, 0, 400), (0, 5, 0), 50, 980), (512, 512), (1, 0, 0)),
    ]
    for filename, camera, resolution, visible in shots:
        hub.hide_render, gate.hide_render, rocks.hide_render = tuple(not bool(v) for v in visible)
        scene.camera = camera
        scene.render.resolution_x, scene.render.resolution_y = resolution
        scene.render.resolution_percentage = 100
        scene.render.filepath = str(evidence / filename)
        bpy.ops.render.render(write_still=True)
    hub.hide_render = gate.hide_render = rocks.hide_render = False


ns["material"] = repaired_material
ns["append_primary_source"] = repaired_append
ns["build_hub"] = repaired_build_hub
ns["setup_render"] = repaired_setup_render
ns["render_evidence"] = repaired_render_evidence
bpy.context.preferences.filepaths.save_version = 0
ns["main"]()
