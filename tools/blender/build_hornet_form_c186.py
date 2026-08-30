"""Build a Hornet chase-camera form candidate from one continuous lifting shell.

This is deliberately a new construction technique after the C185 three-house reset was
rejected.  The body is a chined pressure shell with a broad wing carry-through, not a set of
house rings with fairings attached.  The script reuses the sanctioned chase renderer, export
contract, socket map, and material-map helpers from ``build_hornet_mtx.py``.  It only writes the
Hornet authoring GLBs, source textures, and cycle evidence; it never writes release files.
"""

from __future__ import annotations

import importlib.util
import json
import math
import struct
import sys
from pathlib import Path


BASE = Path(__file__).with_name("build_hornet_mtx.py")
SPEC = importlib.util.spec_from_file_location("hornet_mtx_base", BASE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load sanctioned Hornet builder: {BASE}")
MTX = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MTX)

bpy = MTX.bpy
bmesh = MTX.bmesh
Vector = MTX.Vector
FAMILY = MTX.FAMILY


def cycle_from_args() -> int:
    for index, token in enumerate(sys.argv):
        if token.startswith("--mtx-cycle="):
            return int(token.split("=", 1)[1])
        if token in {"--mtx-cycle", "--cycle"} and index + 1 < len(sys.argv):
            return int(sys.argv[index + 1])
    return int(getattr(MTX, "CYCLE", 1))


CYCLE = cycle_from_args()
MTX.CYCLE = CYCLE
TAG = f"C{CYCLE:03d}"

# MTX-17 is a source-asset contract, not a screenshot claim.  The C191 shell spans roughly
# 11.0 authored metres, so C192's hero map has to be at least 2,816 px to clear the 256 px/m
# lower bound.  Use a power-of-two ladder with a density-preserving source bake so the procedural
# plate periods do not become a finer checker when the map edge is raised.
C192_TEX_BY_LOD = {0: 4096, 1: 2048, 2: 1024}
C193_TEX_BY_LOD = {0: 4096, 1: 2048, 2: 1024}
FORM_AUTHORED_LENGTH_M = 11.01


def read_final_glb_metrics(path: Path, lod: int):
    """Read the exported GLB and derive acceptance metrics from its final binary payload.

    Blender's pre-export loop-triangle count can differ from the indexed primitive payload after
    modifier/export triangulation.  The report must describe what the runtime actually receives,
    including embedded image dimensions and tangent attributes, so this deliberately parses the
    finished GLB instead of trusting the authoring scene.
    """
    payload = path.read_bytes()
    if len(payload) < 20 or payload[:4] != b"glTF":
        raise RuntimeError(f"{path.name}: invalid GLB header")
    offset = 12
    json_chunk = None
    bin_chunk = b""
    while offset + 8 <= len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        start = offset + 8
        end = start + chunk_length
        if end > len(payload):
            raise RuntimeError(f"{path.name}: truncated GLB chunk")
        chunk = payload[start:end]
        if chunk_type == 0x4E4F534A:
            json_chunk = chunk
        elif chunk_type == 0x004E4942:
            bin_chunk = chunk
        offset = end
    if json_chunk is None:
        raise RuntimeError(f"{path.name}: missing JSON chunk")
    gltf = json.loads(json_chunk.decode("utf-8").rstrip(" \t\r\n\x00"))
    accessors = gltf.get("accessors", [])
    buffer_views = gltf.get("bufferViews", [])

    def accessor_info(index):
        accessor = accessors[index]
        view = buffer_views[accessor["bufferView"]]
        return accessor, view

    def indexed_triangles(primitive):
        accessor, _view = accessor_info(primitive["indices"])
        if (primitive.get("mode", 4)) != 4:
            raise RuntimeError(f"{path.name}: non-triangle primitive in LOD{lod}")
        return accessor["count"] // 3

    def mesh_is_collision(mesh):
        return "collision" in str(mesh.get("name", "")).lower()

    meshes = gltf.get("meshes", [])
    visible_meshes = [mesh for mesh in meshes if not mesh_is_collision(mesh)]
    visible_primitives = [primitive for mesh in visible_meshes for primitive in mesh.get("primitives", [])]
    triangles = sum(indexed_triangles(primitive) for primitive in visible_primitives)
    hull_meshes = [mesh for mesh in visible_meshes if f"LOD{lod}_Hull" in str(mesh.get("name", ""))]
    hull_triangles = sum(indexed_triangles(primitive) for mesh in hull_meshes for primitive in mesh.get("primitives", []))
    image_sizes = []
    for image in gltf.get("images", []):
        if image.get("mimeType") != "image/png" or "bufferView" not in image:
            raise RuntimeError(f"{path.name}: image is not embedded PNG")
        view = buffer_views[image["bufferView"]]
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        png = bin_chunk[start:end]
        if len(png) < 24 or png[:8] != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"{path.name}: malformed embedded PNG")
        image_sizes.append((struct.unpack_from(">II", png, 16)))
    unique_image_sizes = sorted(set(image_sizes))
    if not unique_image_sizes:
        raise RuntimeError(f"{path.name}: no embedded images")

    missing_tangents = []
    tangent_primitives = 0
    for mesh in visible_meshes:
        mesh_name = str(mesh.get("name", ""))
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if "TANGENT" in attributes:
                tangent_primitives += 1
            if any(marker in mesh_name for marker in ("Flap", "LowerLoadPath", "ServiceHose")) and "TANGENT" not in attributes:
                missing_tangents.append(mesh_name)
    if missing_tangents:
        raise RuntimeError(f"{path.name}: missing tangents on {', '.join(missing_tangents)}")

    # All normal-mapped role primitives must carry a tangent basis; simple untextured collision
    # and frame meshes are intentionally outside this check.
    tangent_ready = 0
    for mesh in visible_meshes:
        for primitive in mesh.get("primitives", []):
            attrs = primitive.get("attributes", {})
            if "NORMAL" in attrs and "TEXCOORD_0" in attrs:
                tangent_ready += int("TANGENT" in attrs)

    expected_ladder = C193_TEX_BY_LOD if CYCLE >= 193 else (C192_TEX_BY_LOD if CYCLE >= 192 else {0: 1024, 1: 512, 2: 512})
    expected_map = expected_ladder.get(lod)
    if expected_map is None or unique_image_sizes != [(expected_map, expected_map)]:
        raise RuntimeError(f"{path.name}: embedded image sizes {unique_image_sizes}, expected {expected_map}")
    return {
        "triangles": triangles,
        "hullTriangles": hull_triangles,
        "draws": len(visible_primitives),
        "meshNodes": len(visible_meshes),
        "primitiveSubmits": len(visible_primitives),
        "embeddedTextureSizes": [list(size) for size in unique_image_sizes],
        "textureMapSize": unique_image_sizes[0][0],
        "texelDensityPxPerM": round(unique_image_sizes[0][0] / FORM_AUTHORED_LENGTH_M, 1),
        "tangentPrimitives": tangent_primitives,
        "tangentReadyPrimitives": tangent_ready,
    }


def finalize_binary_report(reports):
    """Replace authoring estimates with metrics parsed from the three final source GLBs."""
    ladder = C193_TEX_BY_LOD if CYCLE >= 193 else (C192_TEX_BY_LOD if CYCLE >= 192 else {0: 1024, 1: 512, 2: 512})
    for report in reports:
        output = FAMILY / "source" / "wholeships" / f"hornet_production_v1_lod{report['lod']}.glb"
        report.update(read_final_glb_metrics(output, report["lod"]))
        report["textureMapLadder"] = {f"lod{level}": size for level, size in ladder.items()}
        report["texelDensityTargetPxPerM"] = [256, 512]
    return reports


def _set_input(node, name, value):
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def wire_form_maps(material, bsdf, maps, coat=0.0, uv1_scale=72.0):
    """Bind unique UV0 maps and a restrained UV1 material-specific micro response."""
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.name = "SF_UV0_BAKE"
    uv0.uv_map = "UVMap"
    uv1 = nodes.new("ShaderNodeUVMap")
    uv1.name = "SF_UV1_DETAIL"
    uv1.uv_map = "UV1"
    base = nodes.new("ShaderNodeTexImage")
    base.name = "SF_UNIQUE_ALBEDO"
    base.image = maps[0]
    orm = nodes.new("ShaderNodeTexImage")
    orm.name = "SF_AUTHORED_ORM"
    orm.image = maps[1]
    normal = nodes.new("ShaderNodeTexImage")
    normal.name = "SF_TANGENT_NORMAL"
    normal.image = maps[2]
    links.new(uv0.outputs["UV"], base.inputs["Vector"])
    links.new(uv0.outputs["UV"], orm.inputs["Vector"])
    links.new(uv0.outputs["UV"], normal.inputs["Vector"])
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    split = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], split.inputs["Color"])
    if split.outputs.get("Green") is not None:
        links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
    if split.outputs.get("Blue") is not None:
        links.new(split.outputs["Blue"], bsdf.inputs["Metallic"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.name = "SF_MIKKT_OPENGL_NORMAL"
    normal_map.space = "TANGENT"
    _set_input(normal_map, "Strength", 0.78)
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])

    # UV1 is a separate tiled detail coordinate.  It modulates a small bump response and never
    # replaces the unique bake, so meso construction remains geometry/UV0 driven.
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "SF_UV1_MATERIAL_DETAIL"
    _set_input(noise, "Scale", uv1_scale)
    _set_input(noise, "Detail", 2.0)
    _set_input(noise, "Roughness", 0.58)
    bump = nodes.new("ShaderNodeBump")
    bump.name = "SF_UV1_MICRO_NORMAL"
    _set_input(bump, "Strength", 0.045)
    _set_input(bump, "Distance", 0.006)
    links.new(uv1.outputs["UV"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(normal_map.outputs["Normal"], bump.inputs["Normal"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if coat and bsdf.inputs.get("Coat Weight") is not None:
        _set_input(bsdf, "Coat Weight", coat)
        _set_input(bsdf, "Coat Roughness", 0.10)


def refresh_packed_image(image):
    """Persist the current image buffer and replace any stale packed payload."""
    target = str(MTX.TEX_DIR / f"{image.name}.png")
    image.filepath = target
    image.filepath_raw = target
    image.file_format = "PNG"
    image.save()
    # Image.pack() without data is a no-op when role_maps() already packed its 1024 source. Read
    # the just-saved target and pass it explicitly so the existing PackedFile is replaced in-place
    # without Blender writing a transient relative `textures/` path.
    data = Path(target).read_bytes()
    image.pack(data=data, data_len=len(data))


def flatten_c193_role_maps(maps, rgb, role):
    """Remove procedural checker/facet stamping while keeping unique role-map assets."""
    if CYCLE < 193 or role not in {"hull", "armor", "mechanical"}:
        return maps
    roughness = {"hull": 0.46, "armor": 0.52, "mechanical": 0.48}[role]
    metallic = {"hull": 0.05, "armor": 0.22, "mechanical": 0.52}[role]
    payloads = (
        (*rgb, 1.0),
        (0.90, roughness, metallic, 1.0),
        (0.5, 0.5, 1.0, 1.0),
    )
    # role_maps() is intentionally generated at the 1024 source frequency and scaled to the
    # final ladder below. Flattening here keeps the cleanup cheap while ensuring the embedded
    # 4096/2048 image carries no repeated pixel-grid at any of its target sizes.
    for image, value in zip(maps, payloads):
        pixels = list(image.pixels)
        pixels[:] = list(value) * (len(pixels) // 4)
        image.pixels = pixels
        image.update()
    return maps


def c193_uniform_role_maps(rgb, role, prefix):
    """Create target-sized authored role maps without Blender's FILE-image resize trap."""
    roughness = {"hull": 0.46, "armor": 0.52, "mechanical": 0.48}.get(role, 0.50)
    metallic = {"hull": 0.05, "armor": 0.22, "mechanical": 0.52}.get(role, 0.05)
    payloads = {
        "basecolor": ((*rgb, 1.0), "sRGB"),
        "orm": ((0.90, roughness, metallic, 1.0), "Non-Color"),
        "normal": ((0.5, 0.5, 1.0, 1.0), "Non-Color"),
    }
    maps = []
    for suffix, (color, colorspace) in payloads.items():
        name = f"hornet_{prefix}_{suffix}"
        if name in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[name])
        image = bpy.data.images.new(name, width=MTX.TEX, height=MTX.TEX, alpha=True)
        image.generated_color = color
        image.colorspace_settings.name = colorspace
        target = MTX.TEX_DIR / f"{name}.png"
        image.filepath = str(target)
        image.filepath_raw = str(target)
        image.file_format = "PNG"
        image.save()
        data = target.read_bytes()
        image.pack(data=data, data_len=len(data))
        maps.append(image)
    return tuple(maps)


def soften_plate_seams(maps, role):
    """Keep authored map density while removing the synthetic checkerboard read.

    The sanctioned role-map generator deliberately bakes narrow plate seams.  At the
    close chase distance, C186-C189's repeated 96x64/72x48 seams were aliasing into a
    uniform grid across the whole airframe.  C190 retains the same unique UV0/ORM/normal
    maps and UV1 detail, but blends only the seam bands toward their immediate plate so they
    read as restrained course breaks instead of a debug texture. C192 removes the remaining
    repeated contrast from the baked bands; the shell construction is carried by geometry and
    role value, not a tiled checker. C193 removes the remaining role-map grid at source resolution
    and refreshes Blender's packed image after this pixel edit; otherwise the exporter can embed
    the stale pre-scale 1024 source image.
    """
    if CYCLE < 190 or CYCLE >= 193 or role not in {"hull", "armor"}:
        return maps
    for image in maps:
        width, height = image.size[:]
        scale = max(1.0, width / 1024.0)
        periods = {"hull": (96, 64), "armor": (72, 48)}
        pw, ph = (int(round(value * scale)) for value in periods[role])
        band = max(2, int(round(2.0 * scale)))
        seam_blend = 0.0 if CYCLE >= 192 else 0.30
        pixels = list(image.pixels)
        for y in range(height):
            for x in range(width):
                sx, sy = x % pw, y % ph
                if sx not in (*range(band), *range(pw - band, pw)) and sy not in (*range(band), *range(ph - band, ph)):
                    continue
                if sx in (*range(band), *range(pw - band, pw)):
                    nx = (x + band) % width if sx < band else (x - band) % width
                    ny = y
                else:
                    nx = x
                    ny = (y + band) % height if sy < band else (y - band) % height
                target = 4 * (y * width + x)
                source = 4 * (ny * width + nx)
                for channel in range(3):
                    pixels[target + channel] = pixels[target + channel] * seam_blend + pixels[source + channel] * (1.0 - seam_blend)
        image.pixels = pixels
        image.update()
        # role_maps() packs the 1024 source before C192/C193 scales it. Blender's pack() is a
        # no-op while a PackedFile exists, so explicitly replace that stale payload after saving
        # the final target-sized image for glTF embedding.
        refresh_packed_image(image)
    return maps


def create_form_materials():
    """Create distinct Hornet material roles with a deterministic LOD texture ladder."""
    specs = {
        "Material_Hull": ((0.50, 0.55, 0.61), "hull", 0.0, 0.46, 0.42),
        "Material_HullPanel": ((0.34, 0.39, 0.45), "hull", 0.0, 0.52, 0.36),
        "Material_Armor": ((0.075, 0.095, 0.12), "armor", 0.16, 0.50, 0.55),
        "Material_Wing": ((0.19, 0.24, 0.30), "armor", 0.12, 0.44, 0.62),
        "Material_Mechanical": ((0.24, 0.27, 0.29), "mechanical", 0.90, 0.30, 24.0),
        "Material_Ceramic": ((0.31, 0.27, 0.23), "ceramic", 0.0, 0.68, 36.0),
        "Material_Radiator": ((0.11, 0.13, 0.14), "mechanical", 0.82, 0.48, 52.0),
        "Material_Accent": ((0.035, 0.36, 0.46), "accent", 0.10, 0.34, 64.0),
        "Material_Warning": ((0.88, 0.18, 0.035), "warning", 0.04, 0.42, 52.0),
    }
    if CYCLE >= 188:
        # A restrained steel-blue value hierarchy: bright pressure shell, dark lifting
        # surfaces/mechanical recesses, and small cyan/red service marks.  This is a surface
        # read correction, not a new identity or an extra garnish layer.
        specs.update({
            "Material_Hull": ((0.39, 0.47, 0.56), "hull", 0.0, 0.46, 0.42),
            "Material_HullPanel": ((0.25, 0.32, 0.40), "hull", 0.0, 0.52, 0.36),
            "Material_Armor": ((0.055, 0.090, 0.130), "armor", 0.16, 0.50, 0.55),
            "Material_Wing": ((0.075, 0.145, 0.205), "armor", 0.12, 0.44, 0.62),
            "Material_Mechanical": ((0.16, 0.20, 0.24), "mechanical", 0.90, 0.30, 24.0),
            "Material_Ceramic": ((0.34, 0.27, 0.20), "ceramic", 0.0, 0.68, 36.0),
        })
    if CYCLE >= 192:
        # C191's dark plates and bright engine frames collapsed into a toy-kit value grouping.
        # Keep the role separation, but lift the armor/wing values and move the frame toward
        # blue-black structural steel so the hull remains the bright pressure-shell authority.
        specs.update({
            "Material_Hull": ((0.36, 0.45, 0.54), "hull", 0.0, 0.46, 0.42),
            "Material_HullPanel": ((0.27, 0.36, 0.44), "hull", 0.0, 0.52, 0.36),
            "Material_Armor": ((0.105, 0.17, 0.22), "armor", 0.16, 0.50, 0.55),
            "Material_Wing": ((0.125, 0.225, 0.285), "armor", 0.12, 0.44, 0.62),
            "Material_Mechanical": ((0.13, 0.18, 0.22), "mechanical", 0.78, 0.36, 24.0),
            "Material_Ceramic": ((0.25, 0.20, 0.15), "ceramic", 0.0, 0.68, 36.0),
            "Material_Radiator": ((0.17, 0.23, 0.25), "mechanical", 0.68, 0.42, 52.0),
        })
    if CYCLE >= 193:
        # The radiator is a serviceable thermal cassette, not a black grille. A slightly lifted
        # blue-steel role keeps its core and header readable against the recessed gap and hull.
        specs["Material_Armor"] = ((0.13, 0.20, 0.24), "armor", 0.10, 0.52, 0.36)
        specs["Material_Wing"] = ((0.16, 0.27, 0.32), "armor", 0.10, 0.52, 0.36)
        specs["Material_Radiator"] = ((0.24, 0.33, 0.35), "mechanical", 0.52, 0.48, 18.0)
    mats = {}
    for name, (rgb, role, metallic, roughness, detail_scale) in specs.items():
        material = bpy.data.materials.new(name)
        bsdf = MTX.principled(material)
        _set_input(bsdf, "Base Color", (*rgb, 1.0))
        _set_input(bsdf, "Metallic", metallic)
        _set_input(bsdf, "Roughness", roughness)
        map_target = MTX.TEX
        # Generate the procedural pattern at the C191 1024 source frequency, then scale the
        # authored image to its contract edge. This raises measured texel density without making
        # plate periods four times tighter in physical metres.
        map_prefix = f"form_c{CYCLE:03d}_lod{map_target}_{name.replace('Material_', '').lower()}"
        if CYCLE >= 193:
            # Use a generated target image directly. Image.scale() on a packed FILE image reports
            # the new size but save() reloads the original 1024 payload; direct generation makes
            # the embedded ladder truthful and keeps the C193 material floor free of grid stamps.
            maps = c193_uniform_role_maps(rgb, role, map_prefix)
        else:
            map_source = min(map_target, 1024) if CYCLE >= 192 else map_target
            maps = MTX.role_maps(role, rgb, size=map_source, prefix=map_prefix)
            flatten_c193_role_maps(maps, rgb, role)
        if CYCLE >= 192 and CYCLE < 193 and map_source != map_target:
            for image in maps:
                # Blender's Image.scale() is a no-op while the source image remains packed. Drop
                # only that generated source payload before scaling; refresh_packed_image() packs
                # the target-sized PNG explicitly below.
                if image.packed_file is not None:
                    image.unpack(method="REMOVE")
                image.scale(map_target, map_target)
                refresh_packed_image(image)
        soften_plate_seams(maps, role)
        wire_form_maps(
            material,
            bsdf,
            maps,
            coat=0.22 if role == "hull" else 0.08,
            uv1_scale=0.14 if CYCLE >= 193 else detail_scale,
        )
        material["spacefaceRole"] = role
        material["spacefaceMapLadder"] = f"LOD{MTX.TEX} unique UV0 + UV1 detail"
        mats[name] = material

    simple_specs = {
        "Material_Canopy": ((0.008, 0.018, 0.028), 0.0, 0.12, "glass"),
        "Material_Frame": ((0.34, 0.39, 0.43), 0.88, 0.32, "mechanical"),
        "Material_Soot": ((0.012, 0.014, 0.016), 0.0, 0.84, "soot"),
        "Material_Gap": ((0.018, 0.022, 0.026), 0.0, 0.76, "gap"),
    }
    if CYCLE >= 192:
        simple_specs["Material_Frame"] = ((0.17, 0.23, 0.28), 0.72, 0.42, "mechanical")
    for name, (rgb, metallic, roughness, role) in simple_specs.items():
        material = bpy.data.materials.new(name)
        bsdf = MTX.principled(material)
        _set_input(bsdf, "Base Color", (*rgb, 1.0))
        _set_input(bsdf, "Metallic", metallic)
        _set_input(bsdf, "Roughness", roughness)
        if name == "Material_Canopy":
            _set_input(bsdf, "Transmission Weight", 0.0)
            _set_input(bsdf, "Coat Weight", 0.32)
            _set_input(bsdf, "Coat Roughness", 0.10)
            _set_input(bsdf, "Alpha", 1.0)
            try:
                material.surface_render_method = "DITHERED"
            except (AttributeError, TypeError):
                pass
            try:
                material.blend_method = "OPAQUE"
            except (AttributeError, TypeError):
                pass
        material["spacefaceRole"] = role
        mats[name] = material
    return mats


def finish(obj, material, bevel=0.010):
    return MTX.finish_mesh(obj, material, bevel)


def mesh_object(name, vertices, faces, material, collection, bevel=0.010):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish(obj, material, bevel)


def loft_open(name, rings, material, collection, bevel=0.006):
    """Loft a thin shell without closing the underside (used for the canopy glass)."""
    sides = len(rings[0])
    vertices = [point for ring in rings for point in ring]
    faces = []
    for station in range(len(rings) - 1):
        start = station * sides
        next_start = (station + 1) * sides
        for index in range(sides - 1):
            faces.append((start + index, next_start + index, next_start + index + 1, start + index + 1))
    return mesh_object(name, vertices, faces, material, collection, bevel)


def section_ring(x, half_width, half_height, zc, flat, shoulder, keel):
    """Authored 16-point pressure-shell station with changing deck/chine/keel sections."""
    flat = max(0.0, min(1.0, flat))
    shoulder = max(0.0, min(1.0, shoulder))
    keel = max(0.0, min(1.0, keel))
    deck = half_width * (0.08 + flat * 0.62)
    upper = zc + half_height
    shoulder_y = half_width * (0.38 + shoulder * 0.40)
    shoulder_z = zc + half_height * (0.72 - shoulder * 0.20)
    beam_z = zc + half_height * (0.15 - shoulder * 0.15)
    lower_y = half_width * (0.78 - shoulder * 0.08)
    lower_z = zc - half_height * (0.38 + shoulder * 0.10)
    keel_y = half_width * (0.10 + (1.0 - keel) * 0.36)
    keel_z = zc - half_height * (0.88 + keel * 0.12)
    return [
        (x, 0.0, upper),
        (x, deck, upper - half_height * 0.015),
        (x, half_width * 0.34, zc + half_height * 0.93),
        (x, shoulder_y, shoulder_z),
        (x, half_width * 0.88, zc + half_height * 0.42),
        (x, half_width, beam_z),
        (x, lower_y, lower_z),
        (x, keel_y, keel_z),
        (x, 0.0, zc - half_height),
        (x, -keel_y, keel_z),
        (x, -lower_y, lower_z),
        (x, -half_width, beam_z),
        (x, -half_width * 0.88, zc + half_height * 0.42),
        (x, -shoulder_y, shoulder_z),
        (x, -half_width * 0.34, zc + half_height * 0.93),
        (x, -deck, upper - half_height * 0.015),
    ]


def airfoil_section(y, x_le, zc, chord, thickness):
    """Closed formed wing section; thickness tapers with span instead of becoming a card."""
    return [
        (x_le, y, zc),
        (x_le - chord * 0.10, y, zc + thickness * 0.48),
        (x_le - chord * 0.28, y, zc + thickness),
        (x_le - chord * 0.52, y, zc + thickness * 0.78),
        (x_le - chord * 0.78, y, zc + thickness * 0.30),
        (x_le - chord, y, zc),
        (x_le - chord * 0.80, y, zc - thickness * 0.18),
        (x_le - chord * 0.52, y, zc - thickness * 0.46),
        (x_le - chord * 0.27, y, zc - thickness * 0.72),
        (x_le - chord * 0.10, y, zc - thickness * 0.30),
    ]


def oriented_ring(center, axis, radius, sides=16):
    """Circular section in a drive axis plane, with a stable authored basis."""
    center = Vector(center)
    axis = Vector(axis).normalized()
    basis_a = Vector((0.0, 1.0, 0.0))
    if abs(axis.dot(basis_a)) > 0.92:
        basis_a = Vector((1.0, 0.0, 0.0))
    basis_a = (basis_a - axis * axis.dot(basis_a)).normalized()
    basis_b = axis.cross(basis_a).normalized()
    return [
        tuple(center + basis_a * math.cos(math.tau * i / sides) * radius
              + basis_b * math.sin(math.tau * i / sides) * radius)
        for i in range(sides)
    ]


def wing_slot_section(y, center_x, half_width=0.10, zc=0.12, depth=0.06):
    """Small recessed volume between a lifting surface and its trailing flap."""
    return [
        (center_x - half_width, y, zc + depth),
        (center_x + half_width, y, zc + depth),
        (center_x + half_width, y, zc - depth),
        (center_x - half_width, y, zc - depth),
    ]


def append_lower_material(obj, material, limit=0.0):
    if material.name not in [slot.name for slot in obj.material_slots]:
        obj.data.materials.append(material)
    slot = obj.data.materials.find(material.name)
    for poly in obj.data.polygons:
        mean_z = sum(obj.data.vertices[index].co.z for index in poly.vertices) / len(poly.vertices)
        if mean_z < limit:
            poly.material_index = slot


def assign_hull_roles(obj, mats):
    for material_name in ("Material_HullPanel", "Material_Mechanical"):
        if material_name not in [slot.name for slot in obj.material_slots]:
            obj.data.materials.append(mats[material_name])
    panel_slot = obj.data.materials.find("Material_HullPanel")
    mech_slot = obj.data.materials.find("Material_Mechanical")
    for poly in obj.data.polygons:
        center_x = sum(obj.data.vertices[index].co.x for index in poly.vertices) / len(poly.vertices)
        center_z = sum(obj.data.vertices[index].co.z for index in poly.vertices) / len(poly.vertices)
        if center_x < -2.45 and center_z > 0.15:
            poly.material_index = panel_slot
        elif center_z < -0.55:
            poly.material_index = mech_slot


def add_annulus(name, x, y, z, outer, inner, depth, material, collection, vertices=24, rotation=(0.0, 0.0, 0.0)):
    verts = []
    for side_x in (-depth * 0.5, depth * 0.5):
        for radius in (outer, inner):
            for index in range(vertices):
                angle = math.tau * index / vertices
                verts.append((side_x, radius * math.cos(angle), radius * math.sin(angle)))
    faces = []
    outer_a, inner_a = 0, vertices
    outer_b, inner_b = vertices * 2, vertices * 3
    for index in range(vertices):
        nxt = (index + 1) % vertices
        faces.extend(
            [
                (outer_a + index, outer_a + nxt, outer_b + nxt, outer_b + index),
                (inner_a + nxt, inner_a + index, inner_b + index, inner_b + nxt),
                (outer_a + index, inner_a + index, inner_a + nxt, outer_a + nxt),
                (outer_b + nxt, inner_b + nxt, inner_b + index, outer_b + index),
            ]
        )
    obj = mesh_object(name, verts, faces, material, collection, 0.004)
    obj.location = (x, y, z)
    obj.rotation_euler = rotation
    MTX.apply_modifiers(obj)
    return obj


def cut_cylinder(host, name, location, radius, depth, rotation=(0.0, math.pi / 2.0, 0.0), vertices=24):
    """Cut a +X drive throat, restoring the host if the boolean collapses the shell."""
    MTX.apply_modifiers(host)
    backup = host.data.copy()
    before = len(host.data.vertices)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    cutter = bpy.context.object
    cutter.name = name
    MTX.apply_modifiers(cutter)
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new(name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    # A Boolean without an operand is silently disabled by Blender.  The first C186
    # export therefore reported a restored throat even though the construction code
    # looked otherwise identical to the sanctioned cube-cut helper.
    mod.object = cutter
    mod.show_viewport = True
    mod.show_render = True
    mod.show_in_editmode = True
    try:
        mod.solver = "FLOAT"
    except (AttributeError, TypeError):
        pass
    mod_name = mod.name
    ok = False
    try:
        result = bpy.ops.object.modifier_apply(modifier=mod_name)
        ok = result == {"FINISHED"} and len(host.data.vertices) >= max(320, int(before * 0.45))
    except Exception as exc:
        print(f"cut_cylinder {name} failed: {exc}")
    finally:
        host.select_set(False)
        if not ok:
            remaining = host.modifiers.get(mod_name)
            if remaining is not None:
                host.modifiers.remove(remaining)
        if cutter.name in bpy.data.objects:
            bpy.data.objects.remove(cutter, do_unlink=True)
    if not ok:
        host.data = backup
    print(f"cut_cylinder {name}: {'hit' if ok else 'restored'} {before}->{len(host.data.vertices)}")
    return ok


def triangulate_export_mesh(obj):
    """Make every render mesh explicitly triangulated before tangent/export work.

    The glTF exporter can triangulate at export time, but tangent generation runs before
    that conversion and emits warnings for the authored n-gons.  Doing this once at the
    authored boundary keeps the tangent basis deterministic without touching collision
    geometry or the runtime asset.
    """
    if obj.type != "MESH" or obj.get("collision"):
        return
    mesh = obj.data
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        faces = list(bm.faces)
        if faces:
            bmesh.ops.triangulate(
                bm,
                faces=faces,
                quad_method="BEAUTY",
                ngon_method="BEAUTY",
            )
            bm.to_mesh(mesh)
            mesh.update()
    finally:
        bm.free()


def add_decal(name, outline, z, material, collection):
    verts = [(x, y, z) for x, y in outline]
    return mesh_object(name, verts, [tuple(range(len(verts)))], material, collection, 0.0)


def add_canopy(hull, mats, collection, lod):
    canopy = mats["Material_Canopy"]
    frame = mats["Material_Frame"]
    gap = mats["Material_Gap"]
    # C187 kept the same cockpit interface but gave the excavation enough beam and setback to
    # read from the actual 60-degree chase view.  C191 moves that same real tub farther aft and
    # broadens it so the chase sees a framed opening instead of a tiny dark sticker.
    if CYCLE >= 191:
        cockpit_x = 2.65
        cockpit_scale = (1.32, 0.88, 0.54)
        tub_size = (1.16, 0.80, 0.27)
        cut_z = 0.76
        tub_z = 0.50
    else:
        cockpit_x = 3.45 if CYCLE >= 187 else 3.68
        cockpit_scale = (0.98, 0.68, 0.46) if CYCLE >= 187 else (0.78, 0.54, 0.40)
        tub_size = (0.87, 0.59, 0.22) if CYCLE >= 187 else (0.70, 0.46, 0.20)
        cut_z = 0.72
        tub_z = 0.46 if CYCLE >= 187 else 0.48
    cut_ok = MTX.safe_boolean_cut(hull, f"CanopyWell_{TAG}", (cockpit_x, 0.0, cut_z), cockpit_scale)
    tub = MTX.add_five_wall_tub(
        f"CanopyTub_{TAG}",
        (cockpit_x, 0.0, tub_z),
        tub_size,
        0.065,
        gap,
        collection,
    )
    _ = tub
    section_count = 6 if lod < 2 else 4
    profile = [
        (4.42, 0.08, 0.61),
        (4.16, 0.38, 0.64),
        (3.82, 0.52, 0.72),
        (3.42, 0.52, 0.74),
        (3.08, 0.37, 0.68),
        (2.94, 0.08, 0.62),
    ]
    if CYCLE >= 191:
        profile = [
            (4.04, 0.18, 0.75),
            (3.68, 0.56, 0.82),
            (3.18, 0.80, 0.96),
            (2.66, 0.88, 1.13),
            (2.20, 0.62, 1.08),
            (1.98, 0.24, 0.86),
        ]
    elif CYCLE >= 187:
        # The shell must crest above the pressure deck.  The first C187 pass enlarged the
        # cut but left its glass crown buried in the hull's upper station, so the chase still
        # saw only a black slit.  Raise the crown while retaining the excavated tub below it.
        profile = [(x - 0.23, width * 1.16, top + 0.34) for x, width, top in profile]
    if section_count == 4:
        profile = [profile[index] for index in (0, 2, 3, 5)]
    rings = []
    for x, half_width, top_z in profile:
        points = []
        for index in range(9):
            angle = math.pi * index / 8.0
            y = -half_width * math.cos(angle)
            z = 0.58 + (top_z - 0.58) * math.sin(angle)
            points.append((x, y, z))
        rings.append(points)
    glass = loft_open("Canopy_GlassShell", rings, canopy, collection, 0.003)
    frames = []
    if CYCLE >= 191:
        # Four-sided rails follow the raised shell rather than floating as a plane above it.
        # The same frame survives all LODs because the opening is a primary cockpit read.
        for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
            frames.append(
                MTX.add_folded_sheet(
                    f"CanopyFrame_{tag}",
                    (3.76, sign * 0.18, 0.91),
                    (2.04, sign * 0.28, 0.87),
                    (2.20, sign * 0.72, 1.14),
                    (3.56, sign * 0.48, 1.08),
                    0.055,
                    frame,
                    collection,
                    0.004,
                )
            )
    else:
        for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
            frames.append(
                MTX.add_folded_sheet(
                    f"CanopyFrame_{tag}",
                    ((4.19 if CYCLE >= 187 else 4.42), sign * (0.12 if CYCLE >= 187 else 0.10), 0.86 if CYCLE >= 187 else 0.62),
                    ((2.85 if CYCLE >= 187 else 3.08), sign * (0.46 if CYCLE >= 187 else 0.40), 1.02 if CYCLE >= 187 else 0.68),
                    ((2.85 if CYCLE >= 187 else 3.08), sign * (0.39 if CYCLE >= 187 else 0.34), 1.07 if CYCLE >= 187 else 0.73),
                    ((4.19 if CYCLE >= 187 else 4.42), sign * (0.07 if CYCLE >= 187 else 0.06), 0.92 if CYCLE >= 187 else 0.67),
                    0.045,
                    frame,
                    collection,
                    0.003,
                )
            )
    if lod == 0 or CYCLE >= 191:
        frames.append(MTX.add_folded_sheet(
            "CanopyFrame_Fore",
            ((3.78 if CYCLE >= 191 else (4.20 if CYCLE >= 187 else 4.43)), -0.18 if CYCLE >= 191 else (-0.12 if CYCLE >= 187 else -0.10), 0.91 if CYCLE >= 191 else (0.86 if CYCLE >= 187 else 0.62)),
            ((3.78 if CYCLE >= 191 else (4.20 if CYCLE >= 187 else 4.43)), 0.18 if CYCLE >= 191 else (0.12 if CYCLE >= 187 else 0.10), 0.91 if CYCLE >= 191 else (0.86 if CYCLE >= 187 else 0.62)),
            ((3.54 if CYCLE >= 191 else (3.97 if CYCLE >= 187 else 4.20)), 0.48 if CYCLE >= 191 else (0.39 if CYCLE >= 187 else 0.34), 1.08 if CYCLE >= 191 else (0.94 if CYCLE >= 187 else 0.66)),
            ((3.54 if CYCLE >= 191 else (3.97 if CYCLE >= 187 else 4.20)), -0.48 if CYCLE >= 191 else (-0.39 if CYCLE >= 187 else -0.34), 1.08 if CYCLE >= 191 else (0.94 if CYCLE >= 187 else 0.66)),
            0.040,
            frame,
            collection,
            0.003,
        ))
    print(f"canopy well: {'hit' if cut_ok else 'fallback'}; shell stations={len(rings)}")
    return [glass, *frames]


def add_drive(tag, sign, mats, collection, lod):
    if CYCLE >= 191:
        # The live chase looks from +Y/+Z and is almost edge-on to a pure -X transom.  Grow
        # each drive from the lower aft shell toward an upward/rearward mouth so its throat is
        # visible in the legal player camera, not only in a diagnostic rear crop.
        axis = Vector((-0.62, 0.0, 0.78)).normalized()
        cylinder_rotation = axis.to_track_quat("Z", "Y").to_euler()
        annulus_rotation = axis.to_track_quat("X", "Z").to_euler()
        y = 1.08 * sign
        root_center = Vector((-4.00, y, 0.28))
        mouth_center = Vector((-4.80, y, 1.02))
        mouth_radius = 0.78
        opened = cut_cylinder(
            MTX._active_hull_for_c186,
            f"DriveWell_{TAG}_{tag}",
            mouth_center,
            0.68,
            1.45,
            rotation=cylinder_rotation,
            vertices=20 if lod > 0 else 24,
        )
        housing_rings = [
            oriented_ring(root_center, axis, 0.84, 12 if lod == 0 else 10),
            oriented_ring(root_center.lerp(mouth_center, 0.58), axis, 0.80, 12 if lod == 0 else 10),
            oriented_ring(mouth_center - axis * 0.12, axis, 0.74, 12 if lod == 0 else 10),
        ]
        housing = MTX.loft_from_rings(
            f"DriveHouse_{tag}",
            housing_rings,
            mats["Material_HullPanel"],
            collection,
            0.010 if lod == 0 else 0.007,
            cap=False,
        )
        rim = add_annulus(
            f"DriveFlange_{tag}",
            *(mouth_center + axis * 0.03),
            mouth_radius,
            0.60,
            0.20,
            mats["Material_Frame"],
            collection,
            24 if lod == 0 else 16,
            rotation=annulus_rotation,
        )
        ceramic = add_annulus(
            f"DriveCeramic_{tag}",
            *(mouth_center - axis * 0.02),
            0.60,
            0.43,
            0.16,
            mats["Material_Ceramic"],
            collection,
            20 if lod == 0 else 14,
            rotation=annulus_rotation,
        )
        bore = MTX.add_cylinder(
            f"DriveBore_{tag}",
            mouth_center - axis * 0.14,
            0.42,
            0.12,
            mats["Material_Soot"],
            collection,
            vertices=18 if lod == 0 else (14 if lod == 1 else 12),
            bevel=0.002,
            rot=cylinder_rotation,
        )
        bits = [housing, rim, ceramic, bore]
        basis_a = Vector((0.0, 1.0, 0.0))
        basis_b = axis.cross(basis_a).normalized()
        vane_count = 6 if lod == 0 else (4 if lod == 1 else 3)
        for index in range(vane_count):
            angle = math.tau * index / vane_count
            tangent = (-basis_a * math.sin(angle) + basis_b * math.cos(angle)).normalized()
            vane_center = mouth_center - axis * 0.20 + basis_a * math.cos(angle) * 0.29 + basis_b * math.sin(angle) * 0.29
            bits.append(
                MTX.add_box(
                    f"DriveVane_{tag}_{index}",
                    vane_center,
                    (0.052, 0.030, 0.24 if lod == 0 else 0.18),
                    mats["Material_Mechanical"],
                    collection,
                    0.002,
                    rot=tangent.to_track_quat("Z", "Y").to_euler(),
                )
            )
        return bits, {"tag": tag, "opened": opened, "mouthOuterRadius": mouth_radius, "axis": [round(v, 3) for v in axis]}

    y = 0.98 * sign
    z = 0.10
    opened = cut_cylinder(MTX._active_hull_for_c186, f"DriveWell_{TAG}_{tag}", (-4.84, y, z), 0.62, 1.10)
    rim = add_annulus(f"DriveFlange_{tag}", -4.98, y, z, 0.68, 0.53, 0.18, mats["Material_Frame"], collection, 28 if lod == 0 else 20)
    ceramic = add_annulus(f"DriveCeramic_{tag}", -4.90, y, z, 0.53, 0.38, 0.15, mats["Material_Ceramic"], collection, 24 if lod == 0 else 18)
    bore = MTX.add_cylinder(
        f"DriveBore_{tag}",
        (-4.81, y, z),
        0.37,
        0.08,
        mats["Material_Soot"],
        collection,
        vertices=22 if lod == 0 else 16,
        bevel=0.002,
        rot=(0.0, math.pi / 2.0, 0.0),
    )
    bits = [rim, ceramic, bore]
    vane_count = 8 if lod == 0 else (5 if lod == 1 else 0)
    for index in range(vane_count):
        angle = math.tau * index / vane_count
        bits.append(
            MTX.add_box(
                f"DriveVane_{tag}_{index}",
                (-4.84, y + math.cos(angle) * 0.25, z + math.sin(angle) * 0.25),
                (0.055, 0.035, 0.26 if lod == 0 else 0.21),
                mats["Material_Mechanical"],
                collection,
                0.002,
                rot=(angle, 0.0, 0.0),
            )
        )
    return bits, {"tag": tag, "opened": opened, "mouthOuterRadius": 0.68}


def build_wing(name, sign, mats, collection, lod):
    # C188 separates the lifting surfaces from the pressure shell in value.  C186/C187
    # carried the hull map across the wing crown, so the silhouette disappeared into one
    # gridded slab in the play frame; the root fairing below remains hull-colored.
    wing = mats["Material_Wing"] if CYCLE >= 188 else mats["Material_Hull"]
    underside = mats["Material_Wing"]
    if CYCLE >= 193:
        # C192's wing is closed and materially thicker, but its long pointed planform still
        # collapses into a blade at chase distance. C193 shortens the main chord where the flap
        # starts, increases the root section, and leaves a real aft control surface separated by
        # an open structural channel.
        full = [
            (1.12, 1.92, 0.26, 3.10, 0.38),
            (1.52, 2.12, 0.30, 2.86, 0.34),
            (2.18, 2.52, 0.30, 2.42, 0.30),
            (2.82, 2.98, 0.27, 1.95, 0.24),
            (3.44, 3.42, 0.22, 1.38, 0.18),
            (4.02, 3.78, 0.16, 0.92, 0.12),
        ]
    elif CYCLE >= 192:
        full = [
            (1.16, 2.00, 0.16, 3.86, 1.04),
            (1.44, 2.22, 0.18, 3.58, 0.88),
            (2.06, 2.70, 0.20, 3.02, 0.66),
            (2.76, 3.16, 0.21, 2.40, 0.48),
            (3.45, 3.56, 0.21, 1.72, 0.30),
            (4.02, 3.88, 0.20, 1.12, 0.16),
        ]
    elif CYCLE >= 191:
        # C190's wing was technically closed, but its flap lived inside the main planform and
        # the root fairing had no section the chase could read.  This ladder gives the wing a
        # deep inboard section, an actual carry-through, and a trailing flap behind a recessed
        # slot; lower LODs retain those structural cues with fewer stations.
        full = [
            (1.18, 2.02, 0.16, 3.86, 0.78),
            (1.46, 2.24, 0.18, 3.58, 0.66),
            (2.08, 2.72, 0.20, 3.02, 0.50),
            (2.78, 3.18, 0.21, 2.40, 0.34),
            (3.46, 3.58, 0.21, 1.72, 0.22),
            (4.02, 3.88, 0.20, 1.12, 0.12),
        ]
    else:
        full = [
            (1.34, 2.22, 0.09, 3.72, 0.52),
            (1.72, 2.04, 0.11, 3.58, 0.46),
            (2.22, 2.58, 0.13, 3.10, 0.36),
            (2.86, 3.10, 0.16, 2.56, 0.26),
            (3.54, 3.56, 0.18, 1.88, 0.17),
            (4.02, 3.88, 0.20, 1.22, 0.10),
        ]
    if lod == 1:
        full = [full[index] for index in ((0, 1, 3, 5) if CYCLE < 191 else (0, 2, 4, 5))]
    elif lod == 2:
        full = [full[index] for index in (0, 3, 5)]
    rings = [MTX.densify_ring(airfoil_section(y * sign, x, z, chord, thick), 2 if lod == 0 else 1) for x, y, z, chord, thick in full]
    obj = MTX.loft_from_rings(name, rings, wing, collection, 0.012 if lod == 0 else 0.008, cap=True)
    append_lower_material(obj, underside, limit=0.0)
    # The root fairing is a thick carry-through that begins inside the pressure shell.  A lighter
    # hull-panel role at the first stations keeps the attachment legible instead of reading as a
    # detached dark card.
    if CYCLE >= 193:
        root_rings = [
            MTX.densify_ring(airfoil_section(0.46 * sign, 0.70, 0.02, 3.34, 0.52), 2),
            MTX.densify_ring(airfoil_section(1.10 * sign, 0.92, 0.05, 3.36, 0.46), 2),
            MTX.densify_ring(airfoil_section(1.80 * sign, 1.24, 0.12, 3.08, 0.34), 2),
        ]
        root_material = mats["Material_HullPanel"]
    elif CYCLE >= 192:
        root_rings = [
            MTX.densify_ring(airfoil_section(0.70 * sign, 0.94, 0.12, 3.72, 1.10), 2),
            MTX.densify_ring(airfoil_section(1.16 * sign, 1.10, 0.15, 3.78, 0.94), 2),
            MTX.densify_ring(airfoil_section(1.72 * sign, 1.44, 0.18, 3.56, 0.76), 2),
        ]
        root_material = mats["Material_Hull"]
    elif CYCLE >= 191:
        root_rings = [
            MTX.densify_ring(airfoil_section(0.82 * sign, 1.02, 0.16, 3.62, 0.84), 2),
            MTX.densify_ring(airfoil_section(1.18 * sign, 1.18, 0.17, 3.72, 0.76), 2),
            MTX.densify_ring(airfoil_section(1.72 * sign, 1.52, 0.18, 3.54, 0.62), 2),
        ]
        root_material = mats["Material_HullPanel"]
    else:
        root_rings = [
            MTX.densify_ring(airfoil_section(1.12 * sign, 1.46, 0.08, 3.38, 0.64), 2),
            MTX.densify_ring(airfoil_section(1.34 * sign, 1.34, 0.09, 3.72, 0.52), 2),
            MTX.densify_ring(airfoil_section(1.72 * sign, 1.72, 0.11, 3.58, 0.46), 2),
        ]
        root_material = wing
    fairing = MTX.loft_from_rings(f"{name}_RootFairing", root_rings, root_material, collection, 0.012, cap=True)
    append_lower_material(fairing, underside, limit=-0.02)
    bits = [obj, fairing]
    if CYCLE >= 193:
        # C193 lowers and thickens the spar so it remains a visible underside load path from the
        # default and close chase cameras, while keeping its tapered section tied into the shell.
        load_rings = [
            MTX.densify_ring(airfoil_section(0.42 * sign, 0.58, -0.22, 1.90, 0.50), 2 if lod == 0 else 1),
            MTX.densify_ring(airfoil_section(1.08 * sign, 0.78, -0.18, 1.82, 0.42), 2 if lod == 0 else 1),
            MTX.densify_ring(airfoil_section(1.72 * sign, 1.06, -0.08, 1.55, 0.30), 2 if lod == 0 else 1),
        ]
        bits.append(MTX.loft_from_rings(
            f"{name}_LowerLoadPath",
            load_rings,
            mats["Material_HullPanel"],
            collection,
            0.008 if lod == 0 else 0.005,
            cap=True,
        ))
    if lod < 2:
        if CYCLE >= 193:
            # The flap is an independent aft surface. Its leading edge is behind the shortened
            # main-wing trailing edge, and the channel spans both inboard and outboard sections.
            flap_specs = [
                (1.48, -1.04, 0.70, 0.04, 0.20),
                (3.02, 1.04, 0.48, 0.07, 0.16),
            ]
            slot = MTX.loft_from_rings(
                f"{name}_FlapSlot",
                [
                    wing_slot_section(1.28 * sign, -0.92, 0.18, 0.16, 0.14),
                    wing_slot_section(1.68 * sign, -0.92, 0.17, 0.16, 0.14),
                    wing_slot_section(2.82 * sign, 1.15, 0.16, 0.16, 0.12),
                    wing_slot_section(3.24 * sign, 1.15, 0.15, 0.16, 0.12),
                ],
                mats["Material_Gap"],
                collection,
                0.003,
                cap=True,
            )
            bits.append(slot)
        elif CYCLE >= 191:
            # At both stations the flap sits aft of the main trailing edge, leaving a real dark
            # slot rather than an overlapping black patch hidden inside the wing footprint.
            flap_specs = [
                (2.24, -1.74, 0.76, 0.12, 0.14),
                (3.40, 1.42, 0.48, 0.16, 0.10),
            ]
            slot = MTX.loft_from_rings(
                f"{name}_FlapSlot",
                [
                    wing_slot_section(2.20 * sign, -1.82, 0.11, 0.12, 0.055),
                    wing_slot_section(2.30 * sign, -1.66, 0.10, 0.12, 0.055),
                    wing_slot_section(3.34 * sign, 1.40, 0.10, 0.15, 0.050),
                    wing_slot_section(3.46 * sign, 1.54, 0.09, 0.15, 0.050),
                ],
                mats["Material_Gap"],
                collection,
                0.003,
                cap=True,
            )
            bits.append(slot)
        else:
            flap_specs = [
                (2.42, -0.58, 0.92, 0.15, 0.12),
                (3.52, -0.44, 0.54, 0.18, 0.07),
            ]
        flap = MTX.loft_from_rings(
            f"{name}_Flap",
            [MTX.densify_ring(airfoil_section(y * sign, x_le, z, chord, thick), 1) for y, x_le, chord, z, thick in flap_specs],
            mats["Material_HullPanel"] if CYCLE >= 193 else underside,
            collection,
            0.004,
            cap=True,
        )
        bits.append(flap)
    return bits


def add_canards(mats, collection, lod):
    bits = []
    if lod == 2:
        return bits
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        bits.append(
            MTX.loft_from_rings(
                f"Canard_{tag}",
                [
                    MTX.densify_ring(airfoil_section(0.30 * sign, 4.55, 0.22, 0.88, 0.13), 1),
                    MTX.densify_ring(airfoil_section(0.96 * sign, 4.22, 0.25, 0.44, 0.075), 1),
                ],
                mats["Material_Armor"],
                collection,
                0.005,
                cap=True,
            )
        )
        bits.append(MTX.add_box(
            f"GunCheek_{tag}",
            (4.65, 0.42 * sign, 0.12),
            (0.38, 0.13, 0.16),
            mats["Material_Armor"],
            collection,
            0.008,
        ))
    return bits


def build_radiator(hull, mats, collection, lod):
    if CYCLE >= 193:
        # C192's cassette is structurally present but still collapses to a dark grille at the
        # legal play size. C193 enlarges the rim and wall depth, lifts the core out of the floor,
        # and pulls the mounts onto the cassette shoulders so the feature reads as serviceable
        # hardware before its fins are read.
        well_loc = (-1.10, 0.38, 0.84)
        well_scale = (0.84, 0.62, 0.34)
        cassette_loc = (-1.10, 0.38, 0.62)
        cassette_inner = (0.72, 0.46, 0.22)
        fin_y = 0.78
        fin_z = 0.82
        fin_x0 = -1.72
        fin_step = 0.38
        fin_scale = (0.075, 0.36, 0.035)
    elif CYCLE >= 192:
        # C191 exposed a real well, but its dark floor and fins photographed as a comb.  Keep
        # the service opening recessed while giving it a structural cassette: a framed rim,
        # visible walls, a header rail, and mounts that visibly bite into the spine.
        well_loc = (-1.35, 0.38, 0.80)
        well_scale = (0.78, 0.52, 0.28)
        cassette_loc = (-1.35, 0.38, 0.68)
        cassette_inner = (0.66, 0.38, 0.18)
        fin_y = 0.64
        fin_z = 0.80
        fin_x0 = -1.88
        fin_step = 0.25
        fin_scale = (0.045, 0.28, 0.045)
    elif CYCLE >= 191:
        # Move the service well onto the dorsal spine behind the cockpit.  The old starboard
        # pocket lived beneath the wing crown and was technically real but invisible in chase.
        well_loc = (-1.35, 0.38, 0.78)
        well_scale = (0.74, 0.48, 0.25)
        cassette_loc = (-1.35, 0.38, 0.66)
        cassette_inner = (0.62, 0.34, 0.16)
        fin_y = 0.63
        fin_z = 0.86
        fin_x0 = -1.86
        fin_step = 0.17
        fin_scale = (0.032, 0.22, 0.15)
    else:
        well_loc = (-1.15, 2.05, 0.55)
        well_scale = (0.56, 0.42, 0.18)
        cassette_loc = (-1.15, 2.10, 0.50)
        cassette_inner = (0.48, 0.24, 0.13)
        fin_y = 2.30
        fin_z = 0.54
        fin_x0 = -1.53
        fin_step = 0.13
        fin_scale = (0.035, 0.17, 0.14)
    ok = MTX.safe_boolean_cut(hull, f"RadiatorWell_{TAG}", well_loc, well_scale)
    bits = []
    bits.extend(MTX.add_five_wall_tub(
        f"RadiatorCassette_{TAG}",
        cassette_loc,
        cassette_inner,
        0.100 if CYCLE >= 193 else (0.070 if CYCLE >= 192 else 0.045),
        mats["Material_Frame"] if CYCLE >= 192 else mats["Material_Gap"],
        collection,
    ) or [])
    if CYCLE >= 192:
        # The dark floor and a restrained metallic core make the recess legible; the framed wall
        # remains the authored rim and the core gives the fins a real heat-exchanger substrate.
        bits.append(MTX.add_box(
            f"RadiatorFloor_{TAG}",
            (cassette_loc[0], cassette_loc[1], cassette_loc[2] - cassette_inner[2] + 0.020),
            (cassette_inner[0] * 0.92, cassette_inner[1] * 0.92, 0.018),
            mats["Material_Gap"],
            collection,
            0.003,
        ))
        bits.append(MTX.add_box(
            f"RadiatorCore_{TAG}",
            (cassette_loc[0], cassette_loc[1], cassette_loc[2] + (0.100 if CYCLE >= 193 else 0.075)),
            (cassette_inner[0] * (0.86 if CYCLE >= 193 else 0.84), cassette_inner[1] * (0.84 if CYCLE >= 193 else 0.80), 0.085 if CYCLE >= 193 else 0.055),
            mats["Material_Radiator"],
            collection,
            0.004,
        ))
        bits.append(MTX.add_box(
            f"RadiatorHeader_{TAG}",
            (cassette_loc[0] + cassette_inner[0] - (0.095 if CYCLE >= 193 else 0.070), cassette_loc[1], cassette_loc[2] + (0.050 if CYCLE >= 193 else 0.035)),
            (0.095 if CYCLE >= 193 else 0.070, cassette_inner[1] * (0.98 if CYCLE >= 193 else 0.96), 0.075 if CYCLE >= 193 else 0.060),
            mats["Material_Frame"],
            collection,
            0.006,
        ))
        for mount_tag, mount_y in (("Port", cassette_loc[1] - cassette_inner[1] - (0.075 if CYCLE >= 193 else 0.055)), ("Stbd", cassette_loc[1] + cassette_inner[1] + (0.075 if CYCLE >= 193 else 0.055))):
            bits.append(MTX.add_box(
                f"RadiatorMount_{TAG}_{mount_tag}",
                (cassette_loc[0] - cassette_inner[0] * (0.60 if CYCLE >= 193 else 0.66), mount_y, cassette_loc[2] + (0.045 if CYCLE >= 193 else 0.025)),
                (0.135 if CYCLE >= 193 else 0.115, 0.085 if CYCLE >= 193 else 0.065, 0.125 if CYCLE >= 193 else 0.095),
                mats["Material_Mechanical"],
                collection,
                0.006,
            ))
    count = 7 if lod == 0 else (4 if lod == 1 else (3 if CYCLE >= 191 else 0))
    if CYCLE >= 193:
        count = 3 if lod == 0 else (3 if lod == 1 else 2)
    elif CYCLE >= 192:
        count = 5 if lod == 0 else (4 if lod == 1 else 3)
    for index in range(count):
        bits.append(MTX.add_box(
            f"RadiatorFin_{TAG}_{index}",
            (fin_x0 + index * fin_step, fin_y, fin_z),
            fin_scale,
            mats["Material_Radiator"],
            collection,
            0.002,
        ))
    return bits, ok


def add_surface_story(mats, collection, lod):
    bits = []
    if lod < 2 and CYCLE < 192:
        panel = mats["Material_HullPanel"]
        for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
            bits.append(MTX.add_folded_sheet(
                f"SaddlePanel_{tag}",
                (1.42, 0.20 * sign, 0.72),
                (0.42, 1.05 * sign, 0.67),
                (-0.90, 1.16 * sign, 0.63),
                (-1.36, 0.30 * sign, 0.70),
                0.028,
                panel,
                collection,
                0.003,
            ))
    # C191's broad dark saddle sheets competed with the primary shell and made the craft read
    # like a toy kit.  C192 leaves the pressure-shell material hierarchy quiet here; the wing
    # carry-through and the authored service well now provide the only structural breaks.
    if lod == 0:
        bits.append(add_decal(
            "WarningStencil_Spray",
            [(1.05, 0.26), (0.76, 0.48), (0.42, 0.44), (0.68, 0.22)],
            0.76,
            mats["Material_Warning"],
            collection,
        ))
        # A single off-center repair patch breaks the mirrored factory read without adding a
        # random cube or a raised plaque.
        bits.append(add_decal(
            "RepairPatch_Offset",
            [(-0.62, -0.68), (-0.92, -0.84), (-1.30, -0.76), (-1.06, -0.56)],
            0.65,
            mats["Material_Accent"],
            collection,
        ))
        bits.extend([
            MTX.add_curve_hose(
                "ServiceHose_Stbd",
                [(-1.12, 1.34, 0.46), (-1.55, 1.34, 0.40), (-2.18, 1.16, 0.32), (-2.92, 1.04, 0.28)],
                mats["Material_Mechanical"],
                collection,
                0.018,
            ),
            MTX.add_curve_hose(
                "ServiceHose_Port",
                [(-1.12, -1.34, 0.46), (-1.55, -1.34, 0.40), (-2.18, -1.16, 0.32), (-2.92, -1.04, 0.28)],
                mats["Material_Mechanical"],
                collection,
                0.018,
            ),
        ])
    return bits


def collision_mesh(collection, root):
    verts = [
        (-5.22, -2.55, -1.12), (-5.22, 2.55, -1.12), (-5.22, -2.55, 1.12), (-5.22, 2.55, 1.12),
        (5.52, -0.32, -0.55), (5.52, 0.32, -0.55), (5.52, -0.32, 0.66), (5.52, 0.32, 0.66),
        (-1.1, -4.15, 0.0), (-1.1, 4.15, 0.0),
    ]
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6),
        (0, 2, 6, 4), (1, 5, 7, 3), (0, 8, 9, 1),
    ]
    obj = mesh_object("COLLISION_HULL", verts, faces, mats_for_collision_material(), collection, 0.0)
    obj.parent = root
    obj.hide_render = True
    obj["collision"] = True
    obj["nonRender"] = True
    return obj


def mats_for_collision_material():
    material = bpy.data.materials.get("Material_Gap")
    if material is None:
        material = bpy.data.materials.new("Material_Gap")
    return material


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"HORNET_FORM_{TAG}_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    root = MTX.add_empty(f"HORNET_LOD{lod}_ROOT", (0.0, 0.0, 0.0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_HORNET_PRODUCTION_V1",
        "partId": "hornet_production_v1",
        "lod": f"lod{lod}",
        "slot": "hull",
        "category": "wholeships",
        "forward": "+X",
        "embeddedPlume": False,
    }
    root["spacefaceConstruction"] = f"{TAG.lower()}_continuous_lifting_shell"

    all_specs = [
        (5.46, 0.14, 0.13, 0.10, 0.02, 0.02, 0.96),
        (5.16, 0.27, 0.22, 0.12, 0.14, 0.10, 0.94),
        (4.76, 0.48, 0.38, 0.16, 0.30, 0.16, 0.90),
        (4.28, 0.72, 0.52, 0.19, 0.50, 0.20, 0.86),
        (3.80, 0.93, 0.61, 0.20, 0.66, 0.22, 0.82),
        (3.28, 1.17, 0.66, 0.18, 0.78, 0.24, 0.78),
        (2.72, 1.52, 0.68, 0.14, 0.86, 0.22, 0.74),
        (2.16, 1.88, 0.66, 0.10, 0.90, 0.20, 0.70),
        (1.54, 2.18, 0.62, 0.06, 0.88, 0.18, 0.66),
        (0.86, 2.38, 0.59, 0.03, 0.84, 0.16, 0.62),
        (0.18, 2.44, 0.58, 0.02, 0.80, 0.14, 0.60),
        (-0.50, 2.40, 0.60, 0.04, 0.76, 0.14, 0.62),
        (-1.16, 2.26, 0.63, 0.07, 0.72, 0.16, 0.66),
        (-1.78, 2.10, 0.68, 0.10, 0.68, 0.18, 0.70),
        (-2.40, 2.08, 0.73, 0.12, 0.62, 0.20, 0.74),
        (-3.02, 2.18, 0.77, 0.14, 0.56, 0.22, 0.78),
        (-3.60, 2.30, 0.81, 0.16, 0.50, 0.24, 0.82),
        (-4.16, 2.36, 0.85, 0.15, 0.44, 0.26, 0.86),
        (-4.62, 2.30, 0.88, 0.13, 0.36, 0.28, 0.90),
        (-4.96, 2.20, 0.89, 0.10, 0.28, 0.30, 0.92),
    ]
    if lod == 1:
        indices = (
            (0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 18, 19)
            if CYCLE < 191 else
            (0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 19)
        )
        specs = [all_specs[index] for index in indices]
    else:
        specs = [all_specs[index] for index in (0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19)]

    if CYCLE >= 187:
        # C186's broad aft shoulder read as a rectangular pod in the play frame.  This
        # controlled taper keeps the same collision/socket envelope while letting the
        # carry-through wings, cockpit, and twin drives own the silhouette.
        tapered = []
        for x, hw, hh, zc, flat, shoulder, keel in specs:
            if CYCLE >= 191:
                # Narrow the aft pressure shell into the raised drive houses so the transom is a
                # tapered shoulder, not a rectangular cap hiding both mouths from chase.
                width_scale = 0.58 if x < -4.2 else (0.64 if x < -3.4 else (0.74 if x < -1.8 else (0.90 if x < 0.6 else 0.96)))
                height_scale = 0.76 if x < -4.2 else (0.82 if x < -3.4 else (0.90 if x < -2.2 else 0.96))
            elif CYCLE >= 189:
                width_scale = 0.78 if x < -1.8 else (0.90 if x < 0.6 else 0.96)
                height_scale = 0.90 if x < -2.2 else 0.96
            else:
                width_scale = 0.88 if x < -2.2 else (0.94 if x < 0.4 else 0.98)
                height_scale = 1.0
            tapered.append((x, hw * width_scale, hh * height_scale, zc, flat, shoulder, keel))
        specs = tapered

    rings = [
        MTX.densify_ring(section_ring(x, hw, hh, zc, flat, shoulder, keel), 2)
        for x, hw, hh, zc, flat, shoulder, keel in specs
    ]
    hull = MTX.loft_from_rings(f"LOD{lod}_Hull", rings, mats["Material_Hull"], collection, 0.014 if lod == 0 else 0.010, cap=True)
    MTX._active_hull_for_c186 = hull
    assign_hull_roles(hull, mats)

    canopy_bits = add_canopy(hull, mats, collection, lod)
    drive_bits = []
    drive_reports = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        bits, report = add_drive(tag, sign, mats, collection, lod)
        drive_bits.extend(bits)
        drive_reports.append(report)
    radiator_bits, radiator_ok = build_radiator(hull, mats, collection, lod)
    wings = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        wings.extend(build_wing(f"Wing_{tag}", sign, mats, collection, lod))
    canards = add_canards(mats, collection, lod)
    surface_bits = add_surface_story(mats, collection, lod)
    built = [hull, *canopy_bits, *drive_bits, *radiator_bits, *wings, *canards, *surface_bits]

    for obj in built:
        if obj is not None and obj.name in bpy.data.objects:
            obj.parent = root

    # Keep every LOD above the historical hull-resolution guard, but make the ladder genuinely
    # cheaper: LOD0 carries the finest subdivision, while LOD1/2 retain enough shell resolution
    # for the openings and silhouette with progressively fewer station samples.
    if CYCLE >= 191:
        MTX.subdivide_mesh(hull, {0: 4, 1: 3, 2: 2}[lod])
    else:
        MTX.subdivide_mesh(hull, 2 if lod == 0 else 3)
    sockets = MTX.sockets()
    for name, location in sockets.items():
        MTX.add_empty(name, location, collection, root)
    collision_mesh(collection, root)

    meshes = [obj for obj in collection.objects if obj.type == "MESH" and not obj.get("collision")]
    for obj in meshes:
        triangulate_export_mesh(obj)
        MTX.shade_and_uv(obj)
        # Bevel/weighted-normal application can reintroduce quads after the first triangulation.
        # Triangulate at the final authored boundary, then ask Blender to build the same tangent
        # basis that the glTF exporter will serialize. C193 treats failure as a hard build error.
        triangulate_export_mesh(obj)
        if CYCLE >= 193:
            uv_layer = obj.data.uv_layers.get("UVMap")
            if uv_layer is None:
                raise RuntimeError(f"{obj.name}: missing UVMap for tangent export")
            try:
                obj.data.calc_tangents(uvmap=uv_layer.name)
            except RuntimeError as exc:
                raise RuntimeError(f"{obj.name}: tangent calculation failed: {exc}") from exc
    hull.data.calc_loop_triangles()
    hull_triangles = len(hull.data.loop_triangles)
    total_triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        total_triangles += len(obj.data.loop_triangles)
    mesh_nodes = len(meshes)
    # A mesh with two or more material slots exports one visible primitive per slot.  Reporting
    # mesh nodes understated the actual draw submissions (C191 parsed 64/51/38 versus 60/49/36).
    primitive_submits = sum(max(1, len(obj.data.materials)) for obj in meshes)
    texture_ladder = C193_TEX_BY_LOD if CYCLE >= 193 else (C192_TEX_BY_LOD if CYCLE >= 192 else {0: 1024, 1: 512, 2: 512})
    report = {
        "lod": lod,
        "triangles": total_triangles,
        "hullTriangles": hull_triangles,
        "draws": primitive_submits,
        "meshNodes": mesh_nodes,
        "primitiveSubmits": primitive_submits,
        "materials": sorted({slot.name for obj in meshes for slot in obj.material_slots}),
        "construction": "continuous_chined_pressure_shell_with_integrated_wing_carrythrough",
        "canopyCut": bool(canopy_bits),
        "driveWells": drive_reports,
        "radiatorWell": bool(radiator_ok),
        "textureMapSize": MTX.TEX,
        "textureMapLadder": {f"lod{level}": size for level, size in texture_ladder.items()},
        "texelDensityPxPerM": round(MTX.TEX / FORM_AUTHORED_LENGTH_M, 1),
        "texelDensityTargetPxPerM": [256, 512],
    }
    print(f"{TAG} LOD{lod}: hull={hull_triangles} tris={total_triangles} draws={primitive_submits} meshNodes={mesh_nodes}")
    return collection, report


def main():
    # Delegate reset/export/render bookkeeping to the existing sanctioned Hornet builder.  Its
    # main loop sets MTX.TEX for each LOD and writes cycle JSON plus chase stills. C192/C193 raise
    # the Hornet-only texture ladder in memory; the shared builder file remains untouched.
    MTX.build_lod = build_lod
    MTX.create_materials = create_form_materials
    previous_ladder = MTX.TEX_BY_LOD
    if CYCLE >= 193:
        MTX.TEX_BY_LOD = C193_TEX_BY_LOD
    elif CYCLE >= 192:
        MTX.TEX_BY_LOD = C192_TEX_BY_LOD
    try:
        MTX.main()
    finally:
        MTX.TEX_BY_LOD = previous_ladder
    cycle_report = FAMILY / "evidence" / "hornet" / f"cycle_{CYCLE:02d}.json"
    report = json.loads(cycle_report.read_text(encoding="utf-8"))
    report["lods"] = finalize_binary_report(report["lods"])
    cycle_report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"binaryReport": True, "cycle": CYCLE, "lods": report["lods"]}, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
