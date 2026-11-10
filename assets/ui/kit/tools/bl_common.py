"""bl_common — the Field Hardware material library, in Blender.

Run inside Blender:  blender -b --factory-startup --python <script>.py

This is where the look is *authored*. Every raster in the kit is a Cycles render of real
geometry through these materials, so an asset has measured thickness, a real lit top edge from a
real grazing key, real anisotropic brushed grain, real chipped paint and real smoked glass — not
a gradient standing in for any of those.

Units: 1 Blender unit == 1 design pixel at @1x. A 480x320 plate is modelled 480x320 BU and
rendered at ortho_scale 480 with the resolution multiplied by `SCALE` for @2x. That keeps every
number in the packet ("a 3 px lit top edge at 1080p", "slice ~24") literally true in the model.

Screen space: +X right, +Y up, camera looks down -Z. So a plate's "top edge" is its +Y chamfer,
and the warm key sits high in +Y/+Z to graze it.
"""
from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- palette (02_ART_DIRECTION §7)

HEX = {
    "ground": "#0C0A08",
    "plate": "#1A1714",
    "plate-raised": "#26211B",
    "plate-sunk": "#100E0C",
    "edge-light": "#F2B950",
    "bone": "#EAE6DF",
    "legend": "#FFB347",
    "signal": "#F2B950",
    "hazard": "#FF6A2B",
    "hazard-paint": "#D9551F",       # the sprayed value; the token is the UI signal colour
    "hazard-paint-yellow": "#C79A3C",
    "hazard-yellow": "#F2B950",
    "wanted": "#FF4D3D",
    "cold": "#DDE6FF",
    "good": "#9BD8A0",
    "bad": "#FF7A6B",
    "glass": "#05070A",
    "paper": "#E8DFCE",
}


def srgb(hex_str: str, a: float = 1.0):
    """sRGB hex -> Blender's linear RGBA. Cycles works in linear; the tokens are sRGB."""
    s = hex_str.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(s[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


# ---------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def scene(width: int, height: int, scale: int = 2, samples: int = 96,
          view_transform: str = "Standard", transparent: bool = True):
    """An orthographic, transparent-film Cycles scene sized in design pixels."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8
    sc.cycles.transmission_bounces = 8
    sc.cycles.transparent_max_bounces = 12
    sc.cycles.device = "CPU"
    sc.render.film_transparent = transparent
    sc.render.resolution_x = width * scale
    sc.render.resolution_y = height * scale
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    sc.render.image_settings.compression = 90
    sc.view_settings.view_transform = view_transform
    sc.view_settings.look = "None"
    sc.render.filter_size = 1.2

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = float(max(width, height))
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (0, 0, 600)
    bpy.context.collection.objects.link(cam)
    sc.camera = cam

    # Blender fits ortho_scale to the *larger* sensor axis; with a non-square render the
    # shorter axis follows automatically, so a design-pixel unit stays square.
    return sc


def world(strength: float = 0.02, colour: str = "#2A2016"):
    w = bpy.data.worlds.new("w")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = srgb(colour)
    bg.inputs["Strength"].default_value = strength
    return w


TEMPS = {
    # (key colour, fill colour) per §7 temperature state.
    # The key is only lightly warm: a saturated tungsten key drags neutral gunmetal to
    # tobacco, and §5 bans neither gray nor orange — it asks for *warm gunmetal*.
    "warm": ("#FFDCAE", "#8FA6C8"),      # flight / menus over the world
    "docked": ("#FFDCB4", "#A8846A"),    # warmer: plates +6% red
    "cold": ("#E8EEFF", "#7E93C6"),      # wanted: the backlights go cold white-blue
    "white": ("#FFFFFF", "#CFE0FF"),     # Crucible: white-hot
}


def _area(name, loc, irradiance, colour, sx, sy=None, at=(0.0, 0.0, 0.0)):
    """An area light aimed at `at`, whose power is solved from a target irradiance.

    Two things about Blender area lights that this exists to get right:

    1. **They emit from one face only, along local -Z.** A hand-written Euler that points the
       light away from the subject contributes almost nothing, and the symptom is not an
       error — it is a scene that stays dark however far you push the energy. So the aim is
       derived from the vector to the target, never written by hand.
    2. **Power is total watts**, so illuminance falls with distance squared. Sizing by
       irradiance keeps one rig portable between a 56 px socket and a 480 px plate.
    """
    d = bpy.data.lights.new(name, type="AREA")
    d.shape = "RECTANGLE"
    d.size, d.size_y = sx, sy or sx
    direction = Vector(at) - Vector(loc)
    dist = max(direction.length, 1.0)
    d.energy = irradiance * 4.0 * math.pi * dist * dist
    d.color = srgb(colour)[:3]
    o = bpy.data.objects.new(name, d)
    o.location = loc
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(o)
    return o


def rig(temp: str = "warm", span: float = 700.0, key: float = 9.5, fill: float = 0.42,
        wash: float = 0.34, size: float = 520.0):
    """The Field Hardware light rig for a flat, top-down instrument shot.

    wash — broad and frontal. On a top-down camera this is what actually lights the plate
           *face*: a metal lit only from the side reflects its lobe away from the lens and
           renders black. This is the soft box a product photographer puts over the bench.
    key  — warm and grazing from +Y. This is what makes the lit top edge: it catches the +Y
           chamfer and leaves the -Y chamfer in the under-shadow (§4, "a 2-4 px lit top edge
           at 1080p, a 1-2 px shadow under").
    fill — cool and low from -Y, weak, so the under-shadow separates from black instead of
           crushing.
    """
    warm, cool = TEMPS.get(temp, TEMPS["warm"])
    k = _area("key", (span * 0.06, span * 0.82, span * 0.40), key, warm, size, size * 0.45)
    f = _area("fill", (-span * 0.55, -span * 0.72, span * 0.34), fill, cool, size, size * 0.5)
    w = _area("wash", (span * 0.20, span * 0.34, span * 1.20), wash, warm,
              size * 1.6, size * 1.6)
    return k, f, w


# ---------------------------------------------------------------- materials


def _pbsdf(mat):
    return mat.node_tree.nodes["Principled BSDF"]


def _set(node, name, value):
    """Socket names moved between Blender versions; skip what this build does not have."""
    if name in node.inputs:
        node.inputs[name].default_value = value
        return True
    return False


def _brushed(mat, node, strength: float = 0.10, scale: float = 420.0,
             stretch: float = 26.0):
    """Anisotropic brushed grain: noise stretched along X, driving roughness only.

    §4 says the surface has faint brushed grain and is never gloss, and §5 caps wear at 8%.
    The grain here moves roughness by <= `strength`, which reads as machining, not as noise.
    """
    nt = mat.node_tree
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 6.0
    tex.inputs["Roughness"].default_value = 0.62
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0 / stretch, 1.0, 1.0)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])

    base = node.inputs["Roughness"].default_value
    rng = nt.nodes.new("ShaderNodeMapRange")
    rng.inputs["From Min"].default_value = 0.0
    rng.inputs["From Max"].default_value = 1.0
    rng.inputs["To Min"].default_value = max(0.02, base - strength)
    rng.inputs["To Max"].default_value = min(0.98, base + strength)
    nt.links.new(tex.outputs["Fac"], rng.inputs["Value"])
    nt.links.new(rng.outputs["Result"], node.inputs["Roughness"])
    return tex


def gunmetal(name: str = "gunmetal", tone: str = "plate", roughness: float = 0.42,
             grain: bool = True, metallic: float = 0.88):
    """Matte anodised dark metal. The one surface everything else sits on."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = _pbsdf(mat)
    _set(p, "Base Color", srgb(HEX[tone] if tone in HEX else tone))
    _set(p, "Metallic", metallic)
    _set(p, "Roughness", roughness)
    _set(p, "Anisotropic", 0.22)
    _set(p, "Anisotropic Rotation", 0.0)
    _set(p, "Specular IOR Level", 0.42)
    _set(p, "Coat Weight", 0.0)
    if grain:
        _brushed(mat, p)
    return mat


def paint(name: str, hex_colour: str, roughness: float = 0.62):
    """Sprayed / painted marking. Dielectric, slightly uneven — never gloss."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = _pbsdf(mat)
    _set(p, "Base Color", srgb(hex_colour))
    _set(p, "Metallic", 0.0)
    _set(p, "Roughness", roughness)
    _set(p, "Specular IOR Level", 0.3)
    _brushed(mat, p, strength=0.08, scale=180.0, stretch=8.0)
    return mat


def emissive(name: str, hex_colour: str = None, strength: float = 6.0, key: str = "legend"):
    """A backlit legend's light source: an emissive surface behind a cut in the plate."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = srgb(hex_colour or HEX[key])
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    return mat


def glass(name: str = "glass", darken: float = 0.45, tint: str = "glass",
          rim_gloss: float = 0.06):
    """Smoked window: a real darkening pane that keeps the scene behind it *sharp*.

    Rendered on a transparent film this resolves to RGBA with alpha == `darken`, so code can
    lay it over a live scene and the world reads through at exactly the authored darkness.
    A faint glossy lobe gives the reflection strip when a broad light is in view.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = nt.nodes["Material Output"]

    smoke = nt.nodes.new("ShaderNodeBsdfDiffuse")
    smoke.inputs["Color"].default_value = srgb(HEX.get(tint, tint))
    gloss = nt.nodes.new("ShaderNodeBsdfGlossy")
    gloss.inputs["Color"].default_value = srgb("#5A6472")
    gloss.inputs["Roughness"].default_value = 0.18
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")

    mix_gloss = nt.nodes.new("ShaderNodeMixShader")
    mix_gloss.inputs["Fac"].default_value = rim_gloss
    nt.links.new(smoke.outputs[0], mix_gloss.inputs[1])
    nt.links.new(gloss.outputs[0], mix_gloss.inputs[2])

    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = darken
    nt.links.new(transp.outputs[0], mix.inputs[1])
    nt.links.new(mix_gloss.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def etch(name: str = "etch"):
    """A line cut into the plate: slightly lighter than the plate, never glowing (§4)."""
    return gunmetal(name, tone="#39322A", roughness=0.55, grain=False, metallic=0.72)


def paper(name: str = "paper"):
    """The codex reading insert: cream paper in a machined rim."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = _pbsdf(mat)
    _set(p, "Base Color", srgb(HEX["paper"]))
    _set(p, "Metallic", 0.0)
    _set(p, "Roughness", 0.86)
    _set(p, "Specular IOR Level", 0.18)
    _brushed(mat, p, strength=0.05, scale=520.0, stretch=1.4)
    return mat


# ---------------------------------------------------------------- geometry


def plate(w: float, h: float, thickness: float = 6.0, edge: float = 3.0, lift: float = 1.1,
          cut_corner: float = 0.0, radius: float = 0.0, name: str = "plate", z: float = 0.0,
          bevel: float = 0.45):
    """A machined plate: a real solid with a real *relieved* edge.

    §4 asks for "a 2-4 px lit top edge at 1080p, a 1-2 px shadow under". From a top-down
    orthographic camera a 45-degree chamfer of width c only projects to c/sqrt(2) pixels, so a
    chamfer wide enough to read would have to be wider than the plate is thick — and a Bevel
    modifier wider than half the thickness collapses the solid instead.

    So the edge is machined the way it is on real equipment: the top face is inset by `edge`
    and stands `lift` proud of the surrounding rim, leaving a shallow ring (about 20 degrees)
    that projects to its full `edge` width. Under the grazing key the +Y arc of that ring is
    the lit top edge and the -Y arc is the shadow under. `bevel` then breaks the two hard
    creases just enough to stop them aliasing.

    `cut_corner` applies the direction's *one signature cut angle* (top-right) — allowed on
    primary plates only. `radius` is the small machined corner radius used everywhere else.
    """
    import bmesh

    ob = box(w, h, thickness, 0, 0, z + thickness / 2, name)

    if cut_corner > 0:
        _cut_corner(ob, w, h, cut_corner)
    if radius > 0:
        _round_corners(ob, radius)

    if edge > 0 and lift > 0:
        me = ob.data
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        top = max(bm.faces, key=lambda f: f.calc_center_median().z)
        # inset_individual returns the new rim faces and leaves `top` as the inner face,
        # so raising `top`'s verts lifts the plate face and leaves the ring sloping.
        bmesh.ops.inset_individual(bm, faces=[top], thickness=edge, depth=0.0,
                                   use_even_offset=True)
        bmesh.ops.translate(bm, vec=(0, 0, lift), verts=list(top.verts))
        bm.to_mesh(me)
        bm.free()
        thickness = thickness + lift

    ob["thickness"] = float(thickness)
    ob["edge"] = float(edge)
    ob["top"] = max((v.co.z for v in ob.data.vertices), default=thickness / 2.0)
    ob["rim"] = ob["top"] - lift

    if bevel > 0:
        m = ob.modifiers.new("bevel", "BEVEL")
        m.width = min(bevel, max(0.05, edge * 0.28), max(0.05, thickness * 0.12))
        m.segments = 2
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(20)
        m.harden_normals = True
    auto_smooth(ob, 24.0)
    return ob


def auto_smooth(ob, angle_deg: float = 32.0):
    """Smooth only across the chamfer; keep the machined faces flat.

    Blender 4.1 removed `Mesh.use_auto_smooth` in favour of the shade_auto_smooth operator,
    so this is version-tolerant rather than assuming either API.
    """
    bpy.context.view_layer.objects.active = ob
    if hasattr(bpy.ops.object, "shade_auto_smooth"):
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle_deg))
    elif hasattr(ob.data, "use_auto_smooth"):
        ob.data.use_auto_smooth = True
        ob.data.auto_smooth_angle = math.radians(angle_deg)
        bpy.ops.object.shade_smooth()
    return ob


def _cut_corner(ob, w: float, h: float, size: float):
    """One 45-degree machined cut at the top-right — the signature angle."""
    knife = box(size * 2, size * 2, 400, name="corner-knife")
    knife.rotation_euler = (0, 0, math.radians(45))
    knife.location = (w / 2, h / 2, 0)
    b = ob.modifiers.new("cut", "BOOLEAN")
    b.operation = "DIFFERENCE"
    b.object = knife
    b.solver = "EXACT"
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(knife, do_unlink=True)


def _round_corners(ob, radius: float):
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new("corner", "BEVEL")
    m.width = radius
    m.segments = 4
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(80)
    m.affect = "EDGES"
    bpy.ops.object.modifier_apply(modifier="corner")


def box(w: float, h: float, d: float, x: float = 0.0, y: float = 0.0, z: float = 0.0,
        name: str = "box"):
    """A box of exactly w x h x d design pixels, centred on (x, y, z).

    `primitive_cube_add(size=2)` is the unit cube whose verts sit at +/-1, so a scale of
    (w/2, h/2, d/2) yields the stated dimensions. With `size=1` the same scale silently
    yields a box of half the requested size — and every derived asset, slice inset and
    recess then reads half as large with nothing to show it went wrong.
    """
    bpy.ops.mesh.primitive_cube_add(size=2, location=(x, y, z))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (w / 2, h / 2, d / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob


def quad(w: float, h: float, name: str = "quad"):
    """A flat quad of exactly w x h design pixels at the origin. See `box` on size=2."""
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (w / 2, h / 2, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob


def top_local(ob) -> float:
    """The plate's top face in its OWN space — the single fact every recess and inlay is
    measured down from.

    Read from the mesh rather than computed from `thickness`: a plate's face is lifted by the
    relieved edge, and `bpy.ops.object.transform_apply` bakes the origin unless every one of
    its three defaults is pinned. Deriving this arithmetically is how a recess ends up cut
    into the bottom half of a plate with no error and no visible well.
    """
    if "top" in ob:
        return float(ob["top"])
    return max((v.co.z for v in ob.data.vertices), default=0.0)


def top_world(ob) -> float:
    """The plate's top face in WORLD z — what anything positioned with `box()` needs.

    `box()` takes world coordinates and `recess`/`pane(on=)` take plate-local ones; mixing
    them is the one mistake this library makes easy, so both readings are named.
    """
    bpy.context.view_layer.update()
    return float(ob.matrix_world.translation.z) + top_local(ob)


def recess(ob, w: float, h: float, depth: float, x: float = 0.0, y: float = 0.0,
           bevel: float = 0.8):
    """Cut a well into a plate — a sunk region, a legend slot, a socket, a light well.

    `depth` is measured DOWN FROM THE TOP FACE; x/y are in the plate's own space. Booleans
    resolve in world space, so both are converted through the plate's matrix here: a plate
    that has already been moved would otherwise be cut somewhere off its own surface,
    silently, with no error and no visible well.
    """
    knife = box(w, h, depth, name="knife")
    bpy.context.view_layer.update()
    knife.location = ob.matrix_world @ Vector((x, y, top_local(ob) - depth / 2 + 0.002))
    knife.rotation_euler = ob.rotation_euler
    if bevel:
        bm = knife.modifiers.new("b", "BEVEL")
        bm.width = bevel
        bm.segments = 2
        bpy.context.view_layer.objects.active = knife
        bpy.ops.object.modifier_apply(modifier="b")
    b = ob.modifiers.new("recess", "BOOLEAN")
    b.operation = "DIFFERENCE"
    b.object = knife
    b.solver = "EXACT"
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="recess")
    bpy.data.objects.remove(knife, do_unlink=True)
    return ob


def pane(w: float, h: float, x: float = 0.0, y: float = 0.0, z: float = 0.0,
         name: str = "pane", on=None, depth: float = None):
    """A flat quad — glass, an emissive backing, a painted marking, an etched line.

    With `on=<plate>` the quad is positioned in that plate's own space, and `depth` (if given)
    measures DOWN FROM THAT PLATE'S TOP FACE — the same convention as `recess`, so a light
    sitting 0.6 below the floor of a 3.4-deep well is `depth=4.0`, not an absolute z anyone
    has to re-derive.
    """
    ob = quad(w, h, name)
    if on is not None:
        bpy.context.view_layer.update()
        local_z = (top_local(on) - depth) if depth is not None else z
        ob.location = on.matrix_world @ Vector((x, y, local_z))
        ob.rotation_euler = on.rotation_euler
    else:
        ob.location = Vector((x, y, z))
    return ob


def move(ob, x: float = 0.0, y: float = 0.0, z: float = None):
    """Move a finished widget into place. Do every recess and pane BEFORE this."""
    ob.location = (x, y, ob.location.z if z is None else z)
    return ob


class group:
    """Build a widget at the origin, then move the whole thing into place.

        with B.group(x=-250, y=140):
            p = B.plate(...); B.recess(p, ...); B.pane(..., on=p)

    Booleans resolve in world space, so a widget must be assembled where it was modelled and
    relocated only once it is finished.
    """

    def __init__(self, x: float = 0.0, y: float = 0.0, z: float = 0.0):
        self.x, self.y, self.z = x, y, z
        self._before: set = set()

    def __enter__(self):
        self._before = set(bpy.data.objects)
        return self

    def __exit__(self, *exc):
        for ob in set(bpy.data.objects) - self._before:
            ob.location = (ob.location.x + self.x, ob.location.y + self.y,
                           ob.location.z + self.z)
        return False


def hazard_band(host, w: float, h: float, x: float = 0.0, y: float = 0.0,
                pitch: float = 30.0, angle: float = 38.0, chip: float = 0.30,
                wanted: bool = False, thick: float = 1.1):
    """Safety paint: an orange/yellow chevron stripe painted onto a plate and chipped.

    Each chevron is a real slab laid on the plate's top face and INTERSECTed with the host, so
    the paint stops exactly at the plate's relieved edge the way masked spray does. Position
    is world-space (see `top_world`) because a boolean resolves in world space.
    """
    made = []
    top = top_world(host)
    inset = float(host.get("edge", 3.0)) + 0.6
    # Masked spray sits PROUD of the plate and stops at the face boundary. Intersecting the
    # chevrons with the host itself instead makes their top surface coincident with the
    # plate's, and the z-fighting that follows reads as mottled clip-art.
    clip = box(max(1.0, w - inset * 2), max(1.0, h - inset * 2), thick * 6,
               x, y, top + thick * 0.5, name="paint-mask")
    clip.hide_render = True
    n = int(w / pitch) + 3
    for i in range(-n, n + 1):
        ch = box(pitch * 0.42, (w + h) * 1.6, thick, x + i * pitch, y,
                 top + thick * 0.22, name="chevron")
        ch.rotation_euler = (0, 0, math.radians(angle))
        col = HEX["wanted"] if wanted else (HEX["hazard-paint"] if i % 2 == 0
                                           else HEX["hazard-paint-yellow"])
        # sprayed safety paint is chalky, not saturated plastic
        m = paint("hazard-%d" % i, col, roughness=0.78)
        assign(ch, m)
        if chip:
            _chip_edges(m, chip)
        b = ch.modifiers.new("clip", "BOOLEAN")
        b.operation, b.object, b.solver = "INTERSECT", clip, "EXACT"
        bpy.context.view_layer.objects.active = ch
        bpy.ops.object.modifier_apply(modifier="clip")
        made.append(ch)
    return made


def _chip_edges(mat, amount: float = 0.35):
    """Chipped paint: a noise threshold cuts holes in the paint so the plate shows through.

    §4 calls the hazard stripe "chipped at the edges" and §5 caps wear at 8% of a surface, so
    this removes paint rather than painting damage on top of it.
    """
    nt = mat.node_tree
    p = _pbsdf(mat)
    out = nt.nodes["Material Output"]
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 9.0
    tex.inputs["Detail"].default_value = 5.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    # Only the top tail of the noise turns to bare metal, so roughly `amount` x 25% of the
    # paint is lost at a few edges rather than sprayed with holes. Mix input 1 is the PAINT
    # and input 2 the hole: wired the other way round this keeps the 8% and discards the 92%.
    ramp.color_ramp.elements[0].position = 0.80 - amount * 0.13
    ramp.color_ramp.elements[1].position = 0.825 - amount * 0.10
    nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(transp.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def reflect_strip(receivers, target_z: float = 0.0, x: float = -0.25, y: float = 0.35,
                  span: float = 620.0, irradiance: float = 2.2, width: float = 40.0):
    """The faint reflection strip a smoked window carries (§4).

    A real narrow source reflected in the glass — not a painted highlight. It is **light
    linked** to the panes only: left global, the same grazing streak lands on every gunmetal
    plate in the shot and turns matte anodised metal into the chrome gloss §5 bans.
    """
    light = _area("reflect", (span * x, span * y, target_z + span * 0.55),
                  irradiance, "#FFF4E2", width, span * 1.1)
    col = bpy.data.collections.new("reflect-receivers")
    bpy.context.scene.collection.children.link(col)
    for ob in (receivers if isinstance(receivers, (list, tuple)) else [receivers]):
        col.objects.link(ob)
    light.light_linking.receiver_collection = col
    return light


def assign(ob, mat, slot: int = None):
    if slot is None:
        ob.data.materials.clear()
        ob.data.materials.append(mat)
    else:
        while len(ob.data.materials) <= slot:
            ob.data.materials.append(None)
        ob.data.materials[slot] = mat
    return ob


# ---------------------------------------------------------------- output


def render(path: str):
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[render] {path}", file=sys.stderr)
    return path


def argv_after_dashes() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


# ---------------------------------------------------------------- material dressing
#
# The production GLBs are authored for the game's own renderer at the game's own distances.
# Two things need correcting before they carry a style frame:
#   * rock ships as a pale flat surface that reads as polystyrene under a still camera, and
#     rock is the one material the owner has ever praised (the Asteroid Works test);
#   * some kit props carry teal / nav-green accents, and the direction allows at most two
#     accent hues in view (§5, "not noisy").


def rockify(colour="#3A312A", roughness=0.88, bump=0.55, scale=2.4):
    """Give every Material_Rock a real rock surface: two-scale bump, darkened crevices.

    Bump rather than true displacement, so the ~2k-poly game rocks stay cheap; at these camera
    distances the difference is invisible, and the silhouette is already irregular because the
    pad is built from three separate rocks rather than one blob.
    """
    for mat in bpy.data.materials:
        if "rock" not in mat.name.lower() or not mat.use_nodes:
            continue
        nt = mat.node_tree
        p = nt.nodes.get("Principled BSDF")
        if not p:
            continue
        coord = nt.nodes.new("ShaderNodeTexCoord")
        coarse = nt.nodes.new("ShaderNodeTexNoise")
        coarse.inputs["Scale"].default_value = scale
        coarse.inputs["Detail"].default_value = 14.0
        coarse.inputs["Roughness"].default_value = 0.72
        nt.links.new(coord.outputs["Object"], coarse.inputs["Vector"])
        fine = nt.nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = scale * 9.0
        fine.inputs["Detail"].default_value = 10.0
        nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])

        # crevices: the coarse noise darkens the albedo so the form reads in shadow too
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.34
        ramp.color_ramp.elements[0].color = srgb("#18140F")
        ramp.color_ramp.elements[1].position = 0.70
        ramp.color_ramp.elements[1].color = srgb(colour)
        nt.links.new(coarse.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])

        b1 = nt.nodes.new("ShaderNodeBump")
        b1.inputs["Strength"].default_value = bump
        b1.inputs["Distance"].default_value = 0.45
        nt.links.new(coarse.outputs["Fac"], b1.inputs["Height"])
        b2 = nt.nodes.new("ShaderNodeBump")
        b2.inputs["Strength"].default_value = bump * 0.55
        b2.inputs["Distance"].default_value = 0.06
        nt.links.new(fine.outputs["Fac"], b2.inputs["Height"])
        nt.links.new(b1.outputs["Normal"], b2.inputs["Normal"])
        nt.links.new(b2.outputs["Normal"], p.inputs["Normal"])

        _set(p, "Roughness", roughness)
        _set(p, "Metallic", 0.0)
        _set(p, "Specular IOR Level", 0.28)


ACCENT_REMAP = {
    # off-direction hue -> the nearest thing the palette allows
    "frontiercyan": "#F2B950",
    "paintteal": "#3B3A34",
    "lightnavgreen": "#9BD8A0",
    "emissive_cyan": "#FFB347",
    "repairgreen": "#6E6A58",
}


def retint(strength: float = 1.0):
    """Pull teal / cyan / nav-green accents back into the two allowed hues."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        low = mat.name.lower().replace("material_", "")
        target = next((v for k, v in ACCENT_REMAP.items() if k in low), None)
        if not target:
            continue
        nt = mat.node_tree
        new = srgb(target)
        for node in nt.nodes:
            for sock in ("Base Color", "Color"):
                if sock not in node.inputs:
                    continue
                inp = node.inputs[sock]
                if inp.is_linked:
                    if strength >= 0.999:
                        for link in list(inp.links):
                            nt.links.remove(link)
                    else:
                        continue
                cur = inp.default_value
                inp.default_value = tuple(
                    cur[i] * (1 - strength) + new[i] * strength for i in range(3)) + (1.0,)


def starfield(count: int = 900, radius: float = 9000.0, seed: int = 4242,
              size: float = 7.0, colour: str = "#DDE6FF", strength: float = 9.0):
    """Real star geometry on a far shell. Deterministic from `seed` so a re-render matches.

    §5 allows distant background stars as the one camera-facing soft point in the direction,
    and only while tiny and at sky depth — hence the shell radius and the small quad size.
    """
    import random
    rng = random.Random(seed)
    mat = emissive("stars", colour, strength=strength)
    mesh = bpy.data.meshes.new("stars")
    verts, faces = [], []
    for _ in range(count):
        z = rng.uniform(-0.25, 1.0)
        a = rng.uniform(0, math.tau)
        r = math.sqrt(max(0.0, 1 - z * z))
        c = Vector((r * math.cos(a), r * math.sin(a), z)) * radius
        s = size * rng.uniform(0.4, 2.2)
        n = c.normalized()
        right = n.cross(Vector((0, 0, 1)))
        right = (right.normalized() if right.length > 1e-4 else Vector((1, 0, 0))) * s
        up = n.cross(right).normalized() * s
        i = len(verts)
        verts += [c - right - up, c + right - up, c + right + up, c - right + up]
        faces.append((i, i + 1, i + 2, i + 3))
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new("stars", mesh)
    bpy.context.collection.objects.link(ob)
    assign(ob, mat)
    ob.visible_shadow = False
    return ob

def rig_sheet(temp: str = "warm", key: float = 5.0, fill: float = 0.9, wash: float = 0.30,
              key_elev: float = 26.0, fill_elev: float = 34.0):
    """The rig for a **master sheet** — many assets rendered in one pass and cut by script.

    Area lights are position dependent: an asset at the far corner of a 2000 px sheet sees the
    key from a different angle than one at the centre, so its lit top edge lands in a different
    place and the cut assets do not match. SUN lights emit parallel rays and the world
    background is uniform, so every asset on the sheet is lit identically wherever it sits.

    `key_elev` is degrees above the plate plane: low is what makes the relieved edge read.
    """
    warm, cool = TEMPS.get(temp, TEMPS["warm"])

    def sun(name, irradiance, colour, azimuth_deg, elev_deg, angle=0.09):
        d = bpy.data.lights.new(name, type="SUN")
        d.energy = irradiance
        d.angle = angle
        d.color = srgb(colour)[:3]
        o = bpy.data.objects.new(name, d)
        az, el = math.radians(azimuth_deg), math.radians(elev_deg)
        direction = Vector((-math.cos(el) * math.cos(az), -math.cos(el) * math.sin(az),
                            -math.sin(el)))
        o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(o)
        return o

    k = sun("key", key, warm, 90.0, key_elev)        # from +Y, grazing: the lit top edge
    f = sun("fill", fill, cool, -104.0, fill_elev)   # from -Y, cool, weak: lifts the shadow
    world(strength=wash, colour="#3A3630")           # uniform ambient: lights every face alike
    return k, f

def emissive_halo(name: str, hex_colour: str, strength: float = 0.2, falloff: float = 2.2):
    """An emitter whose brightness falls off radially — the soft halo a status light carries.

    A status light is 12 px and has to bring its own glow: there is no post-process bloom in a
    PNG. `_chip_edges` cannot do this, because it reaches for a Principled BSDF and an emissive
    material does not have one.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = nt.nodes["Material Output"]

    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = srgb(hex_colour)
    em.inputs["Strength"].default_value = strength
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(transp.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])

    coord = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value = (0.5, 0.5, 0.0)
    mapping.inputs["Scale"].default_value = (2.0, 2.0, 2.0)
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    power = nt.nodes.new("ShaderNodeMath")
    power.operation = "POWER"
    power.inputs[1].default_value = falloff
    nt.links.new(grad.outputs["Fac"], power.inputs[0])
    nt.links.new(power.outputs["Value"], mix.inputs["Fac"])
    return mat

def recess_round(ob, diameter: float, depth: float, x: float = 0.0, y: float = 0.0,
                 bevel: float = 0.8, verts: int = 96):
    """A CIRCULAR well. `recess()` cuts with a box, which leaves a square well inside a round
    bezel — visible on the radar and the small dials, where the rim is the whole point."""
    bpy.ops.mesh.primitive_cylinder_add(radius=diameter / 2, depth=depth, vertices=verts,
                                        location=(0, 0, 0))
    knife = bpy.context.object
    knife.name = "round-knife"
    if bevel:
        m = knife.modifiers.new("b", "BEVEL")
        m.width, m.segments = bevel, 2
        bpy.context.view_layer.objects.active = knife
        bpy.ops.object.modifier_apply(modifier="b")
    bpy.context.view_layer.update()
    knife.location = ob.matrix_world @ Vector((x, y, top_local(ob) - depth / 2 + 0.002))
    b = ob.modifiers.new("recess-round", "BOOLEAN")
    b.operation, b.object, b.solver = "DIFFERENCE", knife, "EXACT"
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="recess-round")
    bpy.data.objects.remove(knife, do_unlink=True)
    return ob


# ---------------------------------------------------------------- S2 spatial chart helpers


def spatial_line(name, points, radius, material):
    """A thin, non-glowing three-dimensional etch between chart coordinates."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth, curve.bevel_resolution = radius, 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1)
    ob = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(ob)
    assign(ob, material)
    return ob


def chart_stars(camera, distance, count, size, strength, seed):
    """Tiny sky stars in a deterministic depth slab, with a calm central reading area.

    `size` is a fraction of depth, independent of slab distance. The scatter is built in
    the camera basis, so it is sky-depth geometry rather than a 2D noise texture.
    """
    import random
    rng = random.Random(seed)
    basis = camera.rotation_euler.to_matrix()
    verts, faces = [], []
    for _ in range(count):
        x, y = rng.uniform(-.43, .43), rng.uniform(-.25, .25)
        if (x / .055) ** 2 + (y / .045) ** 2 < 1:
            continue
        depth = distance * rng.uniform(.9, 1.1)
        center = camera.location + basis @ Vector((x * depth, y * depth, -depth))
        half = size * depth * rng.uniform(.25, .7)
        right, up = basis @ Vector((half, 0, 0)), basis @ Vector((0, half, 0))
        n = len(verts)
        verts.extend((center - right - up, center + right - up,
                      center + right + up, center - right + up))
        faces.append((n, n + 1, n + 2, n + 3))
    mesh = bpy.data.meshes.new("chart-stars-%s" % seed)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(ob)
    assign(ob, emissive(mesh.name, "#CDD4E2", strength))
    ob.visible_shadow = False
    return ob


def chart_dust(name, location, scale, colour, rotation=0.0):
    """A faint, bounded volume filament. Its container has no surface shader.

    Density fades to zero before the ellipsoid boundary; two noise scales break the cloud
    internally. No camera-facing nebula rectangle or luminous sphere surface is rendered.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1,
                                         location=location)
    ob = bpy.context.object
    ob.name, ob.scale = name, scale
    ob.rotation_euler.z = rotation
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    volume = nt.nodes.new("ShaderNodeVolumePrincipled")
    volume.inputs["Color"].default_value = srgb(colour)
    volume.inputs["Emission Color"].default_value = srgb(colour)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    center = nt.nodes.new("ShaderNodeVectorMath")
    center.operation = "SUBTRACT"
    center.inputs[1].default_value = (.5, .5, .5)
    nt.links.new(coord.outputs["Generated"], center.inputs[0])
    length = nt.nodes.new("ShaderNodeVectorMath")
    length.operation = "LENGTH"
    nt.links.new(center.outputs["Vector"], length.inputs[0])
    edge = nt.nodes.new("ShaderNodeMapRange")
    edge.inputs["From Min"].default_value = .15
    edge.inputs["From Max"].default_value = .46
    edge.inputs["To Min"].default_value = 1
    edge.inputs["To Max"].default_value = 0
    nt.links.new(length.outputs["Value"], edge.inputs["Value"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6
    noise.inputs["Detail"].default_value = 6
    noise.inputs["Roughness"].default_value = .7
    nt.links.new(coord.outputs["Generated"], noise.inputs["Vector"])
    structure = nt.nodes.new("ShaderNodeMapRange")
    structure.inputs["From Min"].default_value = .38
    structure.inputs["From Max"].default_value = .72
    structure.inputs["To Min"].default_value = 0
    structure.inputs["To Max"].default_value = .006
    nt.links.new(noise.outputs["Fac"], structure.inputs["Value"])
    density = nt.nodes.new("ShaderNodeMath")
    density.operation = "MULTIPLY"
    nt.links.new(edge.outputs["Result"], density.inputs[0])
    nt.links.new(structure.outputs["Result"], density.inputs[1])
    nt.links.new(density.outputs[0], volume.inputs["Density"])
    nt.links.new(density.outputs[0], volume.inputs["Emission Strength"])
    nt.links.new(volume.outputs["Volume"], out.inputs["Volume"])
    assign(ob, mat)
    return ob
