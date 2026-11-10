"""Hitch hero V22 / cycle 13: cut holes through the underframe deck.

Cycle 12 hid the stencil card. Reviews still could not look down into wells
because V6_SponsonUnderframe_* are thick slabs that ARE the deck. Punch
large openings through those slabs.
"""
from __future__ import annotations

import bpy

from hitch_hero_v16 import _cut_box
from hitch_hero_v21 import apply_hitch_hero_v21
from material_truth_v6 import _root

PASS_ID = "kestrel-hitch-hero-v22"


def apply_hitch_hero_v22() -> dict:
    prior = apply_hitch_hero_v21()
    cuts = []
    well_xs = (3.55, 0.35, -2.85, -6.35)
    for obj in list(bpy.data.objects):
        name = obj.name or ""
        if obj.hide_render:
            continue
        if not (
            name.startswith("V6_SponsonUnderframe_")
            or name.startswith("V6_ShoulderArmor_")
        ):
            continue
        sign = 1.0 if "Starboard" in name else -1.0
        for index, x in enumerate(well_xs):
            ok = _cut_box(
                obj, f"V22_DeckCut_{name}_{index}",
                (x, 4.80 * sign, 0.55), (0.95, 1.15, 0.55),
            )
            cuts.append(f"{name}:{index}={ok}")
    report = {
        "schema": "spaceface.hitchHero.v22",
        "passId": PASS_ID,
        "method": "boolean-cut the underframe deck so the table looks into pits",
        "priorPass": "v21",
        "booleanCuts": cuts,
        "objectsAdded": 0,
    }
    _root()["hitchHeroPassV22"] = {
        "passId": PASS_ID,
        "cuts": int(len(cuts)),
    }
    return report
