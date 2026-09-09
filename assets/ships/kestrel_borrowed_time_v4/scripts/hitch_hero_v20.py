"""Hitch hero V20 / cycle 11: hide the remaining sponson lids.

Cycle 10 drive is a keep. Three-quarter still sees a closed DIE LAUGHING
deck because the V6 shoulder-armor plates were only nicked, not removed.
Hide those lids entirely so the table camera looks down onto underframes
and open pits.
"""
from __future__ import annotations

import bpy

from hitch_hero_v19 import apply_hitch_hero_v19
from material_truth_v6 import _root

PASS_ID = "kestrel-hitch-hero-v20"
HIDE_PREFIXES = (
    "V6_ShoulderArmor_",
    "V16_HatWeb_",
    "V16_HatBottom_",
    "V16_HatTop_",
    "V16_HatRib_",
    "V17_DeckStrip_",
)


def apply_hitch_hero_v20() -> dict:
    prior = apply_hitch_hero_v19()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v20",
        "passId": PASS_ID,
        "method": "hide remaining sponson lids after cycle 10 drive keep",
        "hidden": hidden,
        "objectsAdded": 0,
    }
    _root()["hitchHeroPassV20"] = {
        "passId": PASS_ID,
        "hiddenCount": int(len(hidden)),
    }
    return report
