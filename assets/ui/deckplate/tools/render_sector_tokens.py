"""render_sector_tokens — the Chart's sector tokens: one rendered object per sector of the Reach.

The Chart (src/ui/galaxyMap.js, GALAXY level) draws every sector as a produced token instead of a coloured
ring. Each token is a small three-quarter view of what the sector IS — a belt, a hub station on its moon, a
gate junction, a forge moonlet, a volcanic moon, a nebula knot, an anomaly — under the Reach's one light:
a warm low sun from the left, a cool rim from behind. Transparent film, subject centred, ~80% of the frame.

A token is read at 48-80 css px on the chart, so every one is designed for SILHOUETTE first (a ring, a
disc with a ring, a knot, a split body), one warm key, one cool rim and a few emissive points; internal
detail is secondary.

    blender -b --factory-startup -P assets/ui/deckplate/tools/render_sector_tokens.py -- \
        <out_dir> [size=512] [samples=64] [ids=all]

writes <out_dir>/<sector id>.png (RGBA). finish: scripts or sharp downsample to 256 webp into
assets/ui/generated/chart/<sector id>.webp.

Deterministic: every scatter uses its own seeded random.Random; noise textures use fixed offsets.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Euler, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_DIR = argv[0] if len(argv) > 0 else os.path.join(os.getcwd(), ".devshots", "sector_tokens")
SIZE = int(argv[1]) if len(argv) > 1 else 512
SAMPLES = int(argv[2]) if len(argv) > 2 else 64
ONLY = set(argv[3].split(",")) if len(argv) > 3 and argv[3] not in ("", "all") else None
os.makedirs(OUT_DIR, exist_ok=True)

KEY_WARM = (1.0, 0.84, 0.66)
RIM_COOL = (0.56, 0.72, 1.0)


# ------------------------------------------------------------------------------------------ scene
def reset():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.textures, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def setup_scene(key=4.6, rim=7.0, fill=0.06, samples=None):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    # gas knots need more paths than rock (volume noise); a sector may ask for them
    scene.cycles.samples = max(SAMPLES, samples or 0)
    scene.cycles.use_denoising = True
    try:
        scene.cycles.device = "GPU"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = True
                    break
            except Exception:
                continue
        else:
            scene.cycles.device = "CPU"
    except Exception:
        scene.cycles.device = "CPU"
    scene.cycles.volume_step_rate = 2.0
    scene.cycles.max_bounces = 6
    scene.render.film_transparent = True
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.view_settings.view_transform = os.environ.get("TOKEN_VIEW", "AgX")
        for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
            try:
                scene.view_settings.look = look
                break
            except Exception:
                continue
    except Exception:
        pass
    # a faint cold fill so the shadow side keeps its shape (the film stays transparent)
    world = bpy.data.worlds.new("fill")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.35, 0.42, 0.6, 1)
    bg.inputs["Strength"].default_value = fill
    # the camera sees black (the fill still lights the scene): the second pass renders the token over black so
    # a glow keeps its colour (a near-transparent glow saved to straight-alpha PNG clips to white)
    wn, wl = world.node_tree.nodes, world.node_tree.links
    lp = wn.new("ShaderNodeLightPath")
    black = wn.new("ShaderNodeBackground")
    black.inputs["Color"].default_value = (0, 0, 0, 1)
    mix = wn.new("ShaderNodeMixShader")
    wl.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    wl.new(bg.outputs["Background"], mix.inputs[1])
    wl.new(black.outputs["Background"], mix.inputs[2])
    wl.new(mix.outputs["Shader"], world.node_tree.nodes.get("World Output").inputs["Surface"])
    # the camera: orthographic three-quarter view from above
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = 2.55
    cam.clip_start = 0.1
    cam.clip_end = 100
    cam_ob = bpy.data.objects.new("cam", cam)
    scene.collection.objects.link(cam_ob)
    scene.camera = cam_ob
    elev, azim = math.radians(34), math.radians(-38)
    d = 20
    cam_ob.location = (d * math.cos(elev) * math.sin(azim), -d * math.cos(elev) * math.cos(azim), d * math.sin(elev))
    cam_ob.rotation_euler = (Vector((0, 0, 0)) - cam_ob.location).to_track_quat("-Z", "Y").to_euler()
    sun("key", KEY_WARM, key, (-0.49, 0.68, 0.40))
    sun("rim", RIM_COOL, rim, (0.82, 0.10, 0.22))
    return scene, cam_ob


def sun(name, color, energy, from_dir, angle=2.0):
    light = bpy.data.lights.new(name, "SUN")
    light.color = color
    light.energy = energy
    light.angle = math.radians(angle)
    ob = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(ob)
    v = Vector(from_dir).normalized()
    ob.location = v * 10
    ob.rotation_euler = (-v).to_track_quat("-Z", "Y").to_euler()
    return ob


def link(ob):
    if ob.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(ob)
    return ob


# ------------------------------------------------------------------------------------------ materials
def nodes_mat(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return mat, nt, out


def rock_mat(name, dark=(0.10, 0.095, 0.09), light=(0.36, 0.33, 0.30), rough=0.9, metal=0.0, bump=0.5, emit=None, emit_col=(1.0, 0.45, 0.12), emit_strength=6.0, emit_scale=6.0, emit_thresh=0.06):
    """Rock / regolith: a tone ramp on noise, a crater bump; optional emissive fissures (voronoi cell edges)."""
    mat, nt, out = nodes_mat(name)
    L = nt.links
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 2.2
    noise.inputs["Detail"].default_value = 8.0
    L.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (*light, 1)
    L.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 5.0
    L.new(coord.outputs["Object"], vor.inputs["Vector"])
    grit = nt.nodes.new("ShaderNodeTexNoise")
    grit.inputs["Scale"].default_value = 18.0
    grit.inputs["Detail"].default_value = 6.0
    L.new(coord.outputs["Object"], grit.inputs["Vector"])
    hmix = nt.nodes.new("ShaderNodeMath")
    hmix.operation = "ADD"
    L.new(vor.outputs["Distance"], hmix.inputs[0])
    gmul = nt.nodes.new("ShaderNodeMath")
    gmul.operation = "MULTIPLY"
    gmul.inputs[1].default_value = 0.35
    L.new(grit.outputs["Fac"], gmul.inputs[0])
    L.new(gmul.outputs["Value"], hmix.inputs[1])
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = bump
    bmp.inputs["Distance"].default_value = 0.05
    L.new(hmix.outputs["Value"], bmp.inputs["Height"])
    L.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    if emit:
        # fissures: the edges of large voronoi cells glow
        ev = nt.nodes.new("ShaderNodeTexVoronoi")
        ev.feature = "DISTANCE_TO_EDGE"
        ev.inputs["Scale"].default_value = emit_scale
        warp = nt.nodes.new("ShaderNodeTexNoise")
        warp.inputs["Scale"].default_value = 3.0
        wadd = nt.nodes.new("ShaderNodeVectorMath")
        wadd.operation = "ADD"
        wsc = nt.nodes.new("ShaderNodeVectorMath")
        wsc.operation = "SCALE"
        wsc.inputs["Scale"].default_value = 0.25
        L.new(coord.outputs["Object"], warp.inputs["Vector"])
        L.new(warp.outputs["Color"], wsc.inputs[0])
        L.new(coord.outputs["Object"], wadd.inputs[0])
        L.new(wsc.outputs["Vector"], wadd.inputs[1])
        L.new(wadd.outputs["Vector"], ev.inputs["Vector"])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = emit_thresh
        mr.inputs["From Max"].default_value = 0.0
        L.new(ev.outputs["Distance"], mr.inputs["Value"])
        # a second noise mask keeps the glow to some regions only (a few vents, not a net)
        mask = nt.nodes.new("ShaderNodeTexNoise")
        mask.inputs["Scale"].default_value = 1.6
        L.new(coord.outputs["Object"], mask.inputs["Vector"])
        mmr = nt.nodes.new("ShaderNodeMapRange")
        mmr.inputs["From Min"].default_value = 0.45
        mmr.inputs["From Max"].default_value = 0.62
        L.new(mask.outputs["Fac"], mmr.inputs["Value"])
        mm = nt.nodes.new("ShaderNodeMath")
        mm.operation = "MULTIPLY"
        L.new(mr.outputs["Result"], mm.inputs[0])
        L.new(mmr.outputs["Result"], mm.inputs[1])
        es = nt.nodes.new("ShaderNodeMath")
        es.operation = "MULTIPLY"
        es.inputs[1].default_value = emit_strength
        L.new(mm.outputs["Value"], es.inputs[0])
        bsdf.inputs["Emission Color"].default_value = (*emit_col, 1)
        L.new(es.outputs["Value"], bsdf.inputs["Emission Strength"])
    L.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def flat_mat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, transmission=0.0, alpha=1.0, coat=0.0):
    mat, nt, out = nodes_mat(name)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["IOR"].default_value = 1.45
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def emission_mat(name, color, strength):
    mat, nt, out = nodes_mat(name)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def planet_mat(name, stops, band_scale=3.0, distortion=4.0, rough=0.8, emit=None, emit_strength=0.0, bands=False):
    """A world's surface: a colour ramp over noise (or bands), with optional emission on the brightest stop."""
    mat, nt, out = nodes_mat(name)
    L = nt.links
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    if bands:
        tex = nt.nodes.new("ShaderNodeTexWave")
        tex.wave_type = "BANDS"
        tex.bands_direction = "Z"
        tex.inputs["Scale"].default_value = band_scale
        tex.inputs["Distortion"].default_value = distortion
        tex.inputs["Detail"].default_value = 4.0
        fac = tex.outputs["Fac"]
    else:
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = band_scale
        tex.inputs["Detail"].default_value = 10.0
        tex.inputs["Distortion"].default_value = distortion * 0.1
        fac = tex.outputs["Fac"]
    L.new(coord.outputs["Object"], tex.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1)
    L.new(fac, ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    grit = nt.nodes.new("ShaderNodeTexNoise")
    grit.inputs["Scale"].default_value = 14.0
    grit.inputs["Detail"].default_value = 6.0
    L.new(coord.outputs["Object"], grit.inputs["Vector"])
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.25
    L.new(grit.outputs["Fac"], bmp.inputs["Height"])
    L.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    if emit:
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = emit[0]
        mr.inputs["From Max"].default_value = emit[1]
        L.new(fac, mr.inputs["Value"])
        es = nt.nodes.new("ShaderNodeMath")
        es.operation = "MULTIPLY"
        es.inputs[1].default_value = emit_strength
        L.new(mr.outputs["Result"], es.inputs[0])
        bsdf.inputs["Emission Color"].default_value = (*emit[2], 1)
        L.new(es.outputs["Value"], bsdf.inputs["Emission Strength"])
    L.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def gas_mat(name, color, emit_col, density=2.0, emit_strength=1.5, scale=2.5, falloff=0.9, anisotropy=0.2, fill=(0.42, 0.78)):
    """A gas knot: principled volume whose density is noise under a spherical falloff (soft edges)."""
    mat, nt, out = nodes_mat(name)
    L = nt.links
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*color, 1)
    vol.inputs["Emission Color"].default_value = (*emit_col, 1)
    vol.inputs["Anisotropy"].default_value = anisotropy
    # the knot glows rather than smokes: absorption would read as a dark smudge on the transparent film
    try:
        vol.inputs["Absorption Color"].default_value = (1, 1, 1, 1)
    except Exception:
        pass
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.62
    L.new(coord.outputs["Object"], noise.inputs["Vector"])
    nmr = nt.nodes.new("ShaderNodeMapRange")
    nmr.inputs["From Min"].default_value = fill[0]
    nmr.inputs["From Max"].default_value = fill[1]
    L.new(noise.outputs["Fac"], nmr.inputs["Value"])
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    L.new(coord.outputs["Object"], grad.inputs["Vector"])
    gp = nt.nodes.new("ShaderNodeMath")
    gp.operation = "POWER"
    gp.inputs[1].default_value = falloff
    L.new(grad.outputs["Fac"], gp.inputs[0])
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = "MULTIPLY"
    L.new(nmr.outputs["Result"], m.inputs[0])
    L.new(gp.outputs["Value"], m.inputs[1])
    d = nt.nodes.new("ShaderNodeMath")
    d.operation = "MULTIPLY"
    d.inputs[1].default_value = density
    L.new(m.outputs["Value"], d.inputs[0])
    L.new(d.outputs["Value"], vol.inputs["Density"])
    e = nt.nodes.new("ShaderNodeMath")
    e.operation = "MULTIPLY"
    e.inputs[1].default_value = emit_strength
    L.new(m.outputs["Value"], e.inputs[0])
    # the glow is its own volume emission added to the body (the principled volume's own emission rendered
    # nothing in this build: the knot read as grey scattered light)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*emit_col, 1)
    L.new(e.outputs["Value"], em.inputs["Strength"])
    add = nt.nodes.new("ShaderNodeAddShader")
    L.new(vol.outputs["Volume"], add.inputs[0])
    L.new(em.outputs["Emission"], add.inputs[1])
    L.new(add.outputs["Shader"], out.inputs["Volume"])
    return mat


# ------------------------------------------------------------------------------------------ objects
def rock(name, radius, loc=(0, 0, 0), squash=(1, 1, 0.8), detail=4, seed=0, mat=None, craters=True):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=radius, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = squash
    # a potato, not a pebble: a strong low-frequency lump, a faceting cell layer, then craters
    layers = [("CLOUDS", 0.9, 0.55), ("VORONOI_F", 0.45, 0.22), ("CLOUDS", 0.3, 0.12)]
    if craters:
        layers.append(("VORONOI", 0.22, 0.09))
    for i, (kind, size, strength) in enumerate(layers):
        tex = bpy.data.textures.new(f"{name}_d{i}", type="VORONOI" if kind.startswith("VORONOI") else kind)
        if kind == "VORONOI":
            tex.distance_metric = "DISTANCE_SQUARED"
            tex.noise_intensity = 1.0
        elif kind == "VORONOI_F":
            # cell edges as ridges: F2-F1 cut into planes gives the rock flat faces and edges
            tex.distance_metric = "DISTANCE"
            tex.weight_1 = -1.0
            tex.weight_2 = 1.0
            tex.noise_intensity = 1.0
        else:
            tex.noise_basis = "IMPROVED_PERLIN"
            tex.noise_depth = 2
        tex.noise_scale = size * radius
        mod = ob.modifiers.new(f"d{i}", "DISPLACE")
        mod.texture = tex
        mod.strength = strength * radius
        mod.texture_coords = "LOCAL"
        mod.mid_level = 0.5 if kind == "CLOUDS" else (0.1 if kind == "VORONOI_F" else 0.2)
    # every rock differs: the texture space is offset by its seed
    for m in ob.modifiers:
        m.texture_coords = "OBJECT"
    empty = bpy.data.objects.new(f"{name}_tx", None)
    link(empty)
    r = random.Random(seed)
    empty.location = (r.uniform(-50, 50), r.uniform(-50, 50), r.uniform(-50, 50))
    for m in ob.modifiers:
        m.texture_coords_object = empty
    if mat:
        ob.data.materials.append(mat)
    bpy.context.view_layer.update()
    # bake the shape so the rock can be instanced cheaply
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.objects.remove(empty, do_unlink=True)
    ob = bpy.data.objects.new(name, me)
    link(ob)
    ob.location = loc
    # smooth the lumps, keep the facet edges: shade by angle
    for p in ob.data.polygons:
        p.use_smooth = True
    try:
        ob.data.set_sharp_from_angle(angle=math.radians(38))
    except Exception:
        pass
    return ob


def rock_protos(prefix, mat, count=6, seed=1, detail=3):
    r = random.Random(seed)
    protos = []
    for i in range(count):
        ob = rock(f"{prefix}_proto{i}", 1.0, (0, 0, -99), squash=(1 + r.uniform(-.1, .5), 0.8 + r.uniform(-.2, .2), 0.5 + r.uniform(0, .35)), detail=detail, seed=seed * 100 + i, mat=mat)
        ob.hide_render = True
        protos.append(ob)
    return protos


def instance(proto, loc, scale, rot):
    ob = bpy.data.objects.new(proto.name + "_i", proto.data)
    link(ob)
    ob.location = loc
    ob.scale = (scale, scale, scale)
    ob.rotation_euler = rot
    return ob


def scatter_ring(protos, rng, count, r_in, r_out, z_sd, size, tilt=(0, 0, 0), arc=(0, 360), center=(0, 0, 0), size_pow=2.2):
    obs = []
    T = Euler(tilt).to_matrix()
    for _ in range(count):
        a = math.radians(rng.uniform(*arc))
        rr = rng.uniform(r_in, r_out)
        p = Vector((rr * math.cos(a), rr * math.sin(a), rng.gauss(0, z_sd)))
        p = T @ p + Vector(center)
        s = size[0] + (size[1] - size[0]) * (rng.random() ** size_pow)
        obs.append(instance(rng.choice(protos), p, s, (rng.random() * 6.3, rng.random() * 6.3, rng.random() * 6.3)))
    return obs


def scatter_cloud(protos, rng, count, radius, size, center=(0, 0, 0), squash=(1, 1, 0.55), size_pow=2.4):
    obs = []
    for _ in range(count):
        v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)))
        v.normalize()
        rr = radius * (rng.random() ** 0.6)
        p = Vector((v.x * rr * squash[0], v.y * rr * squash[1], v.z * rr * squash[2])) + Vector(center)
        s = size[0] + (size[1] - size[0]) * (rng.random() ** size_pow)
        obs.append(instance(rng.choice(protos), p, s, (rng.random() * 6.3, rng.random() * 6.3, rng.random() * 6.3)))
    return obs


def sphere(name, radius, loc=(0, 0, 0), mat=None, seg=96, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=radius, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    bpy.ops.object.shade_smooth()
    if mat:
        ob.data.materials.append(mat)
    return ob


def torus(name, major, minor, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, seg=128, minor_seg=24):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=seg, minor_segments=minor_seg, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    bpy.ops.object.shade_smooth()
    if mat:
        ob.data.materials.append(mat)
    return ob


def cyl(name, radius, depth, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, verts=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    if mat:
        ob.data.materials.append(mat)
    return ob


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    if mat:
        ob.data.materials.append(mat)
    return ob


def shard_mat(name, tint, glow=4.0):
    """A crystal shard: tinted, glossy, self-lit in its own colour (never clear glass: that renders white)."""
    # AgX rolls bright saturated light off to white: keep the glow near 1.5-2.5 so the shard stays its colour
    # saturate the tint (AgX pales a light colour): push the weakest channel down before it becomes the glow
    lo = min(tint)
    sat = tuple(max(0.0, (c - lo * 0.8)) / max(1e-3, max(tint) - lo * 0.8) for c in tint)
    return flat_mat(name, tuple(c * 0.55 for c in sat), rough=0.3, metal=0.0, emit=sat, emit_strength=min(glow, 1.0) * 0.8, coat=0.4)


def crystal(name, loc, length, width, rot, mat):
    # a gem: two six-sided points of near-equal length meeting at the widest ring (never a rocket)
    width = max(width, length * 0.28)
    R = Euler(rot).to_matrix()
    up = R @ Vector((0, 0, 1))
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=width, radius2=0.0, depth=length * 0.55, location=tuple(Vector(loc) + up * length * 0.275), rotation=rot)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=width, radius2=0.0, depth=length * 0.45, location=tuple(Vector(loc) - up * length * 0.225), rotation=(R @ Euler((math.pi, 0, 0)).to_matrix()).to_euler())
    b = bpy.context.active_object
    b.data.materials.append(mat)
    return ob


def crystals(prefix, rng, count, center, radius, mat, length=(0.08, 0.22)):
    for i in range(count):
        v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 0.6))).normalized() * radius * (0.55 + 0.45 * rng.random())
        crystal(f"{prefix}{i}", tuple(Vector(center) + v), rng.uniform(*length), rng.uniform(0.02, 0.045), (rng.random() * 3, rng.random() * 3, rng.random() * 3), mat)


def lights_along(prefix, points, radius, mat):
    for i, p in enumerate(points):
        sphere(f"{prefix}{i}", radius, p, mat, seg=12)


def gas(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.0, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = scale
    ob.data.materials.append(mat)
    return ob


def station_ring(prefix, center, major, tilt, metal, win, spokes=4, lights=36, rng=None):
    """A hub station: a thick torus hull with lit windows round its rim, spokes to a central hub."""
    T = Euler(tilt)
    torus(f"{prefix}_ring", major, major * 0.11, center, tilt, metal, seg=96, minor_seg=16)
    torus(f"{prefix}_ring2", major * 0.9, major * 0.035, center, tilt, metal, seg=96, minor_seg=10)
    hub = cyl(f"{prefix}_hub", major * 0.22, major * 0.5, center, tilt, metal)
    for i in range(spokes):
        a = i * 2 * math.pi / spokes + 0.3
        mid = Vector((math.cos(a) * major * 0.55, math.sin(a) * major * 0.55, 0))
        mid.rotate(T)
        c = cyl(f"{prefix}_spoke{i}", major * 0.03, major * 0.78, tuple(Vector(center) + mid), (0, math.pi / 2, a), metal, verts=10)
        c.rotation_euler = (T.to_matrix() @ Euler((0, math.pi / 2, a)).to_matrix()).to_euler()
    for i in range(lights):
        a = i * 2 * math.pi / lights + (rng.random() * 0.05 if rng else 0)
        p = Vector((math.cos(a) * major * 1.1, math.sin(a) * major * 1.1, 0))
        p.rotate(T)
        if rng and rng.random() < 0.25:
            continue
        sphere(f"{prefix}_win{i}", major * 0.022, tuple(Vector(center) + p), win, seg=10)
    return hub


def gate(prefix, center, major, tilt, metal, throat_col, strength=6.0, throat=True):
    """A jump gate: a heavy ring with four clamps and a glowing throat (or, idle, a thin lit inner rim)."""
    torus(f"{prefix}_ring", major, major * 0.12, center, tilt, metal, seg=96, minor_seg=18)
    T = Euler(tilt)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        p = Vector((math.cos(a) * major, math.sin(a) * major, 0))
        p.rotate(T)
        b = box(f"{prefix}_clamp{i}", (major * 0.28, major * 0.2, major * 0.34), tuple(Vector(center) + p), (0, 0, a), metal)
        b.rotation_euler = (T.to_matrix() @ Euler((0, 0, a)).to_matrix()).to_euler()
    torus(f"{prefix}_rim", major * 0.86, major * 0.018, center, tilt, emission_mat(f"{prefix}_rimlight", throat_col, 12.0), seg=96, minor_seg=8)
    if not throat:
        return
    # the throat: a disc whose emission falls off from the centre
    mat, nt, out = nodes_mat(f"{prefix}_throat")
    L = nt.links
    coord = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "QUADRATIC_SPHERE"
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0 / (major * 0.95), 1.0 / (major * 0.95), 1.0)
    L.new(coord.outputs["Object"], mp.inputs["Vector"])
    L.new(mp.outputs["Vector"], grad.inputs["Vector"])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*throat_col, 1)
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = strength
    L.new(grad.outputs["Fac"], mul.inputs[0])
    L.new(mul.outputs["Value"], em.inputs["Strength"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    L.new(grad.outputs["Fac"], mix.inputs["Fac"])
    L.new(tr.outputs["BSDF"], mix.inputs[1])
    L.new(em.outputs["Emission"], mix.inputs[2])
    L.new(mix.outputs["Shader"], out.inputs["Surface"])
    cyl(f"{prefix}_throat", major * 0.95, 0.002, center, tilt, mat, verts=96)


# ------------------------------------------------------------------------------------------ palettes
def M():
    return {
        "metal": flat_mat("metal", (0.22, 0.22, 0.23), rough=0.55, metal=0.85),
        "hull": flat_mat("hull", (0.46, 0.44, 0.41), rough=0.6, metal=0.5),
        "win": emission_mat("win", (1.0, 0.82, 0.55), 18.0),
        "nav": emission_mat("nav", (0.75, 0.88, 1.0), 20.0),
        "rock": rock_mat("rock", dark=(0.06, 0.058, 0.056), light=(0.34, 0.32, 0.30)),
        "rock_warm": rock_mat("rock_warm", dark=(0.09, 0.08, 0.07), light=(0.50, 0.44, 0.38)),
        "ice": rock_mat("ice", dark=(0.14, 0.17, 0.22), light=(0.52, 0.6, 0.68), rough=0.3, bump=0.45),
        "dark_ice": rock_mat("dark_ice", dark=(0.05, 0.06, 0.08), light=(0.24, 0.28, 0.34), rough=0.72, bump=0.45),
        "ore": rock_mat("ore", dark=(0.14, 0.13, 0.13), light=(0.42, 0.40, 0.38), rough=0.4, metal=0.7),
    }


# ------------------------------------------------------------------------------------------ sectors
def hub_station(prefix, c, scale, m, rng):
    """A spindle station: a tall core, two habitat rings, docking arms with lit tips, windows round every ring."""
    c = Vector(c)
    cyl(f"{prefix}_core", 0.07 * scale, 0.95 * scale, tuple(c), (0, 0, 0), m["hull"], verts=24)
    cyl(f"{prefix}_cap", 0.12 * scale, 0.1 * scale, tuple(c + Vector((0, 0, 0.5 * scale))), (0, 0, 0), m["metal"], verts=24)
    cyl(f"{prefix}_foot", 0.1 * scale, 0.14 * scale, tuple(c - Vector((0, 0, 0.46 * scale))), (0, 0, 0), m["metal"], verts=24)
    for j, (z, r) in enumerate(((0.16, 0.42), (-0.14, 0.34))):
        at = c + Vector((0, 0, z * scale))
        torus(f"{prefix}_hab{j}", r * scale, 0.055 * scale, tuple(at), (0, 0, 0), m["hull"], seg=96, minor_seg=16)
        for k in range(4):
            a = k * math.pi / 2 + j * 0.4
            sp = cyl(f"{prefix}_sp{j}{k}", 0.012 * scale, r * scale, tuple(at + Vector((math.cos(a), math.sin(a), 0)) * r * scale * 0.5), (0, math.pi / 2, a), m["metal"], verts=8)
        n = 44
        for k in range(n):
            if rng.random() < 0.3:
                continue
            a = k * 2 * math.pi / n
            sphere(f"{prefix}_w{j}{k}", 0.012 * scale, tuple(at + Vector((math.cos(a) * r * scale * 1.06, math.sin(a) * r * scale * 1.06, 0.03 * scale))), m["win"], seg=8)
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.5
        d = Vector((math.cos(a), math.sin(a), 0))
        arm = cyl(f"{prefix}_arm{k}", 0.014 * scale, 0.36 * scale, tuple(c + d * 0.2 * scale + Vector((0, 0, 0.36 * scale))), (0, math.pi / 2, a), m["metal"], verts=8)
        sphere(f"{prefix}_tip{k}", 0.02 * scale, tuple(c + d * 0.38 * scale + Vector((0, 0, 0.36 * scale))), m["nav"], seg=10)


def s_helios_prime(m):
    rng = random.Random(11)
    moon = sphere("moon", 0.5, (-0.34, 0.34, -0.12), rock_mat("moonrock", dark=(0.10, 0.085, 0.07), light=(0.46, 0.40, 0.33), rough=0.9, bump=0.45))
    hub_station("st", (0.2, -0.18, 0.05), 1.05, m, rng)
    protos = rock_protos("hp", m["ore"], 4, 5)
    scatter_cloud(protos, rng, 9, 1.0, (0.03, 0.07), center=(0, 0, 0), squash=(1, 1, 0.4))


def s_ceres_belt(m):
    rng = random.Random(21)
    protos = rock_protos("cb", m["rock_warm"], 8, 2)
    scatter_ring(protos, rng, 240, 0.6, 1.0, 0.045, (0.01, 0.1), tilt=(math.radians(12), 0, 0), size_pow=3.2)
    d = gas("dust", (0, 0, 0), (1.05, 1.05, 0.12), gas_mat("dust", (1.0, 0.8, 0.6), (1.0, 0.62, 0.32), density=0.35, emit_strength=0.9, scale=3.0, falloff=0.6))
    d.rotation_euler = (math.radians(12), 0, 0)
    cyl("st", 0.035, 0.08, (0.72, -0.3, 0.05), (0.4, 0, 0), m["hull"])
    sphere("stlight", 0.02, (0.72, -0.3, 0.1), m["win"], seg=10)


def s_tethys_junction(m):
    gate("g0", (0, 0, 0.05), 0.55, (math.radians(70), 0, math.radians(-25)), m["metal"], (0.45, 0.7, 1.0), strength=2.6)
    rng = random.Random(31)
    for i, (x, y, z) in enumerate([(-0.85, 0.35, -0.1), (0.85, 0.3, -0.05), (-0.5, -0.75, 0.0), (0.55, -0.72, 0.05), (0.0, 0.9, -0.15)]):
        gate(f"g{i+1}", (x, y, z), 0.15, (math.radians(70), 0, math.radians(-25 + rng.uniform(-20, 20))), m["metal"], (0.45, 0.7, 1.0), throat=False)
        # a truss from the hub gate to this one
        v = Vector((x, y, z - 0.05))
        c = cyl(f"arm{i}", 0.012, v.length * 0.62, tuple(Vector((0, 0, 0.05)) + v * 0.55), (0, 0, 0), m["hull"], verts=8)
        c.rotation_euler = v.to_track_quat("Z", "Y").to_euler()
        # the arm and a line of traffic lights from the throat to the small gate
        n = 7
        lights_along(f"tl{i}", [(x * (k + 1) / (n + 1), y * (k + 1) / (n + 1), 0.05 + z * (k + 1) / (n + 1)) for k in range(n)], 0.012, m["nav"])


def s_vesta_forge(m):
    rng = random.Random(41)
    forge = rock_mat("forge", dark=(0.12, 0.11, 0.1), light=(0.44, 0.42, 0.4), rough=0.45, metal=0.6, emit=True, emit_col=(1.0, 0.42, 0.1), emit_strength=16.0, emit_scale=5.0, emit_thresh=0.05)
    rock("body", 0.66, (0, 0, 0), squash=(1.2, 0.95, 0.8), detail=6, seed=7, mat=forge)
    for i in range(7):
        a = rng.uniform(0, 6.28)
        p = Vector((math.cos(a) * 0.55, math.sin(a) * 0.45, 0.38 + rng.uniform(0, 0.1)))
        c = cyl(f"chim{i}", 0.035, rng.uniform(0.2, 0.34), tuple(p), (rng.uniform(-.3, .3), rng.uniform(-.3, .3), 0), m["metal"], verts=10)
        sphere(f"chl{i}", 0.03, tuple(p + Vector((0, 0, 0.18))), emission_mat(f"ember{i}", (1.0, 0.5, 0.15), 22.0), seg=10)
    crystals("cr", rng, 5, (0, 0, 0), 1.0, shard_mat("shard", (0.4, 1.0, 0.55), 5.0), (0.12, 0.24))
    gas("haze", (0, 0, 0), (1.15, 1.0, 0.8), gas_mat("haze", (0.5, 1.0, 0.6), (0.35, 1.0, 0.45), density=0.35, emit_strength=1.2, scale=2.2, falloff=1.4))


def s_pallas_drift(m):
    rng = random.Random(51)
    protos = rock_protos("pdi", m["ice"], 4, 8) + rock_protos("pdm", m["ore"], 3, 9)
    scatter_cloud(protos, rng, 34, 0.85, (0.04, 0.22), squash=(1.2, 0.9, 0.55))
    gas("wisp", (0.1, 0.05, -0.05), (1.2, 0.8, 0.45), gas_mat("wisp", (0.3, 0.3, 0.85), (0.42, 0.4, 1.0), density=1.0, emit_strength=2.0, scale=1.8))


def s_io_reach(m):
    rng = random.Random(61)
    io = rock_mat("io", dark=(0.30, 0.20, 0.04), light=(0.78, 0.66, 0.20), rough=0.85, bump=0.35, emit=True, emit_col=(1.0, 0.32, 0.04), emit_strength=26.0, emit_scale=2.6, emit_thresh=0.05)
    moon = sphere("io", 0.66, (0, 0, 0), io)
    # calderas: dark scorched spots on the sulphur (a second, dark sphere shell would z-fight; use a voronoi decal)
    nt = io.node_tree
    bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
    ramp = [n for n in nt.nodes if n.type == "VALTORGB"][0]
    coord = [n for n in nt.nodes if n.type == "TEX_COORD"][0]
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 3.4
    nt.links.new(coord.outputs["Object"], vor.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.12
    mr.inputs["From Max"].default_value = 0.2
    nt.links.new(vor.outputs["Distance"], mr.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    nt.links.new(mr.outputs["Result"], mix.inputs["Factor"])
    mix.inputs[6].default_value = (1, 1, 1, 1)
    nt.links.new(ramp.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = (0.12, 0.05, 0.02, 1)
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(mr.outputs["Result"], inv.inputs[1])
    nt.links.new(inv.outputs["Value"], mix.inputs["Factor"])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    crystals("cr", rng, 6, (0, 0, 0), 0.98, shard_mat("pale", (1.0, 0.85, 0.5), 3.0), (0.1, 0.18))
    gas("haze", (0, 0, 0), (0.95, 0.95, 0.95), gas_mat("amber", (1.0, 0.75, 0.35), (1.0, 0.6, 0.2), density=0.35, emit_strength=0.4, scale=2.0, falloff=1.6))


def s_charon_expanse(m):
    rng = random.Random(71)
    rock("moon", 0.62, (0, 0.05, 0), squash=(1, 1, 0.95), detail=6, seed=17, mat=m["dark_ice"])
    crystals("cr", rng, 12, (0, 0, 0), 1.02, shard_mat("violet", (0.72, 0.4, 1.0), 9.0), (0.12, 0.26))
    protos = rock_protos("ch", m["dark_ice"], 3, 12)
    scatter_ring(protos, rng, 26, 0.75, 1.0, 0.08, (0.02, 0.06), tilt=(math.radians(14), 0, 0))


def s_sker_haven(m):
    rng = random.Random(81)
    protos = rock_protos("sk", m["rock"], 6, 14)
    scatter_cloud(protos, rng, 22, 0.95, (0.07, 0.26), squash=(1.1, 1, 0.6))
    # the haven: patched modules bolted together, lights leaking
    for i in range(9):
        p = (rng.uniform(-0.18, 0.18), rng.uniform(-0.15, 0.15), rng.uniform(-0.08, 0.1))
        box(f"mod{i}", (rng.uniform(.14, .3), rng.uniform(.1, .2), rng.uniform(.08, .14)), p, (rng.uniform(-.4, .4), rng.uniform(-.4, .4), rng.uniform(0, 3)), m["hull"])
    for i in range(10):
        sphere(f"lw{i}", 0.014, (rng.uniform(-0.22, 0.22), rng.uniform(-0.2, 0.2), rng.uniform(0.0, 0.14)), m["win"], seg=10)
    crystals("cr", rng, 6, (0, 0, 0), 0.9, shard_mat("glint", (0.72, 0.4, 1.0), 9.0), (0.08, 0.16))


def s_veil_nebula(m):
    gas("knot", (0, 0, 0), (1.05, 0.95, 0.8), gas_mat("veil", (0.03, 0.3, 0.36), (0.0, 0.62, 0.74), density=2.2, emit_strength=4.5, scale=1.6, falloff=0.7, fill=(0.3, 0.72)))
    gas("fil", (0.25, -0.1, 0.1), (0.7, 0.35, 0.3), gas_mat("fil", (0.04, 0.2, 0.5), (0.08, 0.4, 1.0), density=1.6, emit_strength=5.0, scale=3.5, fill=(0.35, 0.72)))
    sphere("st", 0.025, (-0.05, 0.05, 0.08), m["win"], seg=12)


def s_ashfall_reach(m):
    rng = random.Random(91)
    ash = rock_mat("ash", dark=(0.04, 0.035, 0.03), light=(0.2, 0.17, 0.14), rough=0.95, emit=True, emit_col=(1.0, 0.35, 0.08), emit_strength=7.0, emit_scale=3.0, emit_thresh=0.011)
    protos = rock_protos("as", ash, 6, 18)
    scatter_cloud(protos, rng, 30, 0.9, (0.05, 0.3), squash=(1.2, 1, 0.55))
    ember = emission_mat("ember", (1.0, 0.45, 0.12), 25.0)
    for i in range(26):
        v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 0.5))).normalized() * rng.uniform(0.2, 1.0)
        sphere(f"em{i}", rng.uniform(0.006, 0.014), tuple(v), ember, seg=8)
    gas("ashhaze", (0, 0, 0), (1.1, 1.0, 0.6), gas_mat("ashhaze", (0.6, 0.45, 0.35), (0.9, 0.35, 0.1), density=0.9, emit_strength=0.35, scale=2.5))


def s_nyx_march(m):
    rng = random.Random(101)
    protos = rock_protos("nx", m["dark_ice"], 5, 20)
    scatter_cloud(protos, rng, 14, 0.9, (0.05, 0.2), squash=(1.2, 0.9, 0.5), size_pow=1.6)
    gas("veil", (0, 0, 0), (1.1, 1.0, 0.6), gas_mat("violet", (0.35, 0.2, 0.75), (0.5, 0.28, 0.95), density=1.1, emit_strength=2.2, scale=1.7))


def s_hyperion_cut(m):
    rng = random.Random(111)
    shard = shard_mat("hshard", (0.6, 0.8, 1.0), 4.0)
    protos = rock_protos("hy", m["ore"], 6, 22)
    scatter_ring(protos, rng, 120, 0.7, 0.95, 0.04, (0.03, 0.14), tilt=(math.radians(58), 0, math.radians(-30)), arc=(-40, 200), size_pow=1.8)
    for i in range(10):
        a = math.radians(rng.uniform(-40, 200))
        p = Vector((0.82 * math.cos(a), 0.82 * math.sin(a), 0))
        p.rotate(Euler((math.radians(58), 0, math.radians(-30))))
        crystal(f"hc{i}", tuple(p), rng.uniform(0.08, 0.18), 0.03, (rng.random() * 3, rng.random() * 3, 0), shard)


def s_kepler_scar(m):
    rng = random.Random(121)
    rk = rock_mat("kp", dark=(0.1, 0.1, 0.09), light=(0.4, 0.38, 0.34))
    a = rock("halfA", 0.48, (-0.36, 0.1, 0.02), squash=(0.7, 1, 0.9), detail=6, seed=31, mat=rk)
    b = rock("halfB", 0.44, (0.38, -0.12, -0.02), squash=(0.68, 1, 0.9), detail=6, seed=32, mat=rk)
    a.rotation_euler = (0, 0, 0.25)
    b.rotation_euler = (0, 0, 0.25)
    sphere("scarglow", 0.2, (0.02, -0.01, 0.0), emission_mat("green", (0.4, 1.0, 0.45), 16.0), seg=24, scale=(0.3, 1.7, 1.4))
    protos = rock_protos("kd", rk, 5, 24)
    scatter_ring(protos, rng, 70, 0.72, 1.0, 0.05, (0.02, 0.07), tilt=(math.radians(16), 0, 0))
    gas("rad", (0, 0, 0), (0.9, 0.9, 0.8), gas_mat("rad", (0.45, 1.0, 0.5), (0.35, 1.0, 0.4), density=0.4, emit_strength=0.7, scale=2.4, falloff=1.4))


def s_orcus_shadow(m):
    sphere("hole", 0.42, (0, 0, 0), flat_mat("black", (0.0, 0.0, 0.0), rough=1.0))
    # the lensing halo: a thin bright ring seen almost face-on, a wider soft one, and bent starlight arcs
    cam_tilt = (math.radians(56), 0, math.radians(-38))
    torus("halo", 0.5, 0.012, (0, 0, 0), cam_tilt, emission_mat("halo", (0.95, 0.9, 1.0), 26.0), seg=128, minor_seg=8)
    torus("halo2", 0.58, 0.004, (0, 0, 0), cam_tilt, emission_mat("halo2", (0.7, 0.8, 1.0), 14.0), seg=128, minor_seg=6)
    gas("glow", (0, 0, 0), (0.75, 0.75, 0.75), gas_mat("lens", (0.8, 0.8, 1.0), (0.7, 0.75, 1.0), density=0.3, emit_strength=1.4, scale=1.2, falloff=2.2))
    gas("wisp", (0.45, -0.2, -0.1), (0.8, 0.35, 0.25), gas_mat("wisp", (0.6, 0.5, 0.9), (0.5, 0.4, 0.9), density=1.0, emit_strength=1.0, scale=2.4))


def s_rhea_cinder(m):
    rng = random.Random(141)
    cinder = rock_mat("cinder", dark=(0.03, 0.028, 0.026), light=(0.13, 0.12, 0.115), rough=0.9, emit=True, emit_col=(1.0, 0.18, 0.05), emit_strength=22.0, emit_scale=3.5, emit_thresh=0.03)
    rock("moon", 0.62, (0, 0, 0), squash=(1, 1, 0.94), detail=6, seed=41, mat=cinder)
    protos = rock_protos("rd", m["ore"], 3, 26)
    scatter_cloud(protos, rng, 7, 0.98, (0.03, 0.07), squash=(1, 1, 0.4))


def s_haumea_rift(m):
    rng = random.Random(151)
    rock("dwarf", 0.5, (0, 0, 0), squash=(1.55, 0.85, 0.75), detail=6, seed=51, mat=m["ice"])
    rift = torus("rift", 0.4, 0.028, (0.05, 0, 0), (0, math.pi / 2, 0), emission_mat("rift", (0.45, 0.75, 1.0), 22.0), seg=64, minor_seg=10)
    rift.scale = (0.95, 1.08, 1.0)
    crystals("cr", rng, 9, (0, 0, 0), 1.0, shard_mat("ishard", (0.5, 0.8, 1.0), 6.0), (0.1, 0.22))


def s_eris_margin(m):
    rock("dwarf", 0.44, (-0.25, 0.1, 0.0), squash=(1, 1, 0.97), detail=6, seed=61, mat=rock_mat("pale", dark=(0.5, 0.52, 0.56), light=(0.86, 0.88, 0.9), rough=0.5, bump=0.25))
    gas("veil", (0.35, -0.12, -0.05), (0.9, 0.45, 0.35), gas_mat("greyblue", (0.4, 0.5, 0.75), (0.45, 0.58, 0.9), density=1.0, emit_strength=2.2, scale=1.9))


def s_phoebe_echo(m):
    rng = random.Random(171)
    protos = rock_protos("pe", m["rock"], 5, 28)
    for k, r in enumerate((0.42, 0.66, 0.9)):
        scatter_ring(protos, rng, 45 + k * 20, r - 0.03, r + 0.03, 0.015, (0.015, 0.05), tilt=(math.radians(18), 0, 0))
    sphere("core", 0.14, (0, 0, 0), emission_mat("core", (0.7, 0.45, 1.0), 14.0), seg=32)
    gas("coreglow", (0, 0, 0), (0.5, 0.5, 0.45), gas_mat("cg", (0.7, 0.5, 1.0), (0.65, 0.4, 1.0), density=0.6, emit_strength=2.0, scale=2.0, falloff=1.8))


def s_nereid_shoal(m):
    rng = random.Random(181)
    protos = rock_protos("nsi", m["ice"], 4, 30) + rock_protos("nsr", m["rock"], 3, 31)
    scatter_cloud(protos, rng, 70, 0.9, (0.02, 0.11), squash=(1.2, 1, 0.45), size_pow=2.0)
    for j, c in enumerate([(-0.3, 0.2, 0.08), (0.35, -0.25, 0.05)]):
        cyl(f"st{j}", 0.045, 0.12, c, (0.3, 0.2, 0), m["hull"], verts=12)
        torus(f"str{j}", 0.07, 0.012, c, (0.3, 0.2, 0), m["hull"], seg=32, minor_seg=8)
        sphere(f"stl{j}", 0.018, (c[0], c[1], c[2] + 0.08), m["win"], seg=10)


def s_proteus_well(m):
    rng = random.Random(191)
    sphere("planet", 0.4, (0, 0, 0), planet_mat("dark", [(0.0, (0.02, 0.02, 0.025)), (1.0, (0.08, 0.075, 0.08))], band_scale=4.0, distortion=4.0, bands=True))
    # the accretion ring: a flat annulus whose emission is hottest at its inner edge
    mat, nt, out = nodes_mat("accretion")
    L = nt.links
    coord = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 0.98, 1 / 0.98, 1)
    L.new(coord.outputs["Object"], mp.inputs["Vector"])
    L.new(mp.outputs["Vector"], grad.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    L.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.55
    ramp.color_ramp.elements[1].color = (1.0, 0.62, 0.25, 1)
    L.new(grad.outputs["Fac"], ramp.inputs["Fac"])
    em = nt.nodes.new("ShaderNodeEmission")
    L.new(ramp.outputs["Color"], em.inputs["Color"])
    ms = nt.nodes.new("ShaderNodeMath")
    ms.operation = "MULTIPLY"
    ms.inputs[1].default_value = 9.0
    L.new(noise.outputs["Fac"], ms.inputs[0])
    L.new(ms.outputs["Value"], em.inputs["Strength"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    L.new(grad.outputs["Fac"], mix.inputs["Fac"])
    L.new(tr.outputs["BSDF"], mix.inputs[1])
    L.new(em.outputs["Emission"], mix.inputs[2])
    L.new(mix.outputs["Shader"], out.inputs["Surface"])
    torus("disc", 0.7, 0.26, (0, 0, 0), (math.radians(14), 0, 0), mat, seg=128, minor_seg=12).scale = (1, 1, 0.03)
    crystals("cr", rng, 7, (0, 0, 0), 1.0, shard_mat("pshard", (1.0, 0.7, 0.4), 6.0), (0.08, 0.16))


def s_triton_wake(m):
    rock("body", 0.3, (-0.45, 0.25, 0.05), squash=(1.1, 1, 0.9), detail=6, seed=71, mat=m["ice"])
    # the wake streams away from the sun (to the right, back)
    gas("coma", (-0.45, 0.25, 0.05), (0.42, 0.42, 0.4), gas_mat("coma", (0.6, 0.8, 1.0), (0.5, 0.75, 1.0), density=0.6, emit_strength=2.6, scale=2.0, falloff=1.4))
    w = gas("wake", (0.25, -0.18, 0.0), (0.95, 0.24, 0.2), gas_mat("wake", (0.3, 0.55, 1.0), (0.4, 0.7, 1.0), density=1.1, emit_strength=3.0, scale=2.8, falloff=0.9))
    w.rotation_euler = (0, 0, math.radians(-32))


def s_eunomia_gulf(m):
    rng = random.Random(211)
    glow = rock_mat("exotic", dark=(0.1, 0.09, 0.12), light=(0.3, 0.26, 0.34), rough=0.5, metal=0.4, emit=True, emit_col=(0.75, 0.45, 1.0), emit_strength=14.0, emit_scale=4.0, emit_thresh=0.05)
    for i, (p, r) in enumerate([((-0.45, 0.3, 0.05), 0.2), ((0.4, 0.1, -0.05), 0.15), ((0.0, -0.5, 0.0), 0.12), ((0.62, -0.5, 0.1), 0.07)]):
        rock(f"ex{i}", r, p, squash=(1.2, 0.9, 0.8), detail=5, seed=80 + i, mat=glow)
    protos = rock_protos("eg", m["rock"], 3, 33)
    scatter_cloud(protos, rng, 14, 1.0, (0.01, 0.035), squash=(1.2, 1, 0.5))


def s_sedna_dark(m):
    rng = random.Random(221)
    body = rock_mat("sedna", dark=(0.02, 0.018, 0.018), light=(0.08, 0.07, 0.07), rough=0.45, bump=0.4)
    rock("body", 0.64, (0, 0, 0), squash=(1, 1, 0.94), detail=6, seed=91, mat=body)
    glint = emission_mat("glint", (0.65, 0.85, 1.0), 30.0)
    for i in range(9):
        v = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
        if v.dot(Vector((-0.49, 0.68, 0.40)).normalized()) < -0.2:
            continue
        sphere(f"gl{i}", rng.uniform(0.008, 0.016), tuple(v * 0.6), glint, seg=8)


def s_dione_lane(m):
    sphere("moon", 0.5, (-0.25, 0.2, -0.05), rock_mat("dione", dark=(0.2, 0.2, 0.21), light=(0.55, 0.55, 0.54), rough=0.8, bump=0.55))
    rng = random.Random(231)
    hub_station("st", (0.46, -0.28, 0.08), 0.62, m, rng)
    # the lane: a straight line of traffic lights passing the moon
    n = 24
    lights_along("lane", [(-1.0 + 2.0 * k / (n - 1), 0.62 - 1.24 * k / (n - 1), 0.28) for k in range(n)], 0.012, m["nav"])


SECTORS = {
    "sector_helios_prime": (s_helios_prime, {}),
    "sector_ceres_belt": (s_ceres_belt, {}),
    "sector_tethys_junction": (s_tethys_junction, {}),
    "sector_vesta_forge": (s_vesta_forge, {}),
    "sector_pallas_drift": (s_pallas_drift, {"samples": 192}),
    "sector_io_reach": (s_io_reach, {}),
    "sector_charon_expanse": (s_charon_expanse, {}),
    "sector_sker_haven": (s_sker_haven, {}),
    "sector_veil_nebula": (s_veil_nebula, {"key": 2.0, "samples": 192}),
    "sector_ashfall_reach": (s_ashfall_reach, {}),
    "sector_nyx_march": (s_nyx_march, {"key": 2.6, "samples": 192}),
    "sector_hyperion_cut": (s_hyperion_cut, {}),
    "sector_kepler_scar": (s_kepler_scar, {}),
    "sector_orcus_shadow": (s_orcus_shadow, {"key": 2.0}),
    "sector_rhea_cinder": (s_rhea_cinder, {}),
    "sector_haumea_rift": (s_haumea_rift, {}),
    "sector_eris_margin": (s_eris_margin, {"key": 3.2, "samples": 192}),
    "sector_phoebe_echo": (s_phoebe_echo, {}),
    "sector_nereid_shoal": (s_nereid_shoal, {}),
    "sector_proteus_well": (s_proteus_well, {}),
    "sector_triton_wake": (s_triton_wake, {"samples": 192}),
    "sector_eunomia_gulf": (s_eunomia_gulf, {}),
    "sector_sedna_dark": (s_sedna_dark, {"key": 0.6, "rim": 9.0}),
    "sector_dione_lane": (s_dione_lane, {}),
}

for sid, (build, light) in SECTORS.items():
    if ONLY and sid not in ONLY:
        continue
    reset()
    scene, cam = setup_scene(**light)
    build(M())
    if os.environ.get("TOKEN_DEBUG"):
        for ob in bpy.context.scene.objects:
            if ob.type == "MESH" and not ob.hide_render:
                mats = [m.name for m in ob.data.materials if m]
                if not mats:
                    print("NO-MATERIAL", sid, ob.name, flush=True)
        if os.environ.get("TOKEN_DEBUG") == "dry":
            continue
    # pass 1: transparent film (true coverage for solid bodies)
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = os.path.join(OUT_DIR, f"{sid}.png")
    bpy.ops.render.render(write_still=True)
    # pass 2: over black (true colour for glows); the finisher merges: alpha = max(coverage, brightness)
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = os.path.join(OUT_DIR, f"{sid}.black.png")
    bpy.ops.render.render(write_still=True)
    print("TOKEN", sid, scene.render.filepath, flush=True)
