"""Hitch hero V15 / cycle 06: hide the remaining original landing poles."""
from __future__ import annotations

from hitch_hero_v14 import apply_hitch_hero_v14
from material_truth_v6 import _root

PASS_ID = "kestrel-hitch-hero-v15"
HIDE_PREFIXES = (
    "Landing_Strut",
    "Landing_Damper",
    "Landing_Skid",
)


def apply_hitch_hero_v15() -> dict:
    prior = apply_hitch_hero_v14()
    hidden = []
    import bpy
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(p) for p in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v15",
        "passId": PASS_ID,
        "prior": prior,
        "hidden": hidden,
        "objectsAdded": 0,
    }
    _root()["hitchHeroPassV15"] = report
    return report
