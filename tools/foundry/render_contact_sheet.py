#!/usr/bin/env python3
"""Fleet Breadth Foundry — deterministic contact-sheet renderer (Lane B harness).

Renders a CONSISTENT view set for one or more GLB parts and composites every
view into one labeled contact sheet, so any lane can prove a candidate asset
reads correctly at gameplay scale, under a neutral rig, and channel-by-channel.

DUAL MODE (single file):
  * SYSTEM PYTHON (has PIL + argparse) — the entry other lanes run. Orchestrates:
      python tools/foundry/render_contact_sheet.py --glb A.glb [--glb B.glb ...] \
             --out <dir> [--label NAME] [--fast] [--views a,b,c]
    For each GLB it spawns ONE headless Blender process to render every view PNG,
    then composites the labeled sheet with PIL.
  * BLENDER PYTHON (bpy present, numpy but NO PIL) — invoked internally as:
      blender -b --factory-startup -P render_contact_sheet.py -- \
              --render-glb A.glb --render-out <dir> [--fast] [--views ...]
    Renders the individual view PNGs + a _views.json manifest. No PIL used here.

Why dual mode: Blender's bundled Python has numpy 2.3 but not PIL; the label
requirement rules out a numpy-only sheet, and multi-GLB + PIL live naturally in
system Python. Both invocation forms are documented in design/foundry/FOUNDRY_CONTRACT.md.

GAME CAMERA (extracted from src/render/camera.js):
  * FOV = 50 deg  (Three.js PerspectiveCamera fov is the VERTICAL fov; on a square
    frame vertical == horizontal, so Blender vertical fov 50 matches gameplay
    foreshortening exactly).
  * TILT = 60 deg elevation above the horizontal plane (offset = (0, D*sin60,
    -D*cos60) with lookAt origin => camera 60 deg above horizon, i.e. 30 deg off
    straight-down / nadir — a steep top-down chase).
  * DEFAULT_ZOOM = 72 world-units chase distance (informational).

Part axis convention (SpaceFace, after glTF import to Blender Z-up):
  +X = thrust / forward (length),  +Y = beam (lateral),  +Z = up (DORSAL, the
  surface the player sees). Confirmed against hull_fighter MAIN dims.

DETERMINISM: fixed Cycles seed 0, no animated seed, CPU device, OpenImageDenoise,
fixed exposure, no wall-clock in any output name or payload. The JSON manifest is
sorted-key / rounded and is byte-identical across runs. Raster PNGs are
content-deterministic (identical scene) but Cycles multithreaded reduction may
differ at the sub-ULP level between runs; see the contract doc for the honest note.
"""
from __future__ import annotations

import json
import math
import os
import sys

# --- runtime mode detection ------------------------------------------------
try:  # pragma: no cover - depends on interpreter
    import bpy  # noqa: F401
    IN_BLENDER = True
except Exception:  # ImportError under system CPython
    IN_BLENDER = False

# ---------------------------------------------------------------------------
# Shared constants (used by both modes)
# ---------------------------------------------------------------------------
GAME_FOV_DEG = 50.0          # src/render/camera.js: state.settings.video.fov || 50 (vertical fov)
GAME_TILT_DEG = 60.0         # src/render/camera.js: c.tilt || 60 (elevation above horizontal)
GAME_DEFAULT_ZOOM = 72.0     # src/render/camera.js: DEFAULT_ZOOM (informational)

# A single canonical "study" angle drives every material-analysis view
# (silhouette, clay, channels, emissive, wireframe, neutral_close) so the sheet
# reads as one object under different reveals. az measured from +X about +Z up.
STUDY_AZ_DEG = 128.0         # behind + to one flank
STUDY_EL_DEG = 46.0          # elevated, dorsal-dominant but flank still reads

# The full deterministic view set, in canonical sheet order.
TURNTABLE_STEPS = 8
DEFAULT_VIEW_ORDER = [
    "neutral_close", "game_cam", "zoom_out", "silhouette", "clay",
    "basecolor", "roughness", "metallic", "normal", "ao",
    "emissive_only", "wireframe",
] + [f"turntable_{i:02d}" for i in range(TURNTABLE_STEPS)]

# Meshes whose names match these are lower-detail proxies that overlap the LOD0
# body; hiding them prevents double-rendering (hull_fighter LOD1/LOD2 share the
# LOD0 bbox exactly). HOOK_/DET_ are NOT excluded — on some parts (engine_ion_twin)
# HOOK_DRIVE_* carry the real drive geometry.
PROXY_TOKENS = ("LOD1_", "LOD2_", "LOD3_", "SILHOUETTE")


def _split_argv_after_dashes(argv):
    return argv[argv.index("--") + 1:] if "--" in argv else []


def _view_label(name: str) -> str:
    return name.replace("_", " ").upper()


# ===========================================================================
# BLENDER MODE — render every view PNG for one GLB (no PIL, numpy ok)
# ===========================================================================
if IN_BLENDER:
    import numpy as np  # bundled with Blender
    from mathutils import Vector

    def _reset_scene():
        bpy.ops.wm.read_factory_settings(use_empty=True)

    def _import_glb(path):
        bpy.ops.import_scene.gltf(filepath=path)
        bpy.context.view_layer.update()

    def _is_proxy(obj) -> bool:
        nu = obj.name.upper()
        return any(tok in nu for tok in PROXY_TOKENS)

    def render_meshes():
        """Visible gameplay geometry = all meshes except lower-LOD proxies."""
        return [o for o in bpy.data.objects if o.type == "MESH" and not _is_proxy(o)]

    def world_bounds(objs):
        mins = Vector((1e18, 1e18, 1e18))
        maxs = Vector((-1e18, -1e18, -1e18))
        for obj in objs:
            for corner in obj.bound_box:
                wc = obj.matrix_world @ Vector(corner)
                mins = Vector((min(mins[i], wc[i]) for i in range(3)))
                maxs = Vector((max(maxs[i], wc[i]) for i in range(3)))
        center = (mins + maxs) / 2
        extents = maxs - mins
        return center, extents

    def _dir_from_az_el(az_deg, el_deg):
        az = math.radians(az_deg)
        el = math.radians(el_deg)
        return Vector((math.cos(el) * math.cos(az),
                       math.cos(el) * math.sin(az),
                       math.sin(el))).normalized()

    def _basis(view_dir):
        # camera sits along +view_dir from center, looks back toward center
        forward = (-view_dir).normalized()
        up_world = Vector((0.0, 0.0, 1.0))
        right = forward.cross(up_world)
        if right.length < 1e-6:
            right = Vector((0.0, 1.0, 0.0))
        right.normalize()
        up = right.cross(forward).normalized()
        return forward, right, up

    def fit_distance(objs, center, view_dir, fov_deg, fill):
        _, right, up = _basis(view_dir)
        us, vs = [], []
        for obj in objs:
            for corner in obj.bound_box:
                rel = (obj.matrix_world @ Vector(corner)) - center
                us.append(rel.dot(right))
                vs.append(rel.dot(up))
        if not us:
            return 6.0
        span_u = max(us) - min(us)
        span_v = max(vs) - min(vs)
        tan_half = math.tan(math.radians(fov_deg) * 0.5)  # aspect 1 (square)
        fill = max(0.02, min(0.98, fill))
        dist_u = (span_u * 0.5) / (fill * tan_half)
        dist_v = (span_v * 0.5) / (fill * tan_half)
        return max(dist_u, dist_v, 0.25)

    def setup_camera(name, center, view_dir, dist, fov_deg):
        cam_data = bpy.data.cameras.new(name)
        cam = bpy.data.objects.new(name, cam_data)
        bpy.context.scene.collection.objects.link(cam)
        cam.data.sensor_fit = "VERTICAL"
        cam.data.sensor_height = 24.0
        cam.data.angle_y = math.radians(fov_deg)  # vertical fov == game vertical fov
        cam.data.clip_start = 0.01
        cam.data.clip_end = max(1000.0, dist * 8.0)
        cam.location = center + view_dir * dist
        look = (center - cam.location)
        cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.camera = cam
        return cam

    def _clear_cameras():
        for o in list(bpy.data.objects):
            if o.type == "CAMERA":
                bpy.data.objects.remove(o, do_unlink=True)

    def _clear_lights():
        for o in list(bpy.data.objects):
            if o.type == "LIGHT":
                bpy.data.objects.remove(o, do_unlink=True)

    def _add_sun(name, az_deg, el_deg, energy, color):
        light = bpy.data.lights.new(name, "SUN")
        light.energy = energy
        light.color = color
        light.angle = math.radians(2.0)
        obj = bpy.data.objects.new(name, light)
        bpy.context.scene.collection.objects.link(obj)
        d = _dir_from_az_el(az_deg, el_deg)  # direction FROM which light comes
        # sun emits along its local -Z; aim -Z toward origin => track (-d)
        obj.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        return obj

    def setup_neutral_rig():
        """Fixed 3-point neutral rig: warm key, cool fill, cool rim. World-fixed.

        Key sits near the study-camera azimuth and high so the visible dorsal +
        camera-facing flank read; the rig stays world-fixed so the turntable is
        consistent and the whole sheet is deterministic. Energies are lifted well
        above the game's moody grade because this is an INSPECTION rig — the point
        is to see construction, not reproduce the in-game mood.
        """
        _clear_lights()
        _add_sun("SF_KEY", az_deg=112, el_deg=56, energy=6.5, color=(1.0, 0.95, 0.88))
        _add_sun("SF_FILL", az_deg=300, el_deg=20, energy=2.2, color=(0.88, 0.93, 1.0))
        _add_sun("SF_RIM", az_deg=205, el_deg=72, energy=3.2, color=(0.90, 0.94, 1.0))

    def setup_clay_rig():
        _clear_lights()
        _add_sun("SF_CLAY_KEY", az_deg=55, el_deg=52, energy=3.0, color=(1.0, 1.0, 1.0))
        _add_sun("SF_CLAY_FILL", az_deg=235, el_deg=22, energy=1.0, color=(1.0, 1.0, 1.0))

    def set_world(rgb, strength=1.0):
        scene = bpy.context.scene
        world = scene.world or bpy.data.worlds.new("SF_World")
        scene.world = world
        world.use_nodes = True
        nt = world.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputWorld")
        bg = nt.nodes.new("ShaderNodeBackground")
        bg.inputs["Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bg.inputs["Strength"].default_value = strength
        nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    def set_view_transform(transform, exposure=0.0):
        vs = bpy.context.scene.view_settings
        want = transform
        # Blender 5.1 exposes Filmic + AgX + Standard; fall back gracefully.
        try:
            vs.view_transform = want
        except (TypeError, Exception):
            vs.view_transform = "Standard"
        vs.exposure = exposure
        vs.gamma = 1.0
        try:
            vs.look = "None"
        except Exception:
            pass

    def configure_render(fast: bool):
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        try:
            scene.cycles.device = "CPU"
            scene.cycles.samples = 24 if fast else 64
            scene.cycles.use_denoising = True
            try:
                scene.cycles.denoiser = "OPENIMAGEDENOISE"
            except Exception:
                pass
            scene.cycles.use_animated_seed = False
            scene.cycles.seed = 0
            scene.cycles.use_adaptive_sampling = False  # fixed sample count => deterministic
        except Exception as exc:  # noqa: BLE001
            print("WARN cycles config:", exc)
        res = 384 if fast else 512
        scene.render.resolution_x = res
        scene.render.resolution_y = res
        scene.render.resolution_percentage = 100
        scene.render.film_transparent = False
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGB"
        scene.render.image_settings.color_depth = "8"
        scene.render.image_settings.compression = 90
        return res

    # ---- material overrides -------------------------------------------------
    def _emission_mat(name, color=(0, 0, 0), strength=1.0):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emi = nt.nodes.new("ShaderNodeEmission")
        emi.inputs["Color"].default_value = (color[0], color[1], color[2], 1.0)
        emi.inputs["Strength"].default_value = strength
        nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
        return mat, nt, emi

    def _clay_mat():
        mat = bpy.data.materials.new("SF_CLAY")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (0.62, 0.62, 0.64, 1.0)
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 0.72
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        return mat

    def _first_image_upstream(socket, depth=0):
        """DFS up the node graph from a BSDF input socket to the first Image node."""
        if depth > 8 or not socket.links:
            return None
        for link in socket.links:
            node = link.from_node
            if node.type == "TEX_IMAGE" and getattr(node, "image", None):
                return node.image
            for inp in node.inputs:
                found = _first_image_upstream(inp, depth + 1)
                if found:
                    return found
        return None

    def _principled(mat):
        if not mat or not mat.use_nodes:
            return None
        return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)

    def _factor(bsdf, name, fallback):
        if bsdf and name in bsdf.inputs and not bsdf.inputs[name].links:
            v = bsdf.inputs[name].default_value
            try:
                return tuple(v)[:3]
            except TypeError:
                return (float(v), float(v), float(v))
        return fallback

    def _tex_node(nt, image, colorspace):
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        try:
            tex.image.colorspace_settings.name = colorspace
        except Exception:
            pass
        return tex

    def channel_override_for(orig_mat, channel):
        """Build an unlit emission material visualizing one channel of orig_mat.

        Robust: if the source image for the channel is not found upstream, fall
        back to the flat factor value (never abort the sheet).
        """
        bsdf = _principled(orig_mat)
        base_name = f"SF_{channel}_{orig_mat.name if orig_mat else 'none'}"

        if channel == "basecolor":
            img = _first_image_upstream(bsdf.inputs["Base Color"]) if bsdf else None
            if img:
                mat, nt, emi = _emission_mat(base_name)
                tex = _tex_node(nt, img, "sRGB")
                nt.links.new(tex.outputs["Color"], emi.inputs["Color"])
                return mat
            return _emission_mat(base_name, _factor(bsdf, "Base Color", (0.5, 0.5, 0.5)))[0]

        if channel in ("roughness", "metallic"):
            src = bsdf.inputs[channel.capitalize()] if bsdf and channel.capitalize() in bsdf.inputs else None
            img = _first_image_upstream(src) if src else None
            comp = "Green" if channel == "roughness" else "Blue"  # glTF ORM packing
            if img:
                mat, nt, emi = _emission_mat(base_name)
                tex = _tex_node(nt, img, "Non-Color")
                sep = nt.nodes.new("ShaderNodeSeparateColor")
                nt.links.new(tex.outputs["Color"], sep.inputs["Color"])
                nt.links.new(sep.outputs[comp], emi.inputs["Color"])  # float->gray
                return mat
            f = _factor(bsdf, channel.capitalize(), (0.5, 0.5, 0.5))
            g = f[0] if isinstance(f, tuple) else f
            return _emission_mat(base_name, (g, g, g))[0]

        if channel == "normal":
            img = _first_image_upstream(bsdf.inputs["Normal"]) if bsdf else None
            if img:
                mat, nt, emi = _emission_mat(base_name)
                tex = _tex_node(nt, img, "Non-Color")
                nt.links.new(tex.outputs["Color"], emi.inputs["Color"])
                return mat
            return _emission_mat(base_name, (0.5, 0.5, 1.0))[0]  # flat tangent normal

        if channel == "ao":
            # No occlusionTexture on foundry donors: substitute geometric Cycles AO.
            mat, nt, emi = _emission_mat(base_name, (1, 1, 1))
            ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
            ao.samples = 8
            try:
                ao.inputs["Distance"].default_value = 1.0
            except Exception:
                pass
            nt.links.new(ao.outputs["Color"], emi.inputs["Color"])
            return mat

        if channel == "emissive":
            img = _first_image_upstream(bsdf.inputs["Emission Color"]) if bsdf else None
            strength = _factor(bsdf, "Emission Strength", (0.0, 0, 0))
            s = strength[0] if isinstance(strength, tuple) else strength
            col = _factor(bsdf, "Emission Color", (0, 0, 0))
            if img and s > 0:
                mat, nt, emi = _emission_mat(base_name, strength=max(1.0, s))
                tex = _tex_node(nt, img, "sRGB")
                nt.links.new(tex.outputs["Color"], emi.inputs["Color"])
                return mat
            return _emission_mat(base_name, tuple(c * (s if s > 0 else 0) for c in col))[0]

        return _emission_mat(base_name, (0.5, 0.5, 0.5))[0]

    def _wireframe_mat():
        mat = bpy.data.materials.new("SF_WIRE")
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        emi = nt.nodes.new("ShaderNodeEmission")
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.inputs["Color1"].default_value = (0.05, 0.06, 0.08, 1.0)  # dark clay base
        mix.inputs["Color2"].default_value = (0.85, 0.90, 1.0, 1.0)   # bright wire
        wire = nt.nodes.new("ShaderNodeWireframe")
        wire.use_pixel_size = True
        wire.inputs["Size"].default_value = 1.7
        nt.links.new(wire.outputs["Fac"], mix.inputs["Fac"])
        nt.links.new(mix.outputs["Color"], emi.inputs["Color"])
        emi.inputs["Strength"].default_value = 1.0
        nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
        return mat

    def _save_materials(meshes):
        return {id(o): [s.material for s in o.material_slots] for o in meshes}

    def _apply_single(meshes, mat):
        for o in meshes:
            if not o.data.materials:
                o.data.materials.append(mat)
            else:
                for i in range(len(o.data.materials)):
                    o.data.materials[i] = mat

    def _apply_mapped(meshes, mapper):
        """mapper: orig_material -> override_material, per slot."""
        cache = {}
        for o in meshes:
            for i, slot in enumerate(o.material_slots):
                orig = slot.material
                key = orig.name if orig else "__none__"
                if key not in cache:
                    cache[key] = mapper(orig)
                o.data.materials[i] = cache[key]

    def _restore_materials(meshes, saved):
        for o in meshes:
            mats = saved.get(id(o), [])
            for i, m in enumerate(mats):
                if i < len(o.data.materials):
                    o.data.materials[i] = m

    # ---- per-view drivers ---------------------------------------------------
    def _view_geometry(name):
        """Return (view_dir, fov_deg, fill) for a named view."""
        if name == "game_cam":
            return _dir_from_az_el(180.0, GAME_TILT_DEG), GAME_FOV_DEG, 0.52
        if name == "zoom_out":
            return _dir_from_az_el(180.0, GAME_TILT_DEG), GAME_FOV_DEG, 0.10
        if name.startswith("turntable_"):
            idx = int(name.split("_")[1])
            az = 180.0 + (360.0 / TURNTABLE_STEPS) * idx
            return _dir_from_az_el(az, GAME_TILT_DEG), GAME_FOV_DEG, 0.50
        # all study-angle views
        fill = 0.72 if name == "neutral_close" else 0.62
        return _dir_from_az_el(STUDY_AZ_DEG, STUDY_EL_DEG), GAME_FOV_DEG, fill

    def render_one_view(name, meshes, center, out_dir, filmic_name):
        saved = _save_materials(meshes)
        view_dir, fov, fill = _view_geometry(name)
        dist = fit_distance(meshes, center, view_dir, fov, fill)
        _clear_cameras()
        setup_camera(f"SF_CAM_{name}", center, view_dir, dist, fov)

        try:
            if name in ("neutral_close", "game_cam", "zoom_out") or name.startswith("turntable_"):
                setup_neutral_rig()
                set_world((0.05, 0.055, 0.07), 1.1)  # soft ambient so shadows are not dead black
                set_view_transform(filmic_name, exposure=1.15)
            elif name == "clay":
                setup_clay_rig()
                set_world((0.08, 0.08, 0.09), 1.2)
                set_view_transform(filmic_name, exposure=1.0)
                _apply_single(meshes, _clay_mat())
            elif name == "silhouette":
                _clear_lights()
                set_world((1.0, 1.0, 1.0), 1.0)  # white world
                set_view_transform("Standard")
                _apply_single(meshes, _emission_mat("SF_SIL", (0, 0, 0), 0.0)[0])  # black shape
            elif name == "wireframe":
                _clear_lights()
                set_world((0.02, 0.02, 0.03), 1.0)
                set_view_transform("Standard")
                _apply_single(meshes, _wireframe_mat())
            elif name in ("basecolor", "roughness", "metallic", "normal", "ao"):
                _clear_lights()
                set_world((0.0, 0.0, 0.0), 0.0)
                set_view_transform("Standard")
                _apply_mapped(meshes, lambda m, ch=name: channel_override_for(m, ch))
            elif name == "emissive_only":
                _clear_lights()
                set_world((0.0, 0.0, 0.0), 0.0)
                set_view_transform(filmic_name)
                _apply_mapped(meshes, lambda m: channel_override_for(m, "emissive"))
            else:
                setup_neutral_rig()
                set_world((0.02, 0.025, 0.035), 0.5)
                set_view_transform(filmic_name)

            path = os.path.join(out_dir, f"{name}.png")
            bpy.context.scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            ok = os.path.isfile(path)
        finally:
            _restore_materials(meshes, saved)
        return {"view": name, "path": path if ok else None, "ok": bool(ok)}

    def _pick_filmic():
        # The view_transform enum is OCIO-config-driven and NOT exposed via
        # bl_rna.enum_items (returns ['None']); probe by direct assignment.
        vs = bpy.context.scene.view_settings
        for cand in ("Filmic", "AgX", "Standard"):
            try:
                vs.view_transform = cand
                if vs.view_transform == cand:
                    return cand
            except Exception:
                continue
        return "Standard"

    def run_blender_render():
        args = _split_argv_after_dashes(sys.argv)
        glb = None
        out_dir = None
        fast = False
        views = list(DEFAULT_VIEW_ORDER)
        i = 0
        while i < len(args):
            a = args[i]
            if a == "--render-glb":
                glb = args[i + 1]; i += 2; continue
            if a == "--render-out":
                out_dir = args[i + 1]; i += 2; continue
            if a == "--fast":
                fast = True; i += 1; continue
            if a == "--views":
                views = [v.strip() for v in args[i + 1].split(",") if v.strip()]; i += 2; continue
            i += 1
        if not glb or not out_dir:
            raise SystemExit("blender mode requires --render-glb and --render-out")
        os.makedirs(out_dir, exist_ok=True)

        _reset_scene()
        _import_glb(glb)
        configure_render(fast)
        filmic = _pick_filmic()
        meshes = render_meshes()
        if not meshes:
            raise SystemExit(f"no render meshes in {glb}")
        center, extents = world_bounds(meshes)

        results = []
        for name in views:
            try:
                results.append(render_one_view(name, meshes, center, out_dir, filmic))
            except Exception as exc:  # noqa: BLE001 - never let one view abort the sheet
                print(f"WARN view {name} failed: {exc}")
                results.append({"view": name, "path": None, "ok": False, "error": str(exc)})

        manifest = {
            "glb": os.path.basename(glb),
            "views": results,
            "resolution": bpy.context.scene.render.resolution_x,
            "samples": bpy.context.scene.cycles.samples,
            "fov_deg": GAME_FOV_DEG,
            "tilt_deg": GAME_TILT_DEG,
            "study_az_deg": STUDY_AZ_DEG,
            "study_el_deg": STUDY_EL_DEG,
            "view_transform": filmic,
            "center": [round(center.x, 4), round(center.y, 4), round(center.z, 4)],
            "extents": [round(extents.x, 4), round(extents.y, 4), round(extents.z, 4)],
            "mesh_count": len(meshes),
        }
        with open(os.path.join(out_dir, "_views.json"), "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2, sort_keys=True)
        print("BLENDER_RENDER_DONE", json.dumps({"ok": sum(1 for r in results if r["ok"]),
                                                 "total": len(results)}))

    if __name__ == "__main__" and "--render-glb" in _split_argv_after_dashes(sys.argv):
        run_blender_render()


# ===========================================================================
# SYSTEM MODE — orchestrate Blender + composite the labeled contact sheet (PIL)
# ===========================================================================
if not IN_BLENDER:
    import argparse
    import subprocess

    from PIL import Image, ImageDraw, ImageFont

    def _find_blender():
        env = os.environ.get("SF_BLENDER")
        if env and os.path.isfile(env):
            return env
        candidates = [
            r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe",
            r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe",
        ]
        for c in candidates:
            if os.path.isfile(c):
                return c
        raise SystemExit("Blender not found; set SF_BLENDER to blender.exe path")

    def _font(size):
        for name in ("consola.ttf", "arial.ttf", "DejaVuSansMono.ttf"):
            try:
                return ImageFont.truetype(name, size)
            except Exception:
                continue
        return ImageFont.load_default()

    # Blender embeds volatile tEXt/eXIf chunks (Date, Time, RenderTime, ...) that
    # make the file hash differ run-to-run even though the pixel IDAT is proven
    # byte-identical. Strip everything except a deterministic allowlist so the
    # delivered PNGs are byte-identical across runs (rule 4).
    import struct as _struct

    _PNG_KEEP = {b"IHDR", b"PLTE", b"tRNS", b"sRGB", b"gAMA", b"cHRM", b"IDAT", b"IEND"}

    def normalize_png(path):
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            return
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            return
        out = bytearray(data[:8])
        off = 8
        changed = False
        while off + 8 <= len(data):
            ln = _struct.unpack(">I", data[off:off + 4])[0]
            ctype = data[off + 4:off + 8]
            end = off + 12 + ln
            if ctype in _PNG_KEEP:
                out += data[off:end]
            else:
                changed = True
            off = end
            if ctype == b"IEND":
                break
        if changed:
            with open(path, "wb") as fh:
                fh.write(out)

    def render_glb(blender, self_path, glb, out_dir, fast, views):
        os.makedirs(out_dir, exist_ok=True)
        cmd = [blender, "-b", "--factory-startup", "-P", self_path, "--",
               "--render-glb", os.path.abspath(glb), "--render-out", os.path.abspath(out_dir)]
        if fast:
            cmd.append("--fast")
        if views:
            cmd += ["--views", ",".join(views)]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        tail = "\n".join(proc.stdout.strip().splitlines()[-6:])
        print(f"[blender {os.path.basename(glb)}] exit={proc.returncode}\n{tail}")
        if proc.returncode != 0:
            print(proc.stderr.strip()[-1500:])
        manifest_path = os.path.join(out_dir, "_views.json")
        if not os.path.isfile(manifest_path):
            raise SystemExit(f"render failed for {glb}: no _views.json")
        with open(manifest_path, encoding="utf-8") as fh:
            manifest = json.load(fh)
        # Deterministic normalization: strip volatile PNG metadata so files are
        # byte-identical across runs (pixels are already identical).
        for v in manifest.get("views", []):
            if v.get("ok") and v.get("path"):
                normalize_png(v["path"])
        return manifest

    def build_contact_sheet(manifest, out_dir, label, sheet_path):
        views = manifest["views"]
        cells = [v for v in views if v.get("ok") and v.get("path") and os.path.isfile(v["path"])]
        if not cells:
            raise SystemExit("no rendered views to composite")
        thumb = 320
        pad = 10
        header = 46
        cap = 22
        cols = 5
        rows = math.ceil(len(cells) / cols)
        W = cols * thumb + (cols + 1) * pad
        H = header + rows * (thumb + cap + pad) + pad
        sheet = Image.new("RGB", (W, H), (14, 16, 20))
        draw = ImageDraw.Draw(sheet)
        title_font = _font(26)
        cap_font = _font(15)
        meta_font = _font(13)

        title = f"{label}   —   FLEET BREADTH FOUNDRY CONTACT SHEET"
        draw.text((pad, 10), title, fill=(232, 236, 242), font=title_font)
        meta = (f"src={manifest['glb']}  res={manifest['resolution']}  smp={manifest['samples']}  "
                f"fov={manifest['fov_deg']:g}  tilt={manifest['tilt_deg']:g}  "
                f"tris_meshes={manifest['mesh_count']}  xf={manifest['view_transform']}")
        draw.text((pad, header - 16), meta, fill=(150, 158, 170), font=meta_font)

        for idx, cell in enumerate(cells):
            r, c = divmod(idx, cols)
            x = pad + c * (thumb + pad)
            y = header + r * (thumb + cap + pad)
            try:
                im = Image.open(cell["path"]).convert("RGB")
            except Exception:
                continue
            im = im.resize((thumb, thumb), Image.LANCZOS)
            # checker matte behind so black silhouettes / dark channels still frame
            sheet.paste(im, (x, y))
            draw.rectangle([x, y, x + thumb - 1, y + thumb - 1], outline=(60, 66, 78))
            draw.text((x + 2, y + thumb + 3), _view_label(cell["view"]),
                      fill=(200, 206, 216), font=cap_font)
        sheet.save(sheet_path, optimize=True)
        return sheet_path

    def main():
        ap = argparse.ArgumentParser(description="Foundry deterministic contact-sheet renderer")
        ap.add_argument("--glb", action="append", required=True, help="GLB path (repeatable)")
        ap.add_argument("--out", required=True, help="output directory root")
        ap.add_argument("--label", default=None, help="sheet label (default: per-GLB basename)")
        ap.add_argument("--fast", action="store_true", help="24 samples / 384px preview")
        ap.add_argument("--views", default=None, help="comma list to render a subset")
        args = ap.parse_args()

        blender = _find_blender()
        self_path = os.path.abspath(__file__)
        views = [v.strip() for v in args.views.split(",")] if args.views else None
        out_root = os.path.abspath(args.out)
        os.makedirs(out_root, exist_ok=True)

        summary = []
        for glb in args.glb:
            stem = os.path.splitext(os.path.basename(glb))[0]
            # Guard: a user --label with multiple GLBs would write every sheet to the
            # same file (clobber). Suffix with the stem so each sheet is distinct.
            if args.label:
                label = f"{args.label}_{stem}" if len(args.glb) > 1 else args.label
            else:
                label = stem
            view_dir = os.path.join(out_root, stem)
            manifest = render_glb(blender, self_path, glb, view_dir, args.fast, views)
            sheet_path = os.path.join(out_root, f"{label}_sheet.png")
            build_contact_sheet(manifest, view_dir, label, sheet_path)
            ok = sum(1 for v in manifest["views"] if v.get("ok"))
            total = len(manifest["views"])
            print(f"SHEET {sheet_path}  ({ok}/{total} views)")
            summary.append({"glb": glb, "sheet": sheet_path, "ok": ok, "total": total})

        print("\nDONE:")
        for s in summary:
            print(f"  {s['glb']} -> {s['sheet']} [{s['ok']}/{s['total']}]")

    if __name__ == "__main__":
        main()
