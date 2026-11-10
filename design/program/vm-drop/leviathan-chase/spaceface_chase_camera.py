"""Live SpaceFace chase camera for flyable-ship remaster stills.

The game is a tilted top-down chase, not a hero studio. Hornet spent a long
loop modeling seats and cabin kits that only existed in `bay_interior` crops.
Those cameras are illegal as cycle stills.

Matches live `src/render/camera.js` + ARCHITECTURE §0.14 pose (three.js +Y up, transcribed to
Blender +Z up - see chase_offset):

- vertical FOV 50°
- tilt 60° from horizontal
- offset (0, D * sin 60°, −D * cos 60°) at heading 0
- look-at the ship; never follow yaw
- D default = CHASE_ZOOM_DEFAULT 144
- D close = CHASE_ZOOM_CLOSE 58 (optional tighter player zoom)

At 1600×1000 the starter is ~10.6% of frame width at D=144; Hornet ~15–16%.
If a "play" still has the ship filling most of the frame, it is a beauty shot
and does not count.

A camera inside the hull, on a seat, or closer than D=58 is not a chase still.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

TILT_DEG = 60.0
FOV_V_DEG = 50.0
DISTANCE_DEFAULT = 144.0
DISTANCE_CLOSE = 58.0

# Occupancy bands at 1600-wide, from CAMERA_VISIBLE_BUBBLE.md + close-zoom scale.
PLAY_CHASE_WIDTH_FRAC = (0.08, 0.22)
PLAY_CHASE_CLOSE_WIDTH_FRAC = (0.20, 0.42)


def chase_offset(distance=DISTANCE_DEFAULT, heading_deg=0.0):
    """World-space camera offset. heading_deg 0 matches the live controller.

    Axis mapping matters. The live controller (src/render/camera.js:647) offsets the camera in
    three.js axes, where +Y is UP: (0, D*sin60, -D*cos60) - mostly above the ship, slightly
    behind, looking down at the dorsal side. Whole-ship GLBs are exported Blender Z-up ->
    glTF Y-up (Blender +Z dorsal becomes glTF/game +Y up), so the same pose in this scene's
    Blender axes is: x = game x, y = -game z, z = game y:

        (horiz*sin h, horiz*cos h, D*sin tilt)

    Writing the game formula verbatim in Blender axes put the camera below the keel, and every
    cycle still through C151 photographed the belly mirrored - which is why no canopy or wing
    planform could ever read while keel hardware dominated the silhouette.
    """
    tilt = math.radians(TILT_DEG)
    heading = math.radians(heading_deg)
    horiz = distance * math.cos(tilt)
    return (
        horiz * math.sin(heading),
        horiz * math.cos(heading),
        distance * math.sin(tilt),
    )


def apply_chase_camera(camera, *, distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=(0.0, 0.0, 0.0)):
    """Pose `camera` as the live chase camera. Vertical FOV, not a mm lens."""
    focus_v = Vector(focus)
    camera.location = Vector(chase_offset(distance, heading_deg)) + focus_v
    camera.data.type = "PERSP"
    camera.data.sensor_fit = "VERTICAL"
    camera.data.lens_unit = "FOV"
    camera.data.angle = math.radians(FOV_V_DEG)
    direction = focus_v - camera.location
    if direction.length < 1e-6:
        raise ValueError("chase camera focus coincides with camera location")
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return camera


def render_chase_still(camera, path, *, distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=(0.0, 0.0, 0.0)):
    apply_chase_camera(camera, distance=distance, heading_deg=heading_deg, focus=focus)
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    return out


def render_cycle_chase_stills(camera, out_dir, *, focus=(0.0, 0.0, 0.0)):
    """The only three stills that count as a remaster cycle."""
    out = Path(out_dir)
    stills = {
        "play_chase.png": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0},
        "play_chase_abeam.png": {"distance": DISTANCE_DEFAULT, "heading_deg": 90.0},
        "play_chase_close.png": {"distance": DISTANCE_CLOSE, "heading_deg": 0.0},
    }
    written = {}
    for name, pose in stills.items():
        written[name] = render_chase_still(
            camera,
            out / name,
            distance=pose["distance"],
            heading_deg=pose["heading_deg"],
            focus=focus,
        )
    return written
