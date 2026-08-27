"""Pure chase-still occupancy contract shared by Blender authoring tools."""
from __future__ import annotations

DISTANCE_DEFAULT = 144.0
DISTANCE_CLOSE = 58.0

PLAY_CHASE_WIDTH_FRAC = (0.08, 0.22)
_CLOSE_SCALE = DISTANCE_DEFAULT / DISTANCE_CLOSE
PLAY_CHASE_CLOSE_WIDTH_FRAC = tuple(
    bound * _CLOSE_SCALE for bound in PLAY_CHASE_WIDTH_FRAC
)


def occupancy_in_band(width_frac, *, close=False, cropped=False):
    """Return whether a whole-ship still satisfies its camera's width band."""
    band = PLAY_CHASE_CLOSE_WIDTH_FRAC if close else PLAY_CHASE_WIDTH_FRAC
    return not cropped and band[0] <= width_frac <= band[1]
