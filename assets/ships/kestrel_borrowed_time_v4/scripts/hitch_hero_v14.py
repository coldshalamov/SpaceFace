"""Hitch hero V14: remove leftover toy gear poles. Keep the open throat."""
from __future__ import annotations

from hitch_hero_v13 import apply_hitch_hero_v13
from material_truth_v6 import _root

PASS_ID = "kestrel-hitch-hero-v14"
HIDE_PREFIXES = (
    "V11_MainOleo",
    "V11_MainPad",
    "V11_MainScissor",
    "V11_GearHouse",
    "V10_Gear",
    "Landing_Strut",
    "Landing_Damper",
    "Landing_Skid",
)


def apply_hitch_hero_v14() -> dict:
    prior = apply_hitch_hero_v13()
    hidden = []
    import bpy
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(p) for p in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v14",
        "passId": PASS_ID,
        "prior": prior,
        "hidden": hidden,
        "objectsAdded": 0,
    }
    _root()["hitchHeroPassV14"] = report
    return report
