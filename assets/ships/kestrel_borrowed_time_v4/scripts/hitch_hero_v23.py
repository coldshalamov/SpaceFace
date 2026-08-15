"""Hitch hero V23 / cycle 14: hide the underframe slabs that still ARE the deck."""
from __future__ import annotations

import bpy

from hitch_hero_v22 import apply_hitch_hero_v22
from material_truth_v6 import _root

PASS_ID = "kestrel-hitch-hero-v23"
HIDE_PREFIXES = (
    "V6_SponsonUnderframe_",
)


def apply_hitch_hero_v23() -> dict:
    prior = apply_hitch_hero_v22()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v23",
        "passId": PASS_ID,
        "method": "hide V6 underframe slabs so pits are the sponson, not a deck",
        "hidden": hidden,
        "objectsAdded": 0,
    }
    _root()["hitchHeroPassV23"] = {
        "passId": PASS_ID,
        "hiddenCount": int(len(hidden)),
    }
    return report
