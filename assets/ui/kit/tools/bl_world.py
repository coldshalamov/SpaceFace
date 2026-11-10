"""bl_world — the lit world shots the interface sits on.

Every POSTER/BENCH frame in Field Hardware is "a lit shot of that world". These scenes are
assembled from **the game's own production GLBs** — the Kestrel "Hitch" hull, the maintenance
gantry, the worklight tower, the container rack, the dock interior, the asteroid rocks, the
refinery — so the plate behind the interface is the actual world with its actual materials,
not a painting of it.

Run inside Blender:
    blender -b --factory-startup --python assets/ui/kit/tools/bl_world.py -- <scene> [out.png] [samples=N]

Scenes: title-v1-hangar · title-v2-field · title-v3-baydoor · crucible-door · flight
"""
from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bl_common as B  # noqa: E402

# tools -> kit -> ui -> assets -> repo root: four levels, not three.
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))

GLB = {
    "kestrel": "assets/ships/kestrel_borrowed_time_v4/source/wholeships/kestrel_borrowed_time_v4_lod1.glb",
    "kestrel-lite": "assets/ships/kestrel_borrowed_time_v4/source/wholeships/kestrel_borrowed_time_v4_lod2.glb",
    "gantry": "assets/ships/parts/places/place_maintenance_gantry.glb",
    "worklight": "assets/ships/parts/places/place_worklight_tower.glb",
    "rack": "assets/ships/parts/places/place_container_rack.glb",
    "dock": "assets/ships/parts/places/place_dock_interior.glb",
    "truss": "assets/ships/parts/places/place_conveyor_truss.glb",
    "rock-a": "assets/ships/parts/places/place_asteroid_rock_a.glb",
    "rock-b": "assets/ships/parts/places/place_asteroid_rock_b.glb",
    "rock-c": "assets/ships/parts/places/place_asteroid_rock_c.glb",
    "refinery": "assets/ships/parts/places/place_claim_outpost_refinery.glb",
    "hulk": "assets/ships/parts/places/place_dead_hulk.glb",
    "radiator": "assets/ships/parts/places/place_radiator_bank.glb",
    "pod": "assets/ships/parts/places/place_cargo_pod_standard.glb",
    "drill": "assets/ships/parts/places/place_drill_platform.glb",
    "mast": "assets/ships/parts/places/place_sensor_mast.glb",
}

_CACHE: dict[str, list] = {}


# ---------------------------------------------------------------- import


PROXY_TOKENS = ("collision", "collider", "proxy", "physics", "phys_", "bounds", "bound_",
                "occluder", "navmesh", "_lodbox")


def _is_proxy(ob) -> bool:
    """The production GLBs ship simulation proxies beside the art.

    `kestrel_borrowed_time_v4` carries a 22-poly `COLLISION_HULL` the size of the whole ship
    with no material on it. Rendered, it is a white box that completely hides the hull — and
    since it imports without warning, the symptom looks like "the hull has no detail" rather
    than "something is in front of it".
    """
    if ob.type != "MESH":
        return False
    low = ob.name.lower()
    if any(t in low for t in PROXY_TOKENS):
        return True
    return not [m for m in ob.data.materials if m]


def load(key: str, loc=(0, 0, 0), rot_z: float = 0.0, scale: float = 1.0,
         rot_x: float = 0.0, name: str = None):
    """Import a production GLB and place it. Re-imports are duplicated from the first copy,
    so a set with eight containers costs one parse, not eight."""
    if key in _CACHE:
        src = _CACHE[key]
        obs = []
        for o in src:
            c = o.copy()
            if c.data:
                c.data = o.data  # share the mesh; these are static set dressing
            bpy.context.collection.objects.link(c)
            obs.append(c)
    else:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(REPO, GLB[key]))
        obs = [o for o in bpy.data.objects if o not in before]
        for o in list(obs):
            if _is_proxy(o):
                obs.remove(o)
                bpy.data.objects.remove(o, do_unlink=True)
        _CACHE[key] = list(obs)

    roots = [o for o in obs if o.parent not in obs]
    empty = bpy.data.objects.new(name or key, None)
    bpy.context.collection.objects.link(empty)
    for r in roots:
        r.parent = empty
        r.matrix_parent_inverse = empty.matrix_world.inverted()
    empty.location = loc
    empty.rotation_euler = (rot_x, 0, rot_z)
    empty.scale = (scale, scale, scale)
    return empty


def bounds(root) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in ([root] + list(root.children_recursive)):
        if o.type != "MESH":
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx


# ---------------------------------------------------------------- scene shell


def stage(width=1920, height=1080, samples=140, exposure=0.0, view="AgX"):
    """A cinematic scene: perspective camera, filmic view transform, no transparent film.

    The world plates use AgX rather than Standard — these are photographs of a lit set, and a
    filmic transform is what keeps a 20 kW work light from clipping to a white disc. The kit
    assets stay on Standard so their colours land exactly on the tokens.
    """
    B.reset()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.cycles.transmission_bounces = 6
    sc.cycles.volume_bounces = 2
    sc.cycles.device = "CPU"
    sc.render.film_transparent = False
    sc.render.resolution_x, sc.render.resolution_y = width, height
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = view
    sc.view_settings.look = "None"
    sc.view_settings.exposure = exposure
    sc.render.filter_size = 1.5
    return sc


def camera(loc, at, lens=42.0, shift_y=0.0, dof_at=None, fstop=2.8):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam_data.shift_y = shift_y
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = loc
    cam.rotation_euler = (Vector(at) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    if dof_at is not None:
        cam_data.dof.use_dof = True
        cam_data.dof.focus_distance = (Vector(dof_at) - Vector(loc)).length
        cam_data.dof.aperture_fstop = fstop
    return cam


def sky(top="#121A2A", horizon="#2A2118", strength=1.0, sun_dir=None,
        sun_colour="#FFD9A0", sun_strength=0.0, sun_size=0.03):
    """A real gradient sky plus an optional sun. The cool sky is the fill the art direction
    asks for ("cool fill from the sky") and the reason hulls read as metal outdoors.

    `sun_dir` is **the direction the light travels**, so a dusk sun raking in from the upper
    right and slightly down is roughly (-0.7, 0.45, -0.35). Blender sun lamps emit along their
    own -Z, which is the opposite convention and an easy half-turn to get backwards.
    """
    w = bpy.data.worlds.new("sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.06
    ramp.color_ramp.elements[0].color = B.srgb(horizon)
    ramp.color_ramp.elements[1].position = 0.94
    ramp.color_ramp.elements[1].color = B.srgb(top)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    tex = nt.nodes.new("ShaderNodeTexCoord")
    mapr = nt.nodes.new("ShaderNodeMapRange")
    # a camera near the horizon only sees view-Z in roughly [-0.2, +0.3]; a wider map range
    # puts the entire gradient outside the frame and the sky reads as one flat colour.
    mapr.inputs["From Min"].default_value = -0.12
    mapr.inputs["From Max"].default_value = 0.30
    nt.links.new(tex.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], mapr.inputs["Value"])
    nt.links.new(mapr.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    if sun_strength > 0 and sun_dir:
        d = bpy.data.lights.new("sun", type="SUN")
        d.energy = sun_strength
        d.angle = sun_size
        d.color = B.srgb(sun_colour)[:3]
        o = bpy.data.objects.new("sun", d)
        o.rotation_euler = Vector(sun_dir).normalized().to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(o)
    return w


def worklight(loc, at=(0, 0, 0), irradiance=2.0, colour="#FFD2A0", radius=1.2,
              power=None):
    """A practical lamp, specified by the light it lands at `at` rather than by watts.

    Raw wattage is unusable across a set whose lamps sit 8 m and 300 m from their subject:
    the same number is a candle at one distance and a second sun at the other. `irradiance`
    is solved against the actual throw, so a value near 1 is a working lamp everywhere.
    """
    d = bpy.data.lights.new("work", type="AREA")
    d.shape = "DISK"
    d.size = radius
    direction = Vector(at) - Vector(loc)
    dist = max(direction.length, 1.0)
    d.energy = power if power is not None else irradiance * 4.0 * math.pi * dist * dist
    d.color = B.srgb(colour)[:3]
    o = bpy.data.objects.new("work", d)
    o.location = loc
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(o)
    return o


def haze(size=200.0, optical_depth=0.03, colour="#FFE0C0", loc=(0, 0, 0), density=None):
    """Volumetric haze so work lights throw real shafts and depth separates by air.

    Specified by **optical depth across the box** (density x path length), not by density:
    density is meaningless on its own, because the same number is invisible in a 40-unit
    hangar and opaque across a 760-unit arena. In-scatter also scales with how bright the
    sources are, so a value above ~0.06 next to a forge turns the whole frame into orange
    paper. 0.02-0.05 is a depth cue; 0.3 is weather.
    """
    if density is None:
        density = optical_depth / max(size, 1.0)
    cube = B.box(size, size, size * 0.7, *loc, name="haze")
    mat = bpy.data.materials.new("haze")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    sc = nt.nodes.new("ShaderNodeVolumeScatter")
    sc.inputs["Color"].default_value = B.srgb(colour)
    sc.inputs["Density"].default_value = density
    sc.inputs["Anisotropy"].default_value = 0.35
    nt.links.new(sc.outputs["Volume"], nt.nodes["Material Output"].inputs["Volume"])
    B.assign(cube, mat)
    cube.visible_shadow = False
    return cube


def floor(size=400.0, colour="#171310", roughness=0.72, z=0.0):
    f = B.quad(size, size, "floor")
    f.location = (0, 0, z)
    m = bpy.data.materials.new("floor")
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    B._set(p, "Base Color", B.srgb(colour))
    B._set(p, "Roughness", roughness)
    B._set(p, "Metallic", 0.0)
    B._brushed(m, p, strength=0.18, scale=26.0, stretch=3.0)
    B.assign(f, m)
    return f
