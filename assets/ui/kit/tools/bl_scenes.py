"""bl_scenes — the lit world shots the S1 and S2 frames sit on.

Composition follows the POSTER register (02_ART_DIRECTION §3): the world fills the frame and is
lit; there is a foreground, a subject and a background; the hull sits in the right two thirds,
slightly below the eye line, in three-quarter view. The interface is composited on afterwards —
nothing here draws a menu.

    blender -b --factory-startup --python assets/ui/kit/tools/bl_scenes.py -- <scene> [out.png] [samples=N] [width=N]

Scenes: title-v1-hangar · title-v2-field · title-v3-baydoor · crucible-door · flight
S2: berth · berth-cold · chart-field · workshop-bench · ship-rig
S2 follow-up: hangar-wall · hangar-wall-cold · workshop-bench-cold
"""
from __future__ import annotations

import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bl_common as B      # noqa: E402
import bl_world as W       # noqa: E402


def scene_title_v2_field(samples=140, exposure=-1.15):
    """v2 'Field at dusk' - the hull parked on an asteroid pad at dusk.

    The reading the owner named: rock texture under low warm light, a refinery on the horizon,
    the sky going cold above. Rock is the one material the owner has ever praised, so it
    carries the foreground.

    Exposure note: AgX plus a 5 kW sun plus practicals blows a dusk set to white paper. The
    sun is the only strong source here; the practicals are set low enough to read as lamps
    rather than as a second sun, and the haze is thin enough to separate depth without fogging
    the frame.
    """
    W.stage(samples=samples, exposure=exposure)
    W.sky(top="#16244A", horizon="#4A2E14", strength=1.35,
          sun_dir=(-0.72, 0.42, -0.34), sun_colour="#FFAE62", sun_strength=3.4, sun_size=0.05)

    # the pad, built from three real rocks so the silhouette is not a disc
    W.load("rock-a", loc=(2, 6, -7.4), rot_z=0.5, scale=1.9)
    W.load("rock-b", loc=(-19, 16, -8.6), rot_z=2.1, scale=1.5)
    W.load("rock-c", loc=(24, 21, -9.2), rot_z=-0.8, scale=1.7)
    # a foreground rock edge close to the lens, catching the last of the sun
    W.load("rock-c", loc=(-30, -40, -10.5), rot_z=1.2, scale=2.4, name="rock-fg")

    # nose leading screen-left, toward where the legend rail hangs; seated on the pad
    hull = W.load("kestrel", loc=(6.5, 3.0, 2.9), rot_z=math.radians(208),
                  rot_x=math.radians(-2))

    # working infrastructure: this is a field site, not a diorama
    W.load("mast", loc=(-16, 26, -2.0), rot_z=0.9, scale=1.1)
    W.load("pod", loc=(-13, 1, -3.6), rot_z=0.4)
    W.load("pod", loc=(-17.5, 5, -3.4), rot_z=1.9, name="pod2")
    W.load("worklight", loc=(22, -6, -3.0), rot_z=-0.6, scale=0.9)

    # the horizon: far enough away to read as a place, not a prop
    W.load("refinery", loc=(280, 1020, -150), rot_z=0.7, scale=2.0)

    W.worklight((21.5, -6.0, 11.0), at=(8, 1, 2), irradiance=2.6, colour="#FFC98A", radius=1.6)
    W.worklight((-13, -12, 6.0), at=(2, 2, 2), irradiance=0.8, colour="#FFB26A", radius=2.2)
    # a cold rim from the sky side so the hull's top edge separates from the horizon
    W.worklight((-40, 55, 34), at=(4, 4, 3), irradiance=0.9, colour="#9FB6E0", radius=14)

    B.rockify(colour="#3E342B", roughness=0.90, bump=0.62, scale=2.1)
    B.retint()
    B.starfield(count=700, radius=9000, size=6.0, strength=6.0)
    # thin, and pushed behind the subject: a haze box the camera sits inside scatters the sun
    # across the whole frame and erases the sky gradient it was added to reveal
    # in-scatter from even thin haze is an order of magnitude brighter than a dusk sky, so
    # it erases the gradient it was added to reveal. Kept only as a far depth cue.
    W.haze(size=700, optical_depth=0.025, colour="#FFCFA0", loc=(0, 320, 20))
    # aimed left of the hull so the hull lands in the right two thirds (POSTER register)
    W.camera(loc=(-38.0, -47.0, 8.0), at=(-2.0, 5.0, 4.6), lens=44, shift_y=-0.030,
             dof_at=(6.5, 3.0, 2.8), fstop=6.3)
    return hull


def scene_title_v1_hangar(samples=140):
    """v1 'Hangar' - the hull in its rig inside a working hangar.

    Gantry, cables, a floor with markings, warm work lights, an open bay door top-right
    showing the deep-field sky.
    """
    W.stage(samples=samples, exposure=-1.05)
    W.sky(top="#16213A", horizon="#241A12", strength=0.09)
    W.floor(size=420, colour="#15110D", roughness=0.66, z=-4.6)

    hull = W.load("kestrel", loc=(7.0, 2.0, 1.6), rot_z=math.radians(214),
                  rot_x=math.radians(-3))

    W.load("gantry", loc=(-9, -6, -4.6), rot_z=math.radians(90), scale=1.25)
    W.load("gantry", loc=(25, 14, -4.6), rot_z=math.radians(72), scale=1.15, name="gantry2")
    W.load("worklight", loc=(-20, 18, -4.6), rot_z=0.3, scale=1.3)
    W.load("worklight", loc=(31, -10, -4.6), rot_z=-0.4, scale=1.1, name="worklight2")
    W.load("rack", loc=(-30, 34, -4.6), rot_z=0.5, scale=1.4)
    W.load("rack", loc=(40, 40, -4.6), rot_z=-0.9, scale=1.2, name="rack2")
    W.load("truss", loc=(-4, 52, 4.0), rot_z=math.radians(96), scale=1.6)
    W.load("radiator", loc=(46, 12, -4.6), rot_z=-1.3, scale=1.2)
    W.load("pod", loc=(-15, -13, -4.0), rot_z=0.6)
    W.load("pod", loc=(-19.5, -10.5, -4.0), rot_z=2.2, name="pod2")

    # the open bay door, top right: a bright cold aperture cut in a dark hangar wall
    wall = B.box(240, 4, 120, 0, 86, 40, name="bay-wall")
    B.assign(wall, B.gunmetal("bay-wall", tone="#0F0C0A", roughness=0.8, metallic=0.35))
    aperture = B.box(58, 12, 40, 52, 86, 30, name="bay-door")
    B.assign(aperture, B.emissive("bay-sky", "#4E6C9E", strength=1.05))
    b = wall.modifiers.new("cut", "BOOLEAN")
    b.operation, b.object, b.solver = "DIFFERENCE", aperture, "EXACT"
    bpy.context.view_layer.objects.active = wall
    bpy.ops.object.modifier_apply(modifier="cut")

    W.worklight((-17, 15, 17), at=(4, 2, 2), irradiance=5.2, colour="#FFBE7A", radius=3.2)
    W.worklight((29, -9, 15), at=(9, 2, 1), irradiance=3.0, colour="#FFD2A0", radius=2.4)
    W.worklight((44, 78, 30), at=(10, 6, 2), irradiance=0.42, colour="#93ACD8", radius=18)
    W.worklight((2, -30, 6), at=(4, 0, 0), irradiance=1.5, colour="#FF9A54", radius=4.0)

    B.retint()
    W.haze(size=340, optical_depth=0.050, colour="#FFD2A8", loc=(0, 30, 10))
    # closer and aimed left of the hull, so the hull fills the right two thirds
    W.camera(loc=(-26.0, -31.0, 5.4), at=(-3.0, 3.0, 3.4), lens=40, shift_y=-0.05,
             dof_at=(7.0, 2.0, 2.0), fstop=4.0)
    return hull


def scene_title_v3_baydoor(samples=140):
    """v3 'Bay door' - inside the bay, looking past the hull out through the open door.

    The wordmark is painted on the door frame in the composite, so the lintel is kept clear
    and lit.
    """
    W.stage(samples=samples, exposure=-1.25)
    W.sky(top="#101B32", horizon="#243043", strength=0.9)
    W.floor(size=420, colour="#131009", roughness=0.6, z=-4.6)

    hull = W.load("kestrel", loc=(9.0, 16.0, 0.4), rot_z=math.radians(-118),
                  rot_x=math.radians(2))

    for x, w in ((-42, 26), (42, 26)):
        j = B.box(w, 16, 150, x, -14, 30, name="jamb")
        B.assign(j, B.gunmetal("jamb", tone="#1C1813", roughness=0.62, metallic=0.7))
    lintel = B.box(120, 16, 24, 0, -14, 58, name="lintel")
    B.assign(lintel, B.gunmetal("lintel", tone="#1C1813", roughness=0.6))

    W.load("gantry", loc=(-26, 10, -4.6), rot_z=math.radians(90), scale=1.1)
    W.load("rack", loc=(34, 30, -4.6), rot_z=0.4, scale=1.2)
    W.load("worklight", loc=(-34, -6, -4.6), rot_z=0.2, scale=1.2)
    W.load("refinery", loc=(60, 620, 10), rot_z=1.2)
    W.load("hulk", loc=(-120, 380, 30), rot_z=0.8, scale=1.4)

    W.worklight((-30, -4, 20), at=(4, 12, 2), irradiance=3.0, colour="#FFBE7E", radius=3.0)
    W.worklight((26, 2, 14), at=(9, 16, 1), irradiance=2.0, colour="#FFD2A0", radius=2.4)
    W.worklight((10, 150, 60), at=(8, 16, 2), irradiance=2.4, colour="#8FA8D8", radius=40)
    B.rockify()
    B.retint()
    W.haze(size=420, optical_depth=0.045, colour="#FFCC9E", loc=(0, 40, 14))
    W.camera(loc=(-16.0, -56.0, 5.0), at=(6.0, 16.0, 4.0), lens=34, shift_y=-0.02,
             dof_at=(9.0, 16.0, 2.0), fstop=4.5)
    return hull


def scene_crucible_door(samples=140):
    """The Crucible door - Ricochet Foundry as a lit set, at Crucible temperature.

    Hard metal banks, tight gaps, moving machinery, forge glow; the player's build ship in the
    lower foreground lit by the forge; the swarm massing as small lit shapes in the depth.
    """
    W.stage(samples=samples, exposure=-1.30)
    W.sky(top="#120C0A", horizon="#3A1608", strength=0.5)
    W.floor(size=620, colour="#120E0B", roughness=0.55, z=-10)

    for i, (x, y, rz, s) in enumerate([(-60, 46, 0.2, 2.0), (58, 54, -0.4, 2.2),
                                       (-88, 120, 0.8, 2.6), (86, 132, -0.9, 2.4),
                                       (-20, 190, 0.3, 3.0), (36, 210, -0.2, 2.8)]):
        W.load("truss", loc=(x, y, -10), rot_z=rz, scale=s, name="bank%d" % i)
    for i, (x, y, rz, s) in enumerate([(-44, 88, 0.5, 1.8), (52, 96, -0.6, 1.7),
                                       (-70, 170, 1.1, 2.1)]):
        W.load("rack", loc=(x, y, -10), rot_z=rz, scale=s, name="crate%d" % i)
    W.load("drill", loc=(0, 150, -10), rot_z=0.1, scale=2.4)
    W.load("radiator", loc=(-100, 70, -6), rot_z=1.4, scale=2.0)
    W.load("radiator", loc=(96, 80, -6), rot_z=-1.5, scale=1.9, name="rad2")

    hull = W.load("kestrel-lite", loc=(14, -34, -3.0), rot_z=math.radians(52),
                  rot_x=math.radians(-6))

    for i in range(14):
        a = 0.55 + i * 0.42
        W.load("kestrel-lite",
               loc=(math.sin(a) * (60 + i * 9), 250 + (i % 5) * 34, 10 + math.cos(a) * 16),
               rot_z=a, scale=0.5, name="swarm%d" % i)

    for x, y, p in ((-56, 96, 5200000), (62, 108, 4400000), (0, 176, 6200000)):
        W.worklight((x, y, -6), at=(x * 0.4, y * 0.5, 6), power=p, colour="#FF5A1E", radius=16)
    W.worklight((-24, -66, 22), at=(14, -34, 0), irradiance=9.0, colour="#FFFFFF", radius=4.0)
    W.worklight((54, -50, 14), at=(14, -34, 0), irradiance=3.2, colour="#FFD9C0", radius=3.0)

    # the swarm has to be lit to be seen; a cold key separates it from the forge
    W.worklight((0, 300, 90), at=(0, 250, 12), irradiance=2.6, colour="#FFE2CE", radius=40)
    B.retint()
    W.haze(size=760, optical_depth=0.030, colour="#FF9A5E", loc=(0, 150, 20))
    W.camera(loc=(-42.0, -108.0, 30.0), at=(6.0, 60.0, 6.0), lens=38, shift_y=-0.03,
             dof_at=(14.0, -34.0, 0.0), fstop=6.3)
    return hull


def scene_flight(samples=140):
    """The flight picture the HUD sits over - the game's chase camera, above and behind.

    A warm nebula band and a ringed gas giant upper right, a derelict mid-distance, stars.
    Nothing of the interface sits in the middle third, so the hull is centred slightly low and
    the depth is kept clean there.
    """
    W.stage(samples=samples, exposure=0.25)
    W.sky(top="#070A14", horizon="#140C16", strength=0.35)

    hull = W.load("kestrel", loc=(0, 0, 0), rot_z=math.radians(-94), rot_x=math.radians(-7))

    W.load("hulk", loc=(-190, 420, 40), rot_z=1.1, scale=1.8)
    W.load("pod", loc=(-52, 120, -16), rot_z=0.8, scale=1.6)
    W.load("rock-b", loc=(120, 300, -60), rot_z=0.4, scale=3.0)
    W.load("rock-a", loc=(-260, 620, -90), rot_z=1.7, scale=5.0)

    # a real gas giant with a ring, lit by the same key as the hull
    bpy.ops.mesh.primitive_uv_sphere_add(radius=520, location=(1500, 3400, 620),
                                         segments=64, ring_count=32)
    giant = bpy.context.object
    gm = B.gunmetal("giant", tone="#C08A56", roughness=0.95, metallic=0.0)
    B.assign(giant, gm)
    bpy.ops.mesh.primitive_torus_add(major_radius=900, minor_radius=1.0,
                                     location=(780, 2100, 560), rotation=(0.32, 0.1, 0))
    ring = bpy.context.object
    ring.scale = (1, 1, 0.02)
    B.assign(ring, B.gunmetal("ring", tone="#B79A78", roughness=0.9, metallic=0.0, grain=False))

    # the nebula band: a big emissive sheet far behind, warm, off to one side
    band = B.quad(9000, 3400, "nebula")
    band.location = (-1400, 4200, 260)
    band.rotation_euler = (math.radians(78), 0, math.radians(-14))
    nm = bpy.data.materials.new("nebula")
    nm.use_nodes = True
    nt = nm.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    em = nt.nodes.new("ShaderNodeEmission")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 2.6
    noise.inputs["Detail"].default_value = 9.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.40
    ramp.color_ramp.elements[0].color = B.srgb("#180C14")
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = B.srgb("#8A4A3C")
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 0.85
    nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    B.assign(band, nm)

    B.rockify()
    B.retint()
    W.worklight((-120, -90, 70), at=(0, 0, 0), irradiance=3.2, colour="#FFD2A0", radius=26)
    W.worklight((160, 210, -60), at=(0, 0, 0), irradiance=2.2, colour="#7E9AD8", radius=30)
    W.camera(loc=(2.0, -62.0, 30.0), at=(0.0, 6.0, 0.0), lens=46, shift_y=0.03)
    return hull


# ---------------------------------------------------------------- S2 BENCH world plates
# These builders deliberately leave the five S1 builders and their helpers unchanged.


def _s2_load(key, **placement):
    """Use the native importer, with one authored LOD and a fresh parent hierarchy.

    The S1 cache duplicates objects without remapping nested parents. Re-import for S2
    instances so a second gantry cannot leave its meshes attached to the first gantry.
    This is local to the new builders; S1's scene construction is untouched.
    """
    W._CACHE.pop(key, None)
    root = W.load(key, **placement)
    for ob in root.children_recursive:
        if key != "kestrel" and ob.type == "MESH" and ob.name.startswith(("LOD1_", "LOD2_")):
            ob.hide_render = True
    return root


def _s2_ground(root, height):
    """Seat native feet on the deck without changing their geometry or scale."""
    bottom, _ = W.bounds(root)
    root.location.z += height - bottom.z
    bpy.context.view_layer.update()
    return root


def _s2_service_accent(root):
    """Replace only the support equipment's untextured cyan paint, in this scene."""
    coating = B.paint("s2-service-coating", "#706454", roughness=.68)
    for ob in root.children_recursive:
        if ob.type == "MESH":
            for slot in ob.material_slots:
                if slot.material and slot.material.name.split('.')[0] == "Material_Accent":
                    slot.material = coating


def _s2_dock_lights(dock, scale=1.0, cold=False, power=2.8):
    """Place practical sources at the authored rear portal's recessed flood fixtures."""
    from mathutils import Vector
    bpy.context.view_layer.update()
    colour = "#DDE6FF" if cold else "#FFC18A"
    for x in (-15.2, 15.2):
        loc = dock.matrix_world @ Vector((x, 14.3, 10.5))
        at = dock.matrix_world @ Vector((x * .35, -2, -1))
        W.worklight(loc, at=at, irradiance=power, colour=colour, radius=2.4 * scale)
    # Only the dock's light-lens material is re-coloured, not its textured metal.
    for ob in dock.children_recursive:
        if ob.type != "MESH":
            continue
        for mat in ob.data.materials:
            if mat and mat.name.split('.')[0] == "Material_Accent":
                p = mat.node_tree.nodes.get("Principled BSDF")
                if p:
                    B._set(p, "Base Color", B.srgb(colour))
                    B._set(p, "Emission Color", B.srgb(colour))


def _s2_berth_set(samples, cold=False):
    """The shared dock and landed hull, with a real native skid assembly under its belly."""
    from mathutils import Vector
    W.stage(samples=samples, exposure=-1.05)
    W._CACHE.clear()
    W.sky(top="#131C30", horizon="#23180F", strength=.12)
    dock_scale = 1.6
    dock = _s2_load("dock", loc=(4, 3, 0), scale=dock_scale)
    floor_z, pad_z = -3.76 * dock_scale, -3.55 * dock_scale
    # Continuous apron under the authored deck, using the same floor material as S1.
    W.floor(size=320, colour="#15110D", roughness=.7, z=floor_z - .17)

    yaw = math.radians(202)
    hull = _s2_load("kestrel", loc=(4, 3, pad_z + 4.85), rot_z=yaw)
    # Complete authored landing gear, used as the berth's removable support stand.
    W.GLB["s2-skid"] = "assets/ships/parts/gear/skid_quad.glb"
    for i, local_x in enumerate((-6.4, 1.6)):
        offset = Vector((local_x, 0, 0))
        offset.rotate(hull.rotation_euler)
        skid = _s2_load("s2-skid", loc=(4 + offset.x, 3 + offset.y, 0),
                        rot_z=yaw, scale=1.5, name="berth-skid-%d" % i)
        _s2_ground(skid, pad_z)
        _s2_service_accent(skid)

    # Structure is off the hull's face; the native dock crane supplies the overhead cable.
    gantry = _s2_load("gantry", loc=(20, 16, 0), scale=1.5,
                      rot_z=math.radians(90), name="berth-service-gantry")
    _s2_ground(gantry, floor_z)
    rack = _s2_load("rack", loc=(33, 22, 0), rot_z=-.25, scale=.8)
    _s2_ground(rack, floor_z)
    pod = _s2_load("pod", loc=(28, -8, 0), rot_z=.2, scale=.8)
    _s2_ground(pod, floor_z)
    tower = _s2_load("worklight", loc=(29, -12, 0), rot_z=-.6, scale=.85)
    _s2_ground(tower, floor_z)
    B.retint()
    _s2_dock_lights(dock, dock_scale, cold=cold, power=2.6)
    key = "#DDE6FF" if cold else "#FFBE7A"
    fill = "#829BCC" if cold else "#FFC28E"
    W.worklight((29, -12, floor_z + 12.5), at=(4, 3, 0), irradiance=3.1,
                colour=key, radius=2.4)
    W.worklight((-18, -28, 12), at=(4, 3, 0), irradiance=1.45,
                colour=fill, radius=12)
    W.worklight((8, 28, 17), at=(4, 3, 0), irradiance=.65,
                colour="#9AAECE", radius=7)
    # The same geometry/camera is used by berth-cold; only light temperature changes.
    if cold:
        for mat in bpy.data.materials:
            if mat.use_nodes and "lightflood" in mat.name.lower():
                for node in mat.node_tree.nodes:
                    for socket in ("Emission Color", "Color"):
                        if socket in node.inputs and not node.inputs[socket].is_linked:
                            node.inputs[socket].default_value = B.srgb("#DDE6FF")
    return hull


def scene_berth(samples=96):
    """Dock arrival / Market: a working warm berth with a calm left overlay area."""
    hull = _s2_berth_set(samples)
    W.camera(loc=(-28, -57, 11), at=(-5, 4, 1.2), lens=43, shift_y=-.025,
             dof_at=(4, 3, 0), fstop=5.6)
    return hull


def scene_berth_cold(samples=96):
    """Wanted-temperature version: identical set and framing, cold practicals."""
    hull = _s2_berth_set(samples, cold=True)
    W.camera(loc=(-28, -57, 11), at=(-5, 4, 1.2), lens=43, shift_y=-.025,
             dof_at=(4, 3, 0), fstop=5.6)
    return hull


def scene_ship_rig(samples=96):
    """THE SHIP / Load: whole Hitch, three-quarter, occupying the presentation stage."""
    hull = _s2_berth_set(samples)
    W.camera(loc=(-24, -37, 13), at=(2, 3, .5), lens=45, shift_y=-.015,
             dof_at=(4, 3, 0), fstop=6.3)
    return hull


def scene_workshop_bench(samples=96):
    """Settings: the dock's native service plinth and indexed tool cassettes, close up.

    The complete dock is uniformly scaled for a human-sized maintenance alcove. Its work
    deck, access steps, cassettes, rear cabinets, crane and cable are all authored GLB parts.
    """
    W.stage(samples=samples, exposure=-1.6)
    W._CACHE.clear()
    W.sky(top="#161C28", horizon="#23180F", strength=.1)
    dock = _s2_load("dock", scale=.32)
    floor_z = -3.76 * .32
    W.floor(size=90, colour="#15110D", roughness=.78, z=floor_z - .055)
    # Native maintenance assembly laid on the service deck beside its tool cassettes.
    W.GLB["s2-repair"] = "assets/ships/parts/pods/pod_repair_patch.glb"
    repair = _s2_load("s2-repair", loc=(-7.5, -4.65, 0), scale=.2, rot_z=.08)
    _s2_ground(repair, -1.96 * .32)
    _s2_service_accent(repair)
    _s2_dock_lights(dock, .32, power=1.5)
    tower = _s2_load("worklight", loc=(-9.2, -1.6, 0), scale=.22, rot_z=.7)
    _s2_ground(tower, floor_z)
    W.worklight((-9.2, -1.6, floor_z + 3.22), at=(-6.4, -4, -.6),
                irradiance=2.1, colour="#FFC18A", radius=.55)
    W.worklight((-3, -8, 3), at=(-6.4, -4, -.6), irradiance=.75,
                colour="#FFD1A6", radius=3)
    B.retint()
    W.camera(loc=(-10.7, -13.3, 3.1), at=(-4.8, -2.3, -.25), lens=52,
             dof_at=(-6.48, -4.25, -.63), fstop=.7, shift_y=-.045)
    return dock


# The eight named systems requested by P04. Positions/edges retain the game's graph:
# src/data/sectors.js and src/data/frontierRegions/south.js (Dione), 2026-09-11.
# Z is a presentation-depth layer only, not a change to the world's 2D geography.
S2_CHART_SYSTEMS = (
    ("Helios Prime",     0,  0,  -4, "#FFE0AE", .37),
    ("Vesta Forge",      0,  4, -16, "#E5B088", .30),
    ("Ceres Belt",      -3,  2,  -9, "#D9BE95", .28),
    ("Tethys Junction",  3,  2, -20, "#CED7E6", .32),
    ("Pallas Drift",    -5,  5, -27, "#B9C5D9", .25),
    ("Io Reach",         5,  5, -12, "#DACAB4", .28),
    ("Dione Lane",       8, -1, -22, "#DDE6FF", .28),
    ("Charon Expanse",   2,  7, -32, "#BCA9A5", .25),
)
S2_CHART_LANES = ((0, 2), (0, 3), (0, 1), (2, 3), (2, 4), (3, 1),
                  (3, 5), (1, 7), (4, 5), (5, 7), (3, 6))


def scene_chart_field(samples=96):
    """A deep survey field: eight real sector positions, quiet etches, open centre."""
    from mathutils import Vector
    W.stage(samples=samples, exposure=-.15)
    W._CACHE.clear()
    W.sky(top="#111725", horizon="#13111A", strength=.3)
    cam = W.camera(loc=(0, 0, 160), at=(0, 0, 0), lens=43)
    cam.data.clip_end = 20000
    # Separate distant shells give actual depth; no stars become foreground dust cards.
    for i, (distance, count, size, strength) in enumerate(
            ((1200, 220, .00065, 1.2), (2900, 520, .0004, .85),
             (6000, 1000, .00025, .6))):
        B.chart_stars(cam, distance, count, size, strength, seed=19420 + i)
    B.chart_dust("chart-dust-warm", (-180, 95, -680), (450, 86, 52),
                 "#80543A", rotation=-.3)
    B.chart_dust("chart-dust-cool", (150, -155, -1080), (670, 125, 70),
                 "#34445C", rotation=.24)
    points = []
    for name, x, y, z, colour, radius in S2_CHART_SYSTEMS:
        depth_scale = (160 - z) / 160
        point = Vector(((x - 1.5) * 7.0 * depth_scale,
                        (y - 3) * 7.0 * depth_scale, z))
        points.append(point)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12,
                                             radius=radius * depth_scale, location=point)
        star = bpy.context.object
        star.name = "sector-" + name.lower().replace(" ", "-")
        star["sector_name"] = name
        B.assign(star, B.emissive(star.name, colour, strength=4.0))
    etch = B.gunmetal("chart-lane-etch", tone="#756C60", roughness=.7,
                     metallic=.35, grain=False)
    for a, b in S2_CHART_LANES:
        direction = (points[b] - points[a]).normalized()
        start, end = points[a] + direction * .8, points[b] - direction * .8
        B.spatial_line("lane-%d-%d" % (a, b), (start, end), .035, etch)
    W.worklight((-40, 40, 95), at=(0, 0, -10), irradiance=1.0,
                colour="#CBB89D", radius=65)
    return cam


def _s2_cold_practicals():
    """Re-light the current set at wanted temperature, preserving geometry and camera."""
    for ob in bpy.context.scene.objects:
        if ob.type == "LIGHT":
            ob.data.color = B.srgb("#DDE6FF")[:3]
    # Match the kit's cold fill without changing the warm builder's lights or API.
    # The workshop fill is the existing broad source at (-3, -8, 3).
    for ob in bpy.context.scene.objects:
        if ob.type == "LIGHT" and (ob.name == "hangar-wall-fill" or
                all(abs(ob.location[i] - v) < .001 for i, v in enumerate((-3, -8, 3)))):
            ob.data.color = B.srgb("#829BCC")[:3]
    fixture_roles = {"Material_Accent", "Material_LightFlood", "Material_LightSignal"}
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.name.split('.')[0] not in fixture_roles:
            continue
        for node in mat.node_tree.nodes:
            sockets = ("Color",) if node.type == "EMISSION" else (
                ("Base Color", "Emission Color") if node.type == "BSDF_PRINCIPLED" else ())
            for socket in sockets:
                if socket in node.inputs and not node.inputs[socket].is_linked:
                    node.inputs[socket].default_value = B.srgb("#DDE6FF")


def scene_hangar_wall(samples=48):
    """Title-adjacent wall: near-frontal dressed panels, quiet middle, edge machinery.

    The native wall supplies its own seams, cabinets, pipe runs, crane and lettering.
    The camera looks past peripheral gantries rather than toward a centred hull or prop.
    """
    W.stage(samples=samples, exposure=-1.55)
    W._CACHE.clear()
    W.sky(top="#161C28", horizon="#23180F", strength=.1)
    dock = _s2_load("dock")
    floor_z = -3.76
    W.floor(size=160, colour="#15110D", roughness=.78, z=floor_z - .17)
    for name, x, y, scale in (("wall-gantry-left", -23, 5, .75),
                               ("wall-gantry-right", 18, 8, 1.0)):
        gantry = _s2_load("gantry", loc=(x, y, 0), rot_z=math.pi / 2,
                          scale=scale, name=name)
        _s2_ground(gantry, floor_z)
    B.retint()
    _s2_dock_lights(dock, power=.9)
    # A broad warm rake reveals the wall's relief without a bright pool in its centre.
    W.worklight((-18, -6, 11), at=(-8.5, 16, 5.5), irradiance=1.1,
                colour="#FFC18A", radius=10)
    fill = W.worklight((6, 3, 9), at=(-8, 16, 6), irradiance=.45,
                       colour="#D5B59A", radius=7)
    fill.name = "hangar-wall-fill"
    W.camera(loc=(-10, -36, 5.6), at=(-8.5, 16, 5.8), lens=55,
             dof_at=(-8.5, 16, 5.8), fstop=.7, shift_y=-.03)
    return dock


def scene_hangar_wall_cold(samples=48):
    """The same quiet wall shot, with wanted-temperature practicals and fill."""
    dock = scene_hangar_wall(samples=samples)
    _s2_cold_practicals()
    return dock


def scene_workshop_bench_cold(samples=48):
    """The delivered workshop's exact geometry, exposure and camera, re-lit cold."""
    dock = scene_workshop_bench(samples=samples)
    _s2_cold_practicals()
    return dock


SCENES = {
    "title-v1-hangar": scene_title_v1_hangar,
    "title-v2-field": scene_title_v2_field,
    "title-v3-baydoor": scene_title_v3_baydoor,
    "crucible-door": scene_crucible_door,
    "flight": scene_flight,
    "berth": scene_berth,
    "berth-cold": scene_berth_cold,
    "chart-field": scene_chart_field,
    "workshop-bench": scene_workshop_bench,
    "ship-rig": scene_ship_rig,
    "hangar-wall": scene_hangar_wall,
    "hangar-wall-cold": scene_hangar_wall_cold,
    "workshop-bench-cold": scene_workshop_bench_cold,
}


if __name__ == "__main__":
    argv = B.argv_after_dashes()
    positional = [a for a in argv if "=" not in a]
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    name = positional[0] if positional else "title-v2-field"
    out = positional[1] if len(positional) > 1 else os.path.join(
        W.REPO, ".devshots", "delegate-20260910", "scratch", "pq-194", "build", "plates",
        "plate-%s.png" % name)
    if len(positional) < 2 and name in ("berth", "berth-cold", "chart-field",
                                       "workshop-bench", "ship-rig", "hangar-wall",
                                       "hangar-wall-cold", "workshop-bench-cold"):
        out = os.path.join(W.REPO, ".devshots", "ui-packets", "S2-work", "plates",
                           "plate-%s.png" % name)
    SCENES[name](samples=int(opts.get("samples", 140)))
    if "width" in opts:
        sc = bpy.context.scene
        sc.render.resolution_x = int(opts["width"])
        sc.render.resolution_y = int(round(int(opts["width"]) * 9 / 16))
    B.render(out)
