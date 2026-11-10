"""Live SpaceFace Asteroid Works camera for authored-asset stills.

The mine is seen straight down through a 31° perspective camera. Cells are
2.2 world units square. Every review still for PQ-131 is taken with this
camera, never a studio three-quarter.

Matches live `src/ui/asteroid/asteroidRenderer3d.js` (three.js +Y up on the
cut plane, +Z toward the camera). Whole-part GLBs are authored Blender Z-up,
so this file poses in Blender axes: the camera looks straight down the world
-Z axis; the object's +Z is up.

    D = (res_y / px_per_cell * CELL_WU / 2) / tan(FOV_V / 2)

Straight-on is a CAMERA rule. It means the camera looks straight down. It
does not mean flattening the model, orthographic projection, or removing
depth. PERSP, never ORTHO. No fog, ever.

Writing a game Y-up offset verbatim in Blender axes is the same class of
bug that put the chase camera below the keel for 151 cycles. Do not.
"""
from __future__ import annotations

import math
from pathlib import Path

# Live renderer constants — cite asteroidRenderer3d.js.
CELL_WU = 2.2          # asteroidRenderer3d.js:62
FOV_V_DEG = 31.0       # asteroidRenderer3d.js:70 (three.js PerspectiveCamera.fov is vertical)
WORK_COLS = 16         # asteroidRenderer3d.js:75

PX_PER_CELL_WORK = 120.0
PX_PER_CELL_SITE = 19.0
DEFAULT_RES = (1920, 1080)

# Independent check target for the site dolly. Live work-register math is
# half-extent / tan(FOV/2); the site register in asteroidRenderer3d.js dollies
# to ~223 wu. Our 19 px/cell derivation must stay within 3% of that number.
SITE_DOLLY_WU = 223.0

# works_edge: same camera as works_top; the object is pushed toward the frame
# edge so side walls read. Never tilt the camera.
EDGE_INSET = 0.85


def works_distance(px_per_cell, res_y=DEFAULT_RES[1]):
    """Camera distance along +Z for a target pixels-per-cell at a vertical resolution."""
    extent_y = (float(res_y) / float(px_per_cell)) * CELL_WU
    half_h = extent_y * 0.5
    return half_h / math.tan(math.radians(FOV_V_DEG) * 0.5)


def works_frustum(px_per_cell, res_x=DEFAULT_RES[0], res_y=DEFAULT_RES[1]):
    extent_y = (float(res_y) / float(px_per_cell)) * CELL_WU
    extent_x = extent_y * (float(res_x) / float(res_y))
    return extent_x, extent_y


def measured_px_per_cell(distance, res_y=DEFAULT_RES[1]):
    half_h = float(distance) * math.tan(math.radians(FOV_V_DEG) * 0.5)
    extent_y = half_h * 2.0
    return (float(res_y) * CELL_WU) / extent_y


def works_edge_offset(dir_xy, px_per_cell=PX_PER_CELL_WORK, res=DEFAULT_RES, inset=EDGE_INSET):
    """In-plane object offset that parks a part at the frame edge. Camera does not move."""
    dx, dy = dir_xy
    length = math.hypot(dx, dy) or 1.0
    extent_x, extent_y = works_frustum(px_per_cell, res[0], res[1])
    return (
        (dx / length) * (extent_x * 0.5) * inset,
        (dy / length) * (extent_y * 0.5) * inset,
        0.0,
    )


FRAMINGS = {
    "works_top": {"px_per_cell": PX_PER_CELL_WORK, "edge": False},
    "works_edge": {"px_per_cell": PX_PER_CELL_WORK, "edge": True},
    "works_site": {"px_per_cell": PX_PER_CELL_SITE, "edge": False},
}


def works_pose(framing="works_top", focus=(0.0, 0.0, 0.0), res=DEFAULT_RES, edge_dir=(1.0, 0.0)):
    """Camera location, look-at, and optional object offset for a named framing."""
    spec = FRAMINGS[framing]
    distance = works_distance(spec["px_per_cell"], res[1])
    fx, fy, fz = focus
    # Camera sits on +Z looking down -Z at the focus. Object offset is applied
    # by the caller for works_edge; the camera itself never tilts.
    location = (fx, fy, fz + distance)
    look_at = (fx, fy, fz)
    object_offset = works_edge_offset(edge_dir, spec["px_per_cell"], res) if spec["edge"] else (0.0, 0.0, 0.0)
    return {
        "framing": framing,
        "distance": distance,
        "location": location,
        "look_at": look_at,
        "object_offset": object_offset,
        "px_per_cell": spec["px_per_cell"],
    }


def apply_works_camera(camera, *, framing="works_top", focus=(0.0, 0.0, 0.0), res=DEFAULT_RES,
                       edge_dir=(1.0, 0.0)):
    """Pose `camera` as the live works camera. Vertical FOV, not a mm lens. PERSP, never ORTHO."""
    from mathutils import Vector

    pose = works_pose(framing, focus=focus, res=res, edge_dir=edge_dir)
    focus_v = Vector(pose["look_at"])
    camera.location = Vector(pose["location"])
    camera.data.type = "PERSP"
    camera.data.sensor_fit = "VERTICAL"
    camera.data.lens_unit = "FOV"
    camera.data.angle = math.radians(FOV_V_DEG)
    direction = focus_v - camera.location
    if direction.length < 1e-6:
        raise ValueError("works camera focus coincides with camera location")
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.clip_start = 0.1
    camera.data.clip_end = max(1000.0, float(pose["distance"]) * 4.0)
    # Fog is illegal on this camera. Clear it if a scene leftover set it.
    if hasattr(camera.data, "show_mist"):
        camera.data.show_mist = False
    return pose


def _offset_targets(target):
    import bpy

    if target is None:
        return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if isinstance(target, (list, tuple)):
        return [obj for obj in target if obj is not None]
    return [target]


def render_works_still(camera, path, *, framing="works_top", focus=(0.0, 0.0, 0.0),
                       target=None, edge_dir=(1.0, 0.0), res=DEFAULT_RES):
    import bpy
    from mathutils import Vector

    pose = apply_works_camera(camera, framing=framing, focus=focus, res=res, edge_dir=edge_dir)
    objects = _offset_targets(target)
    offset = Vector(pose["object_offset"])
    originals = [(obj, obj.location.copy()) for obj in objects]
    try:
        if offset.length > 1e-9:
            for obj in objects:
                obj.location = obj.location + offset
            bpy.context.view_layer.update()
        if framing == "works_edge":
            top = works_pose("works_top", focus=focus, res=res)
            if pose["object_offset"] == top["object_offset"]:
                raise AssertionError("works_edge object_offset is identical to works_top")
            if not originals:
                raise AssertionError("works_edge has no target object to offset")
            moved = False
            for obj, orig in originals:
                if (obj.location - orig).length > 1e-6:
                    moved = True
                    break
            if not moved:
                raise AssertionError(
                    "works_edge object position matches works_top; object_offset was not applied"
                )
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        return out
    finally:
        for obj, orig in originals:
            obj.location = orig
        bpy.context.view_layer.update()


def self_check(res=DEFAULT_RES):
    """Derive distances against independent live-renderer numbers, not the inverse of this file."""
    lines = []
    targets = (
        ("works_top", PX_PER_CELL_WORK),
        ("works_edge", PX_PER_CELL_WORK),
        ("works_site", PX_PER_CELL_SITE),
    )
    print(f"works camera self_check at {res[0]}x{res[1]}")
    print(f"  CELL_WU={CELL_WU} FOV_V_DEG={FOV_V_DEG} WORK_COLS={WORK_COLS}")
    for name, target in targets:
        pose = works_pose(name, res=res)
        measured = measured_px_per_cell(pose["distance"], res[1])
        err = abs(measured - target) / target
        line = (
            f"  {name}: D={pose['distance']:.4f} wu  "
            f"measured={measured:.4f} px/cell  target={target:.0f}  err={err * 100:.4f}%"
        )
        print(line)
        lines.append(line)
        if err > 0.01:
            raise AssertionError(f"{name} px/cell {measured} is more than 1% off {target}")

    top = works_pose("works_top", res=res)
    edge = works_pose("works_edge", res=res)
    print(
        f"  works_edge vs works_top: camera_location identical="
        f"{edge['location'] == top['location']}  "
        f"object_offset edge={edge['object_offset']} top={top['object_offset']}"
    )
    if edge["location"] != top["location"]:
        raise AssertionError("works_edge camera location must match works_top; only the object moves")
    if edge["object_offset"] == top["object_offset"]:
        raise AssertionError("works_edge object_offset is identical to works_top")

    site = works_pose("works_site", res=res)
    site_err = abs(site["distance"] - SITE_DOLLY_WU) / SITE_DOLLY_WU
    print(
        f"  site dolly: derived D={site['distance']:.4f} wu  "
        f"checked against {SITE_DOLLY_WU:g} wu "
        f"(asteroidRenderer3d.js live site register ~223)  "
        f"err={site_err * 100:.4f}%  fail if >3%"
    )
    if site_err > 0.03:
        raise AssertionError(
            f"works_site distance {site['distance']} is more than 3% off {SITE_DOLLY_WU}"
        )

    half_h = top["distance"] * math.tan(math.radians(FOV_V_DEG) * 0.5)
    extent_y = half_h * 2.0
    extent_x = extent_y * (float(res[0]) / float(res[1]))
    target_x = WORK_COLS * CELL_WU
    extent_err = abs(extent_x - target_x) / target_x
    print(
        f"  work horizontal extent: derived from D={top['distance']:.4f} wu and "
        f"{res[0]}:{res[1]} aspect -> {extent_x:.4f} wu  "
        f"checked against WORK_COLS*CELL_WU={WORK_COLS}*{CELL_WU}={target_x:.1f} wu  "
        f"err={extent_err * 100:.4f}%"
    )
    if extent_err > 0.01:
        raise AssertionError(
            f"work horizontal extent {extent_x} is more than 1% off {target_x}"
        )

    print("  self_check OK")
    return lines


if __name__ == "__main__":
    self_check()
