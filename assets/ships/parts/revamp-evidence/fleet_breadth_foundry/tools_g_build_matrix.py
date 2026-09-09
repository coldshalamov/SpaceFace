#!/usr/bin/env python3
"""Lane G — deterministic fleet composition matrix builder.

Reads foundry manifests + hard-coded audit cites (from repetition-audit.json /
partsLibrary.js). Emits fleet_composition_matrix.json + .md.

Fully seeded / no wall-clock / no uuid. Two runs → byte-identical outputs.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]  # sf-fleet-breadth
# .../fleet_breadth_foundry/tools_g... → parents[0]=foundry, [1]=revamp-evidence, [2]=parts, [3]=ships, [4]=assets — wrong
# File is at: assets/ships/parts/revamp-evidence/fleet_breadth_foundry/tools_g_build_matrix.py
# parents[0]=fleet_breadth_foundry, [1]=revamp-evidence, [2]=parts, [3]=ships, [4]=assets, [5]=repo root
ROOT = Path(__file__).resolve().parents[5]
FOUNDRY = ROOT / "assets/ships/foundry/fleet_breadth_20260720"
OUT_DIR = ROOT / "assets/ships/parts/revamp-evidence/fleet_breadth_foundry"
EVIDENCE = OUT_DIR


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def kit_lookup(kit_manifest: dict) -> dict[str, int]:
    out = {}
    for p in kit_manifest["pieces"]:
        key = f"kit_{p['family']}_v{p['variant']:02d}"
        out[key] = int(p["tris"])
    return out


def pack_cost(lookup: dict[str, int], pieces: list[tuple[str, int]]) -> tuple[int, list[str]]:
    """pieces = [(kit_id, count), ...]. Returns (tris, expanded labels)."""
    total = 0
    labels = []
    for kid, count in pieces:
        if kid not in lookup:
            raise KeyError(f"missing kit piece {kid}")
        t = lookup[kid] * count
        total += t
        labels.append(f"{kid}×{count} ({lookup[kid]}×{count}={t})")
    return total, labels


def wear(fresh: float, service: float, patched: float) -> dict:
    s = round(fresh + service + patched, 6)
    if abs(s - 1.0) > 1e-6:
        raise ValueError(f"wear tiers must sum to 1, got {s}")
    return {"fresh": fresh, "serviceWorn": service, "patched": patched}


def cell(
    faction: str,
    role: str,
    current_live: dict,
    proposed: dict,
    distinguished_by: list[str] | None = None,
    bible_refs: list[str] | None = None,
    notes: str | None = None,
) -> dict:
    c = {
        "faction": faction,
        "role": role,
        "currentLive": current_live,
        "proposed": proposed,
    }
    if distinguished_by:
        c["distinguishedBy"] = distinguished_by
    if bible_refs:
        c["bibleRefs"] = bible_refs
    if notes:
        c["notes"] = notes
    return c


def main() -> None:
    kit_m = load_json(FOUNDRY / "kit/kit_manifest.json")
    var_m = load_json(FOUNDRY / "variants/variants_manifest.json")
    hero_m = load_json(FOUNDRY / "variants/hero_manifest.json")
    mat_m = load_json(FOUNDRY / "materials/material_profiles.json")
    dec_m = load_json(FOUNDRY / "textures/decals_atlas.json")
    sc_m = load_json(FOUNDRY / "scenery/scenery_manifest.json")
    audit = load_json(EVIDENCE / "repetition-audit.json")

    kit = kit_lookup(kit_m)
    var_by_stem = {v["stem"]: v for v in var_m["variants"]}

    def vtris(stem: str) -> int:
        return int(var_by_stem[stem]["tris_added"])

    wasp_added = {
        "scn": hero_m["wasp"]["scn"]["tris_variant"] - hero_m["wasp"]["scn"]["tris_donor"],
        "mts": hero_m["wasp"]["mts"]["tris_variant"] - hero_m["wasp"]["mts"]["tris_donor"],
        "free": hero_m["wasp"]["free"]["tris_variant"] - hero_m["wasp"]["free"]["tris_donor"],
    }
    hub_tris = {k: int(v["tris"]) for k, v in hero_m["hub"].items()}

    # Shared kit packs (arithmetic from kit_manifest only)
    scn_fighter_kit = [
        ("kit_fastener_recessed_v01", 2),
        ("kit_rail_split_v01", 2),
        ("kit_armor_spacer_v01", 2),
        ("kit_weapon_collar_v01", 1),
        ("kit_sensor_housing_v01", 1),
    ]
    mts_fighter_kit = [
        ("kit_access_panel_v01", 2),
        ("kit_hatch_frame_v01", 1),
        ("kit_sensor_housing_v02", 2),
        ("kit_plate_lip_v01", 2),
        ("kit_vent_grid_v01", 1),
    ]
    dmc_industrial_kit = [
        ("kit_rivet_strip_v01", 2),
        ("kit_rivet_strip_v02", 1),
        ("kit_bracket_gusset_v01", 4),
        ("kit_plate_lip_v01", 2),
        ("kit_pipe_clamp_v01", 2),
        ("kit_vent_grid_v01", 1),
        ("kit_heat_shield_v01", 1),
    ]
    free_militia_kit = [
        ("kit_rivet_strip_v03", 1),
        ("kit_plate_lip_v02", 3),
        ("kit_pipe_clamp_v02", 2),
        ("kit_access_panel_v02", 1),
        ("kit_hatch_frame_v01", 1),
        ("kit_weld_seam_v01", 2),
    ]
    reach_scrap_kit = [
        ("kit_weld_seam_v01", 3),
        ("kit_weld_seam_v02", 2),
        ("kit_plate_lip_v03", 2),
        ("kit_armor_spacer_v02", 2),
        ("kit_weapon_collar_v02", 1),
        ("kit_bracket_gusset_v02", 2),
        ("kit_heat_shield_v02", 1),
    ]
    quiet_ghost_kit = [
        ("kit_sensor_housing_v03", 2),
        ("kit_access_panel_v03", 2),
        ("kit_hatch_frame_v02", 1),
        ("kit_pipe_clamp_v03", 1),
        ("kit_fastener_recessed_v02", 0),  # bible: bonded — zero fasteners placed; keep for cost 0
    ]
    quiet_ghost_kit = [p for p in quiet_ghost_kit if p[1] > 0]
    choir_zealot_kit = [
        ("kit_rail_split_v03", 2),
        ("kit_sensor_housing_v01", 1),
        ("kit_weapon_collar_v03", 1),
        ("kit_plate_lip_v01", 2),
        ("kit_rivet_strip_v04", 2),
        ("kit_heat_shield_v03", 1),
    ]
    scn_law_interceptor_kit = [
        ("kit_fastener_recessed_v02", 2),
        ("kit_rail_split_v02", 2),
        ("kit_armor_spacer_v03", 2),
        ("kit_hatch_frame_v01", 1),
        ("kit_sensor_housing_v01", 1),
        ("kit_weapon_collar_v01", 1),
    ]
    dmc_cradle_kit = dmc_industrial_kit  # same construction language
    free_cradle_kit = free_militia_kit
    mts_hauler_kit = [
        ("kit_access_panel_v01", 2),
        ("kit_hatch_frame_v02", 1),
        ("kit_sensor_housing_v02", 1),
        ("kit_pipe_clamp_v01", 2),
        ("kit_plate_lip_v01", 2),
        ("kit_vent_grid_v02", 1),
    ]
    scn_hauler_kit = [
        ("kit_fastener_recessed_v01", 3),
        ("kit_rail_split_v01", 2),
        ("kit_hatch_frame_v01", 1),
        ("kit_armor_spacer_v01", 2),
        ("kit_sensor_housing_v01", 1),
    ]
    free_hauler_kit = free_militia_kit
    scn_courier_kit = scn_hauler_kit
    mts_courier_kit = mts_hauler_kit
    free_courier_kit = free_militia_kit
    dmc_hauler_kit = dmc_industrial_kit
    quiet_smuggler_kit = quiet_ghost_kit
    free_smuggler_kit = free_militia_kit
    reach_pirate_mod_kit = reach_scrap_kit

    packs = {
        "scn_fighter": scn_fighter_kit,
        "mts_fighter": mts_fighter_kit,
        "dmc_industrial": dmc_industrial_kit,
        "free_militia": free_militia_kit,
        "reach_scrap": reach_scrap_kit,
        "quiet_ghost": quiet_ghost_kit,
        "choir_zealot": choir_zealot_kit,
        "scn_law": scn_law_interceptor_kit,
        "mts_hauler": mts_hauler_kit,
        "scn_hauler": scn_hauler_kit,
    }
    pack_tris = {}
    pack_labels = {}
    for name, pieces in packs.items():
        t, labels = pack_cost(kit, pieces)
        pack_tris[name] = t
        pack_labels[name] = labels

    # Also compute named packs used only once
    for name, pieces in [
        ("dmc_cradle", dmc_cradle_kit),
        ("free_cradle", free_cradle_kit),
        ("free_hauler", free_hauler_kit),
        ("scn_courier", scn_courier_kit),
        ("mts_courier", mts_courier_kit),
        ("free_courier", free_courier_kit),
        ("dmc_hauler", dmc_hauler_kit),
        ("quiet_smuggler", quiet_smuggler_kit),
        ("free_smuggler", free_smuggler_kit),
        ("reach_pirate_mod", reach_pirate_mod_kit),
    ]:
        t, labels = pack_cost(kit, pieces)
        pack_tris[name] = t
        pack_labels[name] = labels

    # Contrast axes used in distinguishedBy (bible § contrast table)
    AX = {
        "seg": "1 Segmentation",
        "paint": "2 Paint",
        "alloy": "3 Alloy",
        "rough": "4 Roughness",
        "edge": "5 Edge",
        "fast": "6 Fasteners",
        "heat": "7 Heat wear",
        "repair": "8 Repair",
        "decal": "9 Decals",
        "emis": "10 Emissive",
        "clean": "11 Cleanliness",
        "mod": "12 Modules",
    }

    # Live cites (read-only grammar)
    LIVE = {
        "wasp_patrol": {
            "defId": "ship_wasp",
            "visual": "wholeships/wasp_production_v1.glb",
            "cite": "partsLibrary.js:387-390 WHOLE_SHIP_FILE_BY_DEF_ID.ship_wasp; traffic.js:71-74 patrol/escort; visualOverrides.js:30-37",
        },
        "hauler": {
            "defId": "ship_mule",
            "visual": "wholeships/helios_span.glb",
            "cite": "partsLibrary.js:429-432 WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler; traffic.js:65-66,407",
        },
        "courier": {
            "defId": "ship_kestrel",
            "visual": "wholeships/helios_lark.glb",
            "cite": "partsLibrary.js:429-430 WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.courier; traffic.js:67-68 (player kestrel diverted)",
        },
        "miner": {
            "defId": "ship_pelican",
            "visual": "wholeships/helios_cradle.glb",
            "cite": "partsLibrary.js:429-431 WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner; traffic.js:69-70",
        },
        "express": {
            "defId": "ship_mule",
            "visual": "hulls/hull_freighter.glb",
            "cite": "traffic.js:83-84 trafficRole express NOT in WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE → HULL_FILE_BY_DEF_ID.ship_mule modular (partsLibrary.js:375)",
        },
        "smuggler": {
            "defId": "ship_drifter",
            "visual": "hulls/hull_multirole.glb",
            "cite": "traffic.js:75-76 smuggler; HULL_FILE_BY_DEF_ID.ship_drifter partsLibrary.js:371",
        },
        "rescue": {
            "defId": "ship_drifter",
            "visual": "hulls/hull_multirole.glb",
            "cite": "traffic.js:79-80 rescue; same modular multirole path as smuggler",
        },
        "pirate_traffic": {
            "defId": "ship_hornet",
            "visual": "hulls/hull_interceptor.glb",
            "cite": "traffic.js:77-78 pirate role; not in whole-ship traffic map → modular hull_interceptor",
        },
        "patrol_lawman": {
            "defId": "ship_hornet",
            "visual": "hulls/hull_interceptor.glb",
            "cite": "enemies.js:134-136 patrol_lawman; HULL_FILE_BY_DEF_ID.ship_hornet partsLibrary.js:378; high-sec pool world.js:129,1623-1624",
        },
        "customs_cutter": {
            "defId": "ship_hornet",
            "visual": "hulls/hull_interceptor.glb",
            "cite": "enemies.js:231-233 customs_cutter; same modular interceptor as patrol_lawman",
        },
        "reaver": {
            "defId": "ship_drifter",
            "visual": "wholeships/ashline_rig.glb",
            "cite": "partsLibrary.js:414-418 WHOLE_SHIP_FILE_BY_HOSTILE_ID.reaver_pirate; enemies.js:94-96",
        },
        "corsair": {
            "defId": "ship_hornet",
            "visual": "wholeships/ashline_rig.glb",
            "cite": "partsLibrary.js:414-418 WHOLE_SHIP_FILE_BY_HOSTILE_ID.corsair_raider (SHARED with reaver); enemies.js:114-116",
        },
        "swarmer": {
            "defId": "ship_wasp",
            "visual": "wholeships/ashline_dart.glb",
            "cite": "partsLibrary.js:415 WHOLE_SHIP_FILE_BY_HOSTILE_ID.wasp_swarmer; enemies.js:19-20",
        },
        "bruiser": {
            "defId": "ship_bastion",
            "visual": "wholeships/ashline_lode.glb",
            "cite": "partsLibrary.js:416 WHOLE_SHIP_FILE_BY_HOSTILE_ID.bruiser_brawler; enemies.js:55-57",
        },
        "lancer": {
            "defId": "ship_wasp",
            "visual": "wholeships/wasp_production_v1.glb",
            "cite": "enemies.js:36-38 lancer_sniper ship_wasp; NOT in WHOLE_SHIP_FILE_BY_HOSTILE_ID → production wasp (gap)",
        },
        "choir_zealot": {
            "defId": "ship_wasp",
            "visual": "wholeships/wasp_production_v1.glb",
            "cite": "enemies.js:251-253 choir_zealot ship_wasp; NOT in WHOLE_SHIP_FILE_BY_HOSTILE_ID → production wasp (gap)",
        },
        "quiet_ghost": {
            "defId": "ship_wasp",
            "visual": "wholeships/wasp_production_v1.glb",
            "cite": "enemies.js:273-275 quiet_ghost ship_wasp; NOT in WHOLE_SHIP_FILE_BY_HOSTILE_ID → production wasp (gap)",
        },
        "jackal": {
            "defId": "ship_drifter",
            "visual": "hulls/hull_multirole.glb",
            "cite": "enemies.js:179-180 mine_layer_jackal; not in hostile whole map → modular multirole",
        },
        "pd_screen": {
            "defId": "ship_bastion",
            "visual": "hulls/hull_corvette.glb",
            "cite": "enemies.js:205-207 pd_screen_escort; not in hostile whole map → modular hull_corvette",
        },
        "trade_hub": {
            "defId": "place_station_trade_hub",
            "visual": "places/place_station_trade_hub.glb",
            "cite": "partsLibrary.js:57-66 STATION_ARCHETYPE_FILES; sectorAnchors.js core trade hubs; world.js:1075",
        },
        "weapon_default": {
            "defId": "weapon_pulse_cannon",
            "visual": "weapons/weapon_pulse_cannon.glb",
            "cite": "partsLibrary.js:2669-2678 weaponRecordFor default barrel",
        },
    }

    def prop(
        donor: str,
        variant_parts: list[str],
        profile: str,
        wear_d: dict,
        decals: list[str],
        sockets: list[str],
        tris_added: int,
        materials_added: int,
        integration: str,
        tris_basis: str,
        kit_zone: str | None = None,
    ) -> dict:
        out = {
            "donor": donor,
            "variantParts": variant_parts,
            "materialProfile": profile,
            "wearTierDistribution": wear_d,
            "decalSet": decals,
            "socketsUsed": sockets,
            "expectedRuntimeCost": {
                "trisAdded": int(tris_added),
                "materialsAdded": int(materials_added),
                "texturesShared": True,
                "trisBasis": tris_basis,
            },
            "integrationRequirement": integration,
        }
        if kit_zone:
            out["kitPlacementZone"] = kit_zone
        return out

    cells: list[dict] = []

    # ── WASP PATROL / ESCORT (highest concurrent fighter) ──
    # Ready variants for SCN/MTS/Free
    cells.append(
        cell(
            "faction_scn",
            "patrol",
            LIVE["wasp_patrol"],
            prop(
                "wholeships/wasp_production_v1.glb",
                ["var_wasp_scn_patrol_v01.glb", "kit_fastener_recessed (v01–v02 rows)", "kit_rail_split_v01 mid", "kit_armor_spacer_v01 flanks"],
                "faction_scn",
                wear(0.35, 0.55, 0.10),
                ["fac_scn", "char_* digits for SCN-####", "warn_intake_triangle", "warn_high_voltage_bolt", "warn_no_step_frame", "serv_panel_labelframe"],
                ["SOCKET_Weapon_Front", "SOCKET_Trail_Main", "dorsal spine registration"],
                wasp_added["scn"],
                0,
                "src/render/partsLibrary.js: introduce faction-aware whole-ship fork for trafficRole patrol/escort OR WHOLE_SHIP_FILE_BY_DEF_ID.ship_wasp + factionId selector; candidate path assets/ships/foundry/.../variants/var_wasp_scn_patrol_v01.glb (not release)",
                f"hero_manifest wasp.scn tris_variant-tris_donor = {wasp_added['scn']}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["repair"], AX["mod"]],
            bible_refs=["§1 faction_scn", "axis 12 Modules: recessed seams, spacers, collars"],
        )
    )
    cells.append(
        cell(
            "faction_scn",
            "escort",
            LIVE["wasp_patrol"],
            prop(
                "wholeships/wasp_production_v1.glb",
                ["var_wasp_scn_patrol_v01.glb", "var_weapon_pulse_cannon_military_v01.glb"],
                "faction_scn",
                wear(0.40, 0.50, 0.10),
                ["fac_scn", "char_* SCN-####", "warn_intake_triangle", "serv_inspection_tag"],
                ["SOCKET_Weapon_Front"],
                wasp_added["scn"] + vtris("var_weapon_pulse_cannon_military_v01"),
                0,
                "partsLibrary.js WHOLE_SHIP_FILE_BY_DEF_ID / trafficRole escort faction fork + weaponRecordFor military barrel map when modular hardpoints present",
                f"wasp_scn {wasp_added['scn']} + weapon military tris_added {vtris('var_weapon_pulse_cannon_military_v01')} = {wasp_added['scn'] + vtris('var_weapon_pulse_cannon_military_v01')}",
            ),
            distinguished_by=[AX["fast"], AX["decal"], AX["emis"]],
            bible_refs=["§1"],
            notes="Escort reuses SCN patrol body; wear skews slightly fresher (yard-maintained convoy escort).",
        )
    )
    cells.append(
        cell(
            "faction_mts",
            "patrol",
            LIVE["wasp_patrol"],
            prop(
                "wholeships/wasp_production_v1.glb",
                ["var_wasp_mts_escort_v01.glb", "kit_access_panel_v01", "kit_sensor_housing_v02"],
                "faction_mts",
                wear(0.45, 0.50, 0.05),
                ["fac_mts", "char_* MTS-#####", "serv_umbilical_socket", "serv_fuel_port_ring", "serv_panel_labelframe"],
                ["SOCKET_Weapon_Front", "cabin strip emissive"],
                wasp_added["mts"],
                0,
                "partsLibrary.js faction-aware ship_wasp whole-ship → var_wasp_mts_escort_v01.glb for faction_mts traffic",
                f"hero_manifest wasp.mts added = {wasp_added['mts']}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["paint"], AX["mod"]],
            bible_refs=["§2 faction_mts", "axis 12: flush access, conformal sensors"],
        )
    )
    cells.append(
        cell(
            "faction_mts",
            "escort",
            LIVE["wasp_patrol"],
            prop(
                "wholeships/wasp_production_v1.glb",
                ["var_wasp_mts_escort_v01.glb"],
                "faction_mts",
                wear(0.50, 0.45, 0.05),
                ["fac_mts", "char_* MTS-#####"],
                ["SOCKET_Weapon_Front"],
                wasp_added["mts"],
                0,
                "same MTS wasp map as patrol; wearTier roll skews fresh for branded escorts",
                f"hero_manifest wasp.mts added = {wasp_added['mts']}",
            ),
            distinguished_by=[AX["paint"], AX["emis"], AX["clean"]],
            bible_refs=["§2"],
        )
    )
    cells.append(
        cell(
            "faction_free",
            "patrol",
            LIVE["wasp_patrol"],
            prop(
                "wholeships/wasp_production_v1.glb",
                ["var_wasp_free_militia_v01.glb", "kit_rivet_strip_v03", "kit_weld_seam_v01"],
                "faction_free",
                wear(0.10, 0.45, 0.45),
                ["fac_free", "char_* FF-####", "wear_kill_tally", "warn_no_step_frame", "wear_chips_stamp1"],
                ["SOCKET_Weapon_Front"],
                wasp_added["free"],
                0,
                "partsLibrary.js faction-aware ship_wasp → var_wasp_free_militia_v01.glb for faction_free traffic",
                f"hero_manifest wasp.free added = {wasp_added['free']}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["repair"], AX["decal"]],
            bible_refs=["§7 faction_free", "axis 8 Repair: tapeAndPray"],
        )
    )
    cells.append(
        cell(
            "faction_free",
            "escort",
            LIVE["wasp_patrol"],
            prop(
                "wholeships/wasp_production_v1.glb",
                ["var_wasp_free_militia_v01.glb"],
                "faction_free",
                wear(0.15, 0.40, 0.45),
                ["fac_free", "wear_kill_tally", "char_* FF-####"],
                ["SOCKET_Weapon_Front"],
                wasp_added["free"],
                0,
                "same Free militia wasp map as patrol",
                f"hero_manifest wasp.free added = {wasp_added['free']}",
            ),
            distinguished_by=[AX["repair"], AX["heat"], AX["mod"]],
            bible_refs=["§7"],
        )
    )
    # DMC patrol — no ready wasp variant; kit pack on donor
    dmc_p_tris = pack_tris["dmc_industrial"]
    cells.append(
        cell(
            "faction_dmc",
            "patrol",
            LIVE["wasp_patrol"],
            prop(
                "wholeships/wasp_production_v1.glb",
                [f"KIT_PACK dmc_industrial: {', '.join(pack_labels['dmc_industrial'][:4])}…"],
                "faction_dmc",
                wear(0.05, 0.55, 0.40),
                ["fac_dmc", "char_* DMC-####", "warn_chevron_strip", "warn_stripe_block", "serv_lift_here_left", "serv_tow_brackets"],
                ["SOCKET_Weapon_Front", "hatch sides", "ore-loading flank habit on fighter saddle"],
                dmc_p_tris,
                0,
                "partsLibrary.js faction-aware ship_wasp compose: donor wasp_production_v1 + runtime kit attach OR bake foundry var_wasp_dmc_* (GAP — no baked wasp DMC variant yet)",
                f"kit_manifest sum dmc_industrial pack = {dmc_p_tris} ({'+'.join(str(kit[a]*c) for a,c in dmc_industrial_kit)})",
                kit_zone="dorsal mid + engine saddle + hatch flanks",
            ),
            distinguished_by=[AX["fast"], AX["repair"], AX["clean"], AX["mod"]],
            bible_refs=["§3 faction_dmc", "preferredKitFamilies rivet_strip/bracket_gusset/plate_lip/pipe_clamp/vent_grid/heat_shield"],
            notes="Buildable from kit+profile now; preferred future bake: var_wasp_dmc_patrol (listed in gaps).",
        )
    )
    cells.append(
        cell(
            "faction_dmc",
            "escort",
            LIVE["wasp_patrol"],
            prop(
                "wholeships/wasp_production_v1.glb",
                ["KIT_PACK dmc_industrial (same construction language as DMC patrol)", "var_weapon_pulse_cannon_industrial_v01.glb"],
                "faction_dmc",
                wear(0.05, 0.50, 0.45),
                ["fac_dmc", "warn_chevron_strip", "serv_tow_brackets"],
                ["SOCKET_Weapon_Front"],
                dmc_p_tris + vtris("var_weapon_pulse_cannon_industrial_v01"),
                0,
                "same DMC wasp kit path + industrial weapon barrel when modular hardpoints show",
                f"dmc pack {dmc_p_tris} + industrial cannon {vtris('var_weapon_pulse_cannon_industrial_v01')}",
            ),
            distinguished_by=[AX["mod"], AX["heat"], AX["decal"]],
            bible_refs=["§3"],
        )
    )

    # ── HAULER (helios_span) ── ready: MTS, DMC, Reach; kit: SCN, Free
    cells.append(
        cell(
            "faction_mts",
            "hauler",
            LIVE["hauler"],
            prop(
                "wholeships/helios_span.glb",
                ["var_helios_span_mts_sealed_v01.glb"],
                "faction_mts",
                wear(0.40, 0.50, 0.10),
                ["fac_mts", "char_* MTS-#####", "serv_umbilical_socket", "serv_fuel_port_ring"],
                ["cargo door seal rails", "clamshell parting lines", "logo backlight zone"],
                vtris("var_helios_span_mts_sealed_v01"),
                0,
                "partsLibrary.js WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler → faction fork to var_helios_span_mts_sealed_v01.glb when entity.factionId=faction_mts",
                f"variants_manifest tris_added = {vtris('var_helios_span_mts_sealed_v01')}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["paint"], AX["mod"]],
            bible_refs=["§2", "axis 12 clamshell seals"],
        )
    )
    cells.append(
        cell(
            "faction_dmc",
            "hauler",
            LIVE["hauler"],
            prop(
                "wholeships/helios_span.glb",
                ["var_helios_span_dmc_orebox_v01.glb"],
                "faction_dmc",
                wear(0.05, 0.45, 0.50),
                ["fac_dmc", "char_* DMC-####", "warn_stripe_block", "serv_lift_here_left", "serv_lift_here_right", "serv_tow_brackets"],
                ["mid orebox flanks", "saddle pipe clamps", "work lamp stanchions"],
                vtris("var_helios_span_dmc_orebox_v01"),
                0,
                "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler faction fork → var_helios_span_dmc_orebox_v01.glb",
                f"variants_manifest tris_added = {vtris('var_helios_span_dmc_orebox_v01')}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["repair"], AX["clean"]],
            bible_refs=["§3", "ore-box + rivet grammar"],
        )
    )
    cells.append(
        cell(
            "faction_reach",
            "hauler",
            LIVE["hauler"],
            prop(
                "wholeships/helios_span.glb",
                ["var_helios_span_reach_scrap_v01.glb"],
                "faction_reach",
                wear(0.00, 0.25, 0.75),
                ["fac_reach", "wear_kill_tally", "wear_scorch_ring", "wear_weld_ring", "wear_patch_outline"],
                ["scrap plates mid/fore/aft", "standoff feet", "muzzle collars if armed"],
                vtris("var_helios_span_reach_scrap_v01"),
                0,
                "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler faction fork → var_helios_span_reach_scrap_v01.glb (rare lawful Reach traffic / captured freighter presentation)",
                f"variants_manifest tris_added = {vtris('var_helios_span_reach_scrap_v01')}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["repair"], AX["heat"]],
            bible_refs=["§4 faction_reach"],
            notes="Reach rarely owns high-sec hauler traffic; cell covers captured/reflagged freighters and mid-sec pirate logistics.",
        )
    )
    scn_h = pack_tris["scn_hauler"]
    cells.append(
        cell(
            "faction_scn",
            "hauler",
            LIVE["hauler"],
            prop(
                "wholeships/helios_span.glb",
                [f"KIT_PACK scn_hauler: {', '.join(pack_labels['scn_hauler'])}"],
                "faction_scn",
                wear(0.30, 0.60, 0.10),
                ["fac_scn", "char_* SCN-####", "warn_no_step_frame", "serv_panel_labelframe"],
                ["dorsal frame rails", "hatch service"],
                scn_h,
                0,
                "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler + kit attach OR bake var_helios_span_scn_sealed (GAP)",
                f"kit pack scn_hauler = {scn_h}",
                kit_zone="dorsal orthogonal grid + stern overlap",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["clean"], AX["emis"]],
            bible_refs=["§1"],
        )
    )
    free_h = pack_tris["free_hauler"]
    cells.append(
        cell(
            "faction_free",
            "hauler",
            LIVE["hauler"],
            prop(
                "wholeships/helios_span.glb",
                [f"KIT_PACK free_hauler: {', '.join(pack_labels['free_hauler'])}"],
                "faction_free",
                wear(0.10, 0.40, 0.50),
                ["fac_free", "char_* FF-####", "wear_chips_stamp1", "wear_patch_outline"],
                ["aftermarket plates mid", "hand pipe runs"],
                free_h,
                0,
                "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler + Free kit attach OR bake var_helios_span_free_patchwork (GAP)",
                f"kit pack free_hauler = {free_h}",
            ),
            distinguished_by=[AX["repair"], AX["fast"], AX["paint"], AX["mod"]],
            bible_refs=["§7"],
        )
    )

    # ── COURIER (helios_lark) — no ready variants; kit packs ──
    for fac, pack_name, wear_d, decals, axes, bref in [
        (
            "faction_scn",
            "scn_courier",
            wear(0.35, 0.55, 0.10),
            ["fac_scn", "char_* SCN-####", "warn_intake_triangle"],
            [AX["seg"], AX["fast"], AX["decal"]],
            "§1",
        ),
        (
            "faction_mts",
            "mts_courier",
            wear(0.50, 0.45, 0.05),
            ["fac_mts", "char_* MTS-#####", "serv_umbilical_socket"],
            [AX["seg"], AX["paint"], AX["fast"]],
            "§2",
        ),
        (
            "faction_free",
            "free_courier",
            wear(0.15, 0.45, 0.40),
            ["fac_free", "char_* FF-####", "wear_chips_stamp2"],
            [AX["repair"], AX["fast"], AX["mod"]],
            "§7",
        ),
        (
            "faction_dmc",
            "dmc_hauler",
            wear(0.10, 0.50, 0.40),
            ["fac_dmc", "char_* DMC-####", "warn_stripe_block"],
            [AX["fast"], AX["clean"], AX["mod"]],
            "§3",
        ),
    ]:
        t = pack_tris[pack_name]
        cells.append(
            cell(
                fac,
                "courier",
                LIVE["courier"],
                prop(
                    "wholeships/helios_lark.glb",
                    [f"KIT_PACK {pack_name}: {', '.join(pack_labels[pack_name][:5])}…"],
                    fac,
                    wear_d,
                    decals,
                    ["dorsal pouch zone", "door seal"],
                    t,
                    0,
                    "partsLibrary.js WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.courier + faction kit attach; baked lark variants not yet in foundry (GAP)",
                    f"kit pack {pack_name} = {t}",
                ),
                distinguished_by=axes,
                bible_refs=[bref],
            )
        )

    # ── MINER (helios_cradle) ──
    for fac, pack_name, wear_d, decals, axes, bref, note in [
        (
            "faction_dmc",
            "dmc_cradle",
            wear(0.05, 0.40, 0.55),
            ["fac_dmc", "char_* DMC-####", "warn_chevron_strip", "serv_lift_here_left", "serv_tow_brackets"],
            [AX["fast"], AX["repair"], AX["clean"], AX["mod"]],
            "§3",
            "Primary belt industrial read; highest miner weight × industrial boost.",
        ),
        (
            "faction_scn",
            "scn_hauler",
            wear(0.25, 0.60, 0.15),
            ["fac_scn", "char_* SCN-####", "warn_no_step_frame"],
            [AX["seg"], AX["fast"], AX["clean"]],
            "§1",
            "Licensed Concord miners in high-sec — same cradle donor, navy yard language.",
        ),
        (
            "faction_free",
            "free_cradle",
            wear(0.10, 0.40, 0.50),
            ["fac_free", "char_* FF-####", "wear_patch_outline"],
            [AX["repair"], AX["paint"], AX["mod"]],
            "§7",
            "Independent prospector frame.",
        ),
        (
            "faction_mts",
            "mts_hauler",
            wear(0.40, 0.50, 0.10),
            ["fac_mts", "char_* MTS-#####"],
            [AX["seg"], AX["paint"], AX["fast"]],
            "§2",
            "Corporate licensed prospectors — sealed clamshell service culture on cradle donor.",
        ),
        (
            "faction_quiet",
            "quiet_smuggler",
            wear(0.20, 0.50, 0.30),
            ["fac_quiet"],
            [AX["fast"], AX["decal"], AX["emis"]],
            "§5",
            "Quiet stripped-hold miner (rare traffic); registration removed scar.",
        ),
    ]:
        t = pack_tris[pack_name]
        cells.append(
            cell(
                fac,
                "miner",
                LIVE["miner"],
                prop(
                    "wholeships/helios_cradle.glb",
                    [f"KIT_PACK {pack_name}"],
                    fac,
                    wear_d,
                    decals,
                    ["drill-forward dorsal", "hold flanks", "service hatch"],
                    t,
                    0,
                    "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner + faction kit/profile; no baked cradle variants yet (GAP var_helios_cradle_*)",
                    f"kit pack {pack_name} = {t}",
                ),
                distinguished_by=axes,
                bible_refs=[bref],
                notes=note,
            )
        )

    # ── EXPRESS / SMUGGLER / RESCUE modular ──
    free_sm = pack_tris["free_smuggler"]
    quiet_sm = pack_tris["quiet_smuggler"]
    cells.append(
        cell(
            "faction_mts",
            "express",
            LIVE["express"],
            prop(
                "hulls/hull_freighter.glb",
                [f"KIT_PACK mts_hauler", "pod_cargo_container (live)", "engines/engine_industrial.glb (live map)"],
                "faction_mts",
                wear(0.45, 0.50, 0.05),
                ["fac_mts", "char_* MTS-#####", "serv_umbilical_socket"],
                ["MOUNT_ENGINE_*", "cargoSlots pods"],
                pack_tris["mts_hauler"],
                0,
                "Either map express→helios_span/variant (preferred) OR keep modular freighter + MTS kit; traffic.js:83-84 vs WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE",
                f"kit pack mts_hauler = {pack_tris['mts_hauler']}",
            ),
            distinguished_by=[AX["seg"], AX["paint"], AX["mod"]],
            bible_refs=["§2"],
            notes="Live express is modular freighter while hauler is Span — composition prefers aligning express to Span MTS sealed when integrated.",
        )
    )
    cells.append(
        cell(
            "faction_quiet",
            "smuggler",
            LIVE["smuggler"],
            prop(
                "hulls/hull_multirole.glb",
                [f"KIT_PACK quiet_smuggler"],
                "faction_quiet",
                wear(0.15, 0.55, 0.30),
                ["fac_quiet"],
                ["MOUNT_COCKPIT", "false panel zones", "sensor baffles"],
                quiet_sm,
                0,
                "HULL_FILE_BY_DEF_ID.ship_drifter remains; add faction kit attach for trafficRole smuggler + faction_quiet; optional WHOLE_SHIP later",
                f"kit pack quiet_smuggler = {quiet_sm}",
            ),
            distinguished_by=[AX["fast"], AX["decal"], AX["emis"], AX["clean"]],
            bible_refs=["§5 faction_quiet"],
        )
    )
    cells.append(
        cell(
            "faction_free",
            "smuggler",
            LIVE["smuggler"],
            prop(
                "hulls/hull_multirole.glb",
                [f"KIT_PACK free_smuggler"],
                "faction_free",
                wear(0.10, 0.40, 0.50),
                ["fac_free", "wear_chips_stamp3"],
                ["MOUNT_*", "false panels as plate_lip overlays"],
                free_sm,
                0,
                "modular multirole + Free kit for mid-sec smuggler traffic",
                f"kit pack free_smuggler = {free_sm}",
            ),
            distinguished_by=[AX["repair"], AX["fast"], AX["paint"]],
            bible_refs=["§7"],
        )
    )
    cells.append(
        cell(
            "faction_scn",
            "rescue",
            LIVE["rescue"],
            prop(
                "hulls/hull_multirole.glb",
                [f"KIT_PACK scn_law (light service gear)", "kit_hatch_frame_v02×1", "kit_sensor_housing_v01×1"],
                "faction_scn",
                wear(0.40, 0.50, 0.10),
                ["fac_scn", "warn_no_step_frame", "serv_panel_labelframe"],
                ["MOUNT_*", "rescue gear hardpoints mid"],
                pack_tris["scn_law"] + kit["kit_hatch_frame_v02"] + kit["kit_sensor_housing_v01"],
                0,
                "modular multirole + SCN rescue kit attach for trafficRole rescue",
                f"scn_law {pack_tris['scn_law']} + hatch_frame_v02 {kit['kit_hatch_frame_v02']} + sensor_v01 {kit['kit_sensor_housing_v01']}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["decal"]],
            bible_refs=["§1"],
        )
    )

    # ── STATION SECURITY / HOSTILE LAWFUL ──
    cells.append(
        cell(
            "faction_scn",
            "patrol_lawman",
            LIVE["patrol_lawman"],
            prop(
                "hulls/hull_interceptor.glb",
                [
                    f"KIT_PACK scn_law: {', '.join(pack_labels['scn_law'])}",
                    "var_weapon_pulse_cannon_military_v01.glb",
                    "engines/engine_vector.glb (live)",
                ],
                "faction_scn",
                wear(0.30, 0.60, 0.10),
                ["fac_scn", "char_* SCN-####", "warn_intake_triangle", "warn_high_voltage_bolt"],
                ["MOUNT_COCKPIT", "MOUNT_ENGINE_*", "MOUNT_FIN_*", "SOCKET_Weapon_Front"],
                pack_tris["scn_law"] + vtris("var_weapon_pulse_cannon_military_v01"),
                0,
                "HULL_FILE_BY_DEF_ID.ship_hornet stays; add faction/role kit attach for patrol_lawman OR WHOLE_SHIP_FILE_BY_HOSTILE_ID.patrol_lawman future whole body",
                f"scn_law {pack_tris['scn_law']} + military cannon {vtris('var_weapon_pulse_cannon_military_v01')}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["repair"], AX["mod"]],
            bible_refs=["§1", "high-sec ambient exclusively patrol_lawman"],
        )
    )
    cells.append(
        cell(
            "faction_scn",
            "customs_cutter",
            LIVE["customs_cutter"],
            prop(
                "hulls/hull_interceptor.glb",
                [f"KIT_PACK scn_law", "kit_sensor_housing_v02×1 interdiction boom read", "var_weapon_pulse_cannon_military_v01.glb"],
                "faction_scn",
                wear(0.35, 0.55, 0.10),
                ["fac_scn", "serv_inspection_tag", "warn_no_step_frame"],
                ["MOUNT_*", "SOCKET_Weapon_Front"],
                pack_tris["scn_law"] + kit["kit_sensor_housing_v02"] + vtris("var_weapon_pulse_cannon_military_v01"),
                0,
                "same modular interceptor + denser sensor kit; optional hostile whole map later",
                f"scn_law {pack_tris['scn_law']} + sensor_v02 {kit['kit_sensor_housing_v02']} + military cannon {vtris('var_weapon_pulse_cannon_military_v01')}",
            ),
            distinguished_by=[AX["mod"], AX["decal"], AX["emis"]],
            bible_refs=["§1"],
            notes="Customs shares interceptor donor with lawman but heavier sensor housing emphasis.",
        )
    )

    # ── REACH HOSTILES (ready variants for reaver/corsair) ──
    cells.append(
        cell(
            "faction_reach",
            "reaver_pirate",
            LIVE["reaver"],
            prop(
                "wholeships/ashline_rig.glb",
                ["var_ashline_rig_reaver_hook_v01.glb"],
                "faction_reach",
                wear(0.00, 0.30, 0.70),
                ["fac_reach", "wear_kill_tally", "wear_scorch_ring", "wear_weld_ring"],
                ["fore grapple/hook", "crane gantry mid", "prow plates"],
                vtris("var_ashline_rig_reaver_hook_v01"),
                0,
                "partsLibrary.js WHOLE_SHIP_FILE_BY_HOSTILE_ID.reaver_pirate → var_ashline_rig_reaver_hook_v01.glb (split from corsair)",
                f"variants_manifest tris_added = {vtris('var_ashline_rig_reaver_hook_v01')}",
            ),
            distinguished_by=[AX["seg"], AX["fast"], AX["repair"], AX["mod"]],
            bible_refs=["§4", "hook scavenger construction"],
        )
    )
    cells.append(
        cell(
            "faction_reach",
            "corsair_raider",
            LIVE["corsair"],
            prop(
                "wholeships/ashline_rig.glb",
                ["var_ashline_rig_corsair_blade_v01.glb", "var_weapon_pulse_cannon_pirate_v01.glb"],
                "faction_reach",
                wear(0.00, 0.35, 0.65),
                ["fac_reach", "wear_kill_tally", "wear_scorch_ring"],
                ["fore blades", "ram lip", "weapon collars port/stbd"],
                vtris("var_ashline_rig_corsair_blade_v01") + vtris("var_weapon_pulse_cannon_pirate_v01"),
                0,
                "WHOLE_SHIP_FILE_BY_HOSTILE_ID.corsair_raider → var_ashline_rig_corsair_blade_v01.glb (must diverge from reaver map)",
                f"corsair blade {vtris('var_ashline_rig_corsair_blade_v01')} + pirate cannon {vtris('var_weapon_pulse_cannon_pirate_v01')}",
            ),
            distinguished_by=[AX["seg"], AX["mod"], AX["heat"], AX["edge"]],
            bible_refs=["§4", "blade interceptor vs reaver hook"],
        )
    )
    reach_sw = pack_tris["reach_scrap"]
    cells.append(
        cell(
            "faction_reach",
            "wasp_swarmer",
            LIVE["swarmer"],
            prop(
                "wholeships/ashline_dart.glb",
                [f"KIT_PACK reach_scrap (scaled light): kit_weld_seam_v03×2, kit_plate_lip_v01×2, kit_armor_spacer_v02×1, kit_weapon_collar_v03×1"],
                "faction_reach",
                wear(0.00, 0.40, 0.60),
                ["fac_reach", "wear_scorch_ring"],
                ["fore", "weapon root"],
                kit["kit_weld_seam_v03"] * 2
                + kit["kit_plate_lip_v01"] * 2
                + kit["kit_armor_spacer_v02"]
                + kit["kit_weapon_collar_v03"],
                0,
                "keep WHOLE_SHIP_FILE_BY_HOSTILE_ID.wasp_swarmer=ashline_dart; optional swarm damage dialects via kit attach (no baked dart variants — GAP)",
                f"2×weld_v03={kit['kit_weld_seam_v03']*2} + 2×lip_v01={kit['kit_plate_lip_v01']*2} + spacer_v02={kit['kit_armor_spacer_v02']} + collar_v03={kit['kit_weapon_collar_v03']}",
            ),
            distinguished_by=[AX["fast"], AX["heat"], AX["repair"]],
            bible_refs=["§4"],
        )
    )
    cells.append(
        cell(
            "faction_reach",
            "bruiser_brawler",
            LIVE["bruiser"],
            prop(
                "wholeships/ashline_lode.glb",
                [f"KIT_PACK reach_scrap", "kit_heat_shield_v01×2", "kit_weapon_collar_v01×2"],
                "faction_reach",
                wear(0.00, 0.35, 0.65),
                ["fac_reach", "wear_scorch_ring", "wear_weld_ring"],
                ["armor flanks", "weapon roots"],
                pack_tris["reach_scrap"] + kit["kit_heat_shield_v01"] * 2 + kit["kit_weapon_collar_v01"] * 2,
                0,
                "keep ashline_lode map; kit armor dialects; optional bake var_ashline_lode_* (GAP)",
                f"reach_scrap {pack_tris['reach_scrap']} + 2×heat_v01={kit['kit_heat_shield_v01']*2} + 2×collar_v01={kit['kit_weapon_collar_v01']*2}",
            ),
            distinguished_by=[AX["seg"], AX["heat"], AX["mod"]],
            bible_refs=["§4"],
        )
    )
    cells.append(
        cell(
            "faction_reach",
            "pirate",
            LIVE["pirate_traffic"],
            prop(
                "hulls/hull_interceptor.glb",
                [f"KIT_PACK reach_pirate_mod", "var_weapon_pulse_cannon_pirate_v01.glb"],
                "faction_reach",
                wear(0.00, 0.30, 0.70),
                ["fac_reach", "wear_kill_tally", "wear_patch_outline"],
                ["MOUNT_*", "SOCKET_Weapon_Front"],
                pack_tris["reach_pirate_mod"] + vtris("var_weapon_pulse_cannon_pirate_v01"),
                0,
                "trafficRole pirate modular path: hull_interceptor + Reach kit (distinct from ashline hostile wholeships)",
                f"reach_pirate_mod {pack_tris['reach_pirate_mod']} + pirate cannon {vtris('var_weapon_pulse_cannon_pirate_v01')}",
            ),
            distinguished_by=[AX["fast"], AX["edge"], AX["repair"]],
            bible_refs=["§4"],
        )
    )
    cells.append(
        cell(
            "faction_reach",
            "mine_layer_jackal",
            LIVE["jackal"],
            prop(
                "wholeships/ashline_rig.glb",
                ["var_ashline_rig_reaver_hook_v01.glb", "kit_pipe_clamp_v01×2 mine-rack read", "kit_vent_grid_v03×1"],
                "faction_reach",
                wear(0.00, 0.35, 0.65),
                ["fac_reach", "wear_scorch_ring"],
                ["fore hook family", "mid rack clamps"],
                vtris("var_ashline_rig_reaver_hook_v01") + kit["kit_pipe_clamp_v01"] * 2 + kit["kit_vent_grid_v03"],
                0,
                "ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.mine_layer_jackal → ashline reaver_hook (or dedicated); currently modular multirole gap",
                f"reaver_hook {vtris('var_ashline_rig_reaver_hook_v01')} + 2×pipe_v01={kit['kit_pipe_clamp_v01']*2} + vent_v03={kit['kit_vent_grid_v03']}",
            ),
            distinguished_by=[AX["mod"], AX["repair"], AX["heat"]],
            bible_refs=["§4"],
            notes="Integration closes audit gap: jackal currently falls to hull_multirole.",
        )
    )
    cells.append(
        cell(
            "faction_reach",
            "pd_screen_escort",
            LIVE["pd_screen"],
            prop(
                "wholeships/ashline_lode.glb",
                [f"KIT_PACK reach_scrap", "kit_weapon_collar_v02×3 PD turrets read", "kit_sensor_housing_v02×2"],
                "faction_reach",
                wear(0.00, 0.40, 0.60),
                ["fac_reach", "wear_scorch_ring"],
                ["weapon collars", "sensor housings"],
                pack_tris["reach_scrap"] + kit["kit_weapon_collar_v02"] * 3 + kit["kit_sensor_housing_v02"] * 2,
                0,
                "ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.pd_screen_escort → ashline_lode + PD kit; currently modular corvette gap",
                f"reach_scrap {pack_tris['reach_scrap']} + 3×collar_v02={kit['kit_weapon_collar_v02']*3} + 2×sensor_v02={kit['kit_sensor_housing_v02']*2}",
            ),
            distinguished_by=[AX["mod"], AX["heat"], AX["seg"]],
            bible_refs=["§4"],
        )
    )

    # ── HOSTILE GAPS: lancer / choir_zealot / quiet_ghost ──
    lancer_tris = (
        kit["kit_weapon_collar_v01"]
        + kit["kit_sensor_housing_v03"] * 2
        + kit["kit_rail_split_v04"] * 2
        + kit["kit_armor_spacer_v01"] * 2
        + kit["kit_weld_seam_v02"] * 2
        + kit["kit_heat_shield_v03"]
    )
    cells.append(
        cell(
            "faction_reach",
            "lancer_sniper",
            LIVE["lancer"],
            prop(
                "wholeships/wasp_production_v1.glb",
                [
                    "KIT_PACK lancer_sniper: weapon_collar_v01×1, sensor_housing_v03×2, rail_split_v04×2, armor_spacer_v01×2, weld_seam_v02×2, heat_shield_v03×1",
                    "var_weapon_pulse_cannon_pirate_v01.glb (placeholder barrel jacket until rail visual)",
                ],
                "faction_reach",
                wear(0.00, 0.35, 0.65),
                ["fac_reach", "wear_kill_tally", "wear_scorch_ring"],
                ["SOCKET_Weapon_Front as lance root", "sensor housings fore"],
                lancer_tris + vtris("var_weapon_pulse_cannon_pirate_v01"),
                0,
                "ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.lancer_sniper → dedicated lance body or wasp+kit; currently falls to production wasp via ship_wasp",
                f"lancer kit {lancer_tris} + pirate cannon {vtris('var_weapon_pulse_cannon_pirate_v01')}",
            ),
            distinguished_by=[AX["mod"], AX["seg"], AX["heat"], AX["fast"]],
            bible_refs=["§4", "hostile gap audit"],
            notes="Must read as sniper lance, not patrol Wasp. Preferred long-term: unique silhouette donor (GAP).",
        )
    )
    choir_t = pack_tris["choir_zealot"]
    cells.append(
        cell(
            "faction_choir",
            "choir_zealot",
            LIVE["choir_zealot"],
            prop(
                "wholeships/wasp_production_v1.glb",
                [f"KIT_PACK choir_zealot: {', '.join(pack_labels['choir_zealot'])}"],
                "faction_choir",
                wear(0.15, 0.55, 0.30),
                ["fac_choir", "char_* AC-####", "warn_radiation_trefoil", "serv_inspection_tag"],
                ["dorsal spine rails", "weapon collar as censer", "ritual rivet rows"],
                choir_t,
                0,
                "ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.choir_zealot → wasp+choir kit or dedicated body; materialProfile faction_choir",
                f"kit pack choir_zealot = {choir_t}",
            ),
            distinguished_by=[AX["seg"], AX["emis"], AX["fast"], AX["repair"]],
            bible_refs=["§8 faction_choir", "axis 10 brightest emissive 1.6", "axis 8 votive blanking"],
            notes="Same need (light fighter) different answer: radial lancet rails + ritual rivets + halo emissive — not production patrol Wasp.",
        )
    )
    quiet_t = pack_tris["quiet_ghost"]
    cells.append(
        cell(
            "faction_quiet",
            "quiet_ghost",
            LIVE["quiet_ghost"],
            prop(
                "wholeships/wasp_production_v1.glb",
                [f"KIT_PACK quiet_ghost: {', '.join(pack_labels['quiet_ghost'])}"],
                "faction_quiet",
                wear(0.20, 0.55, 0.25),
                ["fac_quiet"],
                ["baffled sensors", "flush access blanks", "registration-removal scar zone"],
                quiet_t,
                0,
                "ADD WHOLE_SHIP_FILE_BY_HOSTILE_ID.quiet_ghost → wasp+quiet kit or dedicated low-sig body",
                f"kit pack quiet_ghost = {quiet_t}",
            ),
            distinguished_by=[AX["fast"], AX["decal"], AX["emis"], AX["clean"]],
            bible_refs=["§5", "axis 10 emissive 0.35 shuttered", "axis 6 bonded fasteners none"],
            notes="Desaturated read: flush seams, no rivets, dim slits — opposite of Reach scrap and Choir sermon.",
        )
    )

    # ── TRADE HUB stations (clone-fleet station proof; first-hour dock) ──
    for fac, key, stem in [
        ("faction_scn", "scn", "var_station_trade_hub_scn_overlay_v01"),
        ("faction_mts", "mts", "var_station_trade_hub_mts_overlay_v01"),
        ("faction_free", "free", "var_station_trade_hub_free_overlay_v01"),
    ]:
        cells.append(
            cell(
                fac,
                "station_trade_hub",
                LIVE["trade_hub"],
                prop(
                    "places/place_station_trade_hub.glb",
                    [f"{stem}.glb"],
                    fac,
                    wear(0.40, 0.50, 0.10) if fac != "faction_free" else wear(0.10, 0.45, 0.45),
                    {
                        "faction_scn": ["fac_scn", "warn_no_step_frame", "serv_panel_labelframe"],
                        "faction_mts": ["fac_mts", "serv_umbilical_socket"],
                        "faction_free": ["fac_free", "wear_patch_outline", "wear_chips_stamp1"],
                    }[fac],
                    ["donor-origin roof/rim overlay attach (tradehub_overlays.json)"],
                    hub_tris[key],
                    0,
                    "STATION_ARCHETYPE_FILES / placeFileForEntity: attach faction overlay GLB or select faction hub composite; files under foundry variants/",
                    f"hero_manifest hub.{key}.tris = {hub_tris[key]} (tradehub_overlays.json matches)",
                ),
                distinguished_by=[AX["seg"], AX["mod"], AX["emis"], AX["repair"]],
                bible_refs=[
                    {"faction_scn": "§1 bastion cladding", "faction_mts": "§2 commerce rings", "faction_free": "§7 habitat pods"}[fac]
                ],
            )
        )

    # ── Modular weapon default (cross-cutting but SCN/DMC/Reach ready) ──
    for fac, stem, role in [
        ("faction_scn", "var_weapon_pulse_cannon_military_v01", "weapon_pulse_default"),
        ("faction_dmc", "var_weapon_pulse_cannon_industrial_v01", "weapon_pulse_default"),
        ("faction_reach", "var_weapon_pulse_cannon_pirate_v01", "weapon_pulse_default"),
    ]:
        cells.append(
            cell(
                fac,
                role,
                LIVE["weapon_default"],
                prop(
                    "weapons/weapon_pulse_cannon.glb",
                    [f"{stem}.glb"],
                    fac,
                    wear(0.20, 0.60, 0.20),
                    {
                        "faction_scn": ["fac_scn", "warn_high_voltage_bolt"],
                        "faction_dmc": ["fac_dmc", "warn_chevron_strip"],
                        "faction_reach": ["fac_reach", "wear_scorch_ring"],
                    }[fac],
                    ["hardpoint muzzle axis preserved"],
                    vtris(stem),
                    0,
                    "partsLibrary.js weaponRecordFor default file map → faction barrel variant",
                    f"variants_manifest {stem} tris_added = {vtris(stem)}",
                ),
                distinguished_by=[AX["mod"], AX["fast"], AX["heat"]],
                bible_refs=["axis 12 weapon collars / clamps / scrap jackets"],
            )
        )

    # Sort cells for determinism
    cells.sort(key=lambda c: (c["faction"], c["role"]))

    # Validate material profiles exist
    for c in cells:
        mp = c["proposed"]["materialProfile"]
        if mp not in mat_m["factions"]:
            raise SystemExit(f"missing material profile {mp}")

    # Gaps (needed candidates that do not exist as baked variants)
    gaps = [
        {
            "id": "var_wasp_dmc_patrol",
            "need": "Baked DMC wasp patrol body (rivet/ore-saddle grammar)",
            "fallbackUsedInMatrix": "kit pack dmc_industrial on wasp_production_v1",
            "roles": ["patrol", "escort"],
            "faction": "faction_dmc",
        },
        {
            "id": "var_helios_cradle_*",
            "need": "Faction cradle miner variants (DMC ore barge, Free prospector, SCN licensed, Quiet stripped, MTS sealed)",
            "fallbackUsedInMatrix": "kit packs on helios_cradle donor",
            "roles": ["miner"],
            "faction": "multi",
        },
        {
            "id": "var_helios_lark_*",
            "need": "Faction courier variants on helios_lark",
            "fallbackUsedInMatrix": "kit packs on helios_lark donor",
            "roles": ["courier"],
            "faction": "multi",
        },
        {
            "id": "var_helios_span_scn_sealed",
            "need": "SCN sealed corporate hauler (kit pack used now)",
            "fallbackUsedInMatrix": "kit pack scn_hauler",
            "roles": ["hauler"],
            "faction": "faction_scn",
        },
        {
            "id": "var_helios_span_free_patchwork",
            "need": "Free patchwork hauler bake",
            "fallbackUsedInMatrix": "kit pack free_hauler",
            "roles": ["hauler"],
            "faction": "faction_free",
        },
        {
            "id": "var_ashline_dart_*",
            "need": "Swarm dart damage/patch dialects",
            "fallbackUsedInMatrix": "light Reach kit on ashline_dart",
            "roles": ["wasp_swarmer"],
            "faction": "faction_reach",
        },
        {
            "id": "var_ashline_lode_*",
            "need": "Heavy brawler armor dialects",
            "fallbackUsedInMatrix": "reach_scrap kit on ashline_lode",
            "roles": ["bruiser_brawler", "pd_screen_escort"],
            "faction": "faction_reach",
        },
        {
            "id": "var_wasp_lancer_sniper",
            "need": "Dedicated lancer silhouette (not production patrol Wasp)",
            "fallbackUsedInMatrix": "kit pack lancer_sniper on wasp_production_v1",
            "roles": ["lancer_sniper"],
            "faction": "faction_reach",
        },
        {
            "id": "var_wasp_choir_zealot",
            "need": "Baked Choir zealot fighter (lancet rails + halo)",
            "fallbackUsedInMatrix": "kit pack choir_zealot",
            "roles": ["choir_zealot"],
            "faction": "faction_choir",
        },
        {
            "id": "var_wasp_quiet_ghost",
            "need": "Baked Quiet ghost low-sig fighter",
            "fallbackUsedInMatrix": "kit pack quiet_ghost",
            "roles": ["quiet_ghost"],
            "faction": "faction_quiet",
        },
        {
            "id": "var_station_blackmarket_*",
            "need": "Quiet/Reach/Vael blackmarket overlays (audit multi-faction station)",
            "fallbackUsedInMatrix": "none in cells (out of traffic/hostile scope); scenery wreck fragments only",
            "roles": ["station_blackmarket"],
            "faction": "multi",
        },
        {
            "id": "var_hull_interceptor_law",
            "need": "Baked law interceptor whole or overlay",
            "fallbackUsedInMatrix": "kit pack scn_law on hull_interceptor",
            "roles": ["patrol_lawman", "customs_cutter"],
            "faction": "faction_scn",
        },
        {
            "id": "kit_organic_vael_*",
            "need": "Re-proportioned organic kit (bible: do not bolt rectangular kit onto Vael)",
            "fallbackUsedInMatrix": "no Vael ship cells — Vael only via zones/dreadnought out of first-hour core",
            "roles": [],
            "faction": "faction_vael",
        },
        {
            "id": "place_lane_beacon faction wiring",
            "need": "Runtime map from place_lane_beacon to scenery_lane_beacon_v0{1,2,3}",
            "fallbackUsedInMatrix": "not a ship cell; scenery candidates exist (tris 1048/264/392)",
            "roles": ["core_lane_dressing"],
            "faction": "sector_owner",
        },
    ]

    # Shared resources
    kit_mats = sorted({m for p in kit_m["pieces"] for m in p["materials"]})
    sc_mats = sorted({m for p in sc_m["props"] for m in p["materials"]})
    all_shared_mats = sorted(set(kit_mats) | set(sc_mats) | {"KitMat_Rubber", "KitMat_Emissive"})

    shared = {
        "kitMaterials": all_shared_mats,
        "atlases": [
            "textures/decals_atlas.png",
            "textures/trim_basecolor.png",
            "textures/trim_normal.png",
            "textures/trim_orm.png",
        ],
        "grimeMasks": [
            "textures/mask_edgewear.png",
            "textures/mask_chips.png",
            "textures/mask_corrosion.png",
            "textures/mask_recessdust.png",
            "textures/mask_streaking.png",
            "textures/mask_carbon.png",
            "textures/mask_heatradial.png",
            "textures/mask_panelfade.png",
        ],
        "materialProfiles": "materials/material_profiles.json (8 factions)",
        "drawCallStrategy": (
            "Prefer single shared KitMat_* material library across all kit/variant overlays; "
            "decals from one atlas; trim ORM/normal shared; wear masks sampled as scalar fields "
            "not unique materials. Whole-ship donors keep existing material slots; overlays add "
            "geometry only under KitMat_Paint/Steel/Emissive/Rubber. Target: zero unique textures "
            "per faction instance — only tint multipliers + mask amplitudes differ."
        ),
    }

    # Clone fleet proof
    clone_before = [
        {
            "factions": ["faction_scn", "faction_mts", "faction_dmc", "faction_free"],
            "sharedVisual": "wholeships/wasp_production_v1.glb",
            "roles": ["patrol", "escort"],
            "cite": "repetition-audit.json donors wholeship_wasp_production_v1; partsLibrary.js:387-390",
        },
        {
            "factions": ["all_sector_owners_via_traffic"],
            "sharedVisual": "wholeships/helios_span.glb",
            "roles": ["hauler"],
            "cite": "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler",
        },
        {
            "factions": ["all_sector_owners_via_traffic"],
            "sharedVisual": "wholeships/helios_cradle.glb",
            "roles": ["miner"],
            "cite": "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner",
        },
        {
            "factions": ["all_sector_owners_via_traffic"],
            "sharedVisual": "wholeships/helios_lark.glb",
            "roles": ["courier"],
            "cite": "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.courier",
        },
        {
            "factions": ["faction_reach"],
            "sharedVisual": "wholeships/ashline_rig.glb",
            "roles": ["reaver_pirate", "corsair_raider"],
            "cite": "WHOLE_SHIP_FILE_BY_HOSTILE_ID both → ashline_rig",
        },
        {
            "factions": ["faction_reach", "faction_choir", "faction_quiet"],
            "sharedVisual": "wholeships/wasp_production_v1.glb",
            "roles": ["lancer_sniper", "choir_zealot", "quiet_ghost"],
            "cite": "hostile whole-map gaps → production wasp",
        },
        {
            "factions": ["faction_scn", "faction_mts", "faction_free"],
            "sharedVisual": "places/place_station_trade_hub.glb",
            "roles": ["station_trade_hub"],
            "cite": "STATION_ARCHETYPE_FILES multi-faction recolor",
        },
    ]
    clone_after = []
    for c in cells:
        if c["role"] in (
            "patrol",
            "hauler",
            "miner",
            "reaver_pirate",
            "corsair_raider",
            "choir_zealot",
            "quiet_ghost",
            "lancer_sniper",
            "station_trade_hub",
            "patrol_lawman",
        ):
            clone_after.append(
                {
                    "cell": f"{c['faction']}:{c['role']}",
                    "distinguishedBy": c.get("distinguishedBy", []),
                    "constructionAnswer": c["proposed"]["variantParts"][0]
                    if c["proposed"]["variantParts"]
                    else "",
                    "materialProfile": c["proposed"]["materialProfile"],
                    "trisAdded": c["proposed"]["expectedRuntimeCost"]["trisAdded"],
                }
            )

    # Sector modifiers note
    sector_modifiers = {
        "high_sec": {
            "security": "high",
            "wearSkew": "fresh ↑, patched ↓",
            "example": {"fresh": "+0.15", "serviceWorn": "0", "patched": "-0.15", "clamp": "[0,1] renormalize"},
            "sectors": ["sector_helios_prime", "high-sec core"],
            "note": "SCN yards and MTS detail crews keep hulls fresher; DMC still dirtier baseline.",
        },
        "mid_sec": {
            "security": "mid",
            "wearSkew": "serviceWorn default",
            "example": {"fresh": "0", "serviceWorn": "0", "patched": "0"},
            "sectors": ["Tethys industrial approaches", "Ceres belt approaches"],
        },
        "fringe": {
            "security": "fringe/low",
            "wearSkew": "patched ↑, fresh ↓",
            "example": {"fresh": "-0.15", "serviceWorn": "-0.10", "patched": "+0.25", "clamp": "[0,1] renormalize"},
            "sectors": ["frontier", "Ashfall/Sker approaches"],
            "note": "Free/Reach/Quiet skew hard to patched; Choir votive soot allowed.",
        },
    }

    # Asset cost rollup (foundry batch totals — not per-instance)
    kit_all = sum(p["tris"] for p in kit_m["pieces"])
    var_added = sum(v["tris_added"] for v in var_m["variants"])
    wasp_sum = sum(wasp_added.values())
    hub_sum = sum(hub_tris.values())
    sc_sum = sum(p["tris"] for p in sc_m["props"])

    cost_rollup = {
        "foundryCandidateGeometryTris": {
            "kit_all_pieces": kit_all,
            "lane_f_variants_tris_added": var_added,
            "hero_wasp_tris_added": wasp_sum,
            "hero_hub_overlay_tris": hub_sum,
            "scenery_props_tris": sc_sum,
            "sum": kit_all + var_added + wasp_sum + hub_sum + sc_sum,
            "note": "Sum of unique authored candidate geometry (not concurrent on-screen). Kit pieces are shared pool; variants include donor+added but tris_added is overlay cost only.",
        },
        "texturesUnique": {
            "decals_atlas": 1,
            "trim_sheet_maps": 3,
            "grime_masks": 8,
            "sum": 12,
            "sharedAcrossAllCells": True,
        },
        "materialsShared": all_shared_mats,
        "materialsUniquePerCell": 0,
        "cellCount": len(cells),
        "cellsWithBakedVariant": sum(
            1
            for c in cells
            if any(
                str(p).startswith("var_")
                for p in c["proposed"]["variantParts"]
            )
        ),
        "cellsKitOnly": sum(
            1
            for c in cells
            if any(str(p).startswith("KIT_PACK") for p in c["proposed"]["variantParts"])
            and not any(str(p).startswith("var_") for p in c["proposed"]["variantParts"])
        ),
    }

    # Top 5 integration actions
    top5 = [
        {
            "rank": 1,
            "action": "Faction-fork WHOLE_SHIP for traffic patrol/escort (ship_wasp)",
            "file": "src/render/partsLibrary.js",
            "map": "WHOLE_SHIP_FILE_BY_DEF_ID.ship_wasp + factionId OR new trafficRole patrol/escort map",
            "candidates": [
                "var_wasp_scn_patrol_v01.glb",
                "var_wasp_mts_escort_v01.glb",
                "var_wasp_free_militia_v01.glb",
            ],
            "firstHourVisibility": "Highest concurrent combat silhouette in Helios pocket",
            "trisDeltaVsLive": f"SCN+{wasp_added['scn']} / MTS+{wasp_added['mts']} / Free+{wasp_added['free']} per instance",
        },
        {
            "rank": 2,
            "action": "Faction-fork WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler",
            "file": "src/render/partsLibrary.js",
            "map": "WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler",
            "candidates": [
                "var_helios_span_mts_sealed_v01.glb",
                "var_helios_span_dmc_orebox_v01.glb",
                "var_helios_span_reach_scrap_v01.glb",
            ],
            "firstHourVisibility": "Dominant bulk civilian ship (weight 30)",
            "trisDeltaVsLive": f"MTS+{vtris('var_helios_span_mts_sealed_v01')} / DMC+{vtris('var_helios_span_dmc_orebox_v01')} / Reach+{vtris('var_helios_span_reach_scrap_v01')}",
        },
        {
            "rank": 3,
            "action": "Attach trade-hub faction overlays at station spawn",
            "file": "src/render/partsLibrary.js (+ world/station place path)",
            "map": "STATION_ARCHETYPE_FILES / placeFileForEntity / archetypeGlb for place_station_trade_hub",
            "candidates": [
                "var_station_trade_hub_scn_overlay_v01.glb",
                "var_station_trade_hub_mts_overlay_v01.glb",
                "var_station_trade_hub_free_overlay_v01.glb",
            ],
            "firstHourVisibility": "First dock (Helios SCN hub) + Tethys MTS + Free Reach Station",
            "trisDeltaVsLive": f"SCN+{hub_tris['scn']} / MTS+{hub_tris['mts']} / Free+{hub_tris['free']} overlay tris",
        },
        {
            "rank": 4,
            "action": "Split reaver vs corsair ashline_rig hostile map + close three wasp gaps",
            "file": "src/render/partsLibrary.js",
            "map": "WHOLE_SHIP_FILE_BY_HOSTILE_ID (reaver_pirate, corsair_raider, lancer_sniper, choir_zealot, quiet_ghost)",
            "candidates": [
                "var_ashline_rig_reaver_hook_v01.glb",
                "var_ashline_rig_corsair_blade_v01.glb",
                "kit packs for lancer/choir/quiet on wasp donor",
            ],
            "firstHourVisibility": "Combat cast collapses until mid-route hostiles; gap roles currently look like patrol Wasps",
            "trisDeltaVsLive": f"reaver+{vtris('var_ashline_rig_reaver_hook_v01')} / corsair+{vtris('var_ashline_rig_corsair_blade_v01')}",
        },
        {
            "rank": 5,
            "action": "Faction weapon barrels + law interceptor kit on modular path",
            "file": "src/render/partsLibrary.js",
            "map": "weaponRecordFor default; modular compose for ship_hornet patrol_lawman",
            "candidates": [
                "var_weapon_pulse_cannon_military_v01.glb",
                "var_weapon_pulse_cannon_industrial_v01.glb",
                "var_weapon_pulse_cannon_pirate_v01.glb",
                "kit scn_law pack",
            ],
            "firstHourVisibility": "Multiplies on every modular hardpoint; lawman is sole high-sec ambient enemy",
            "trisDeltaVsLive": f"military+{vtris('var_weapon_pulse_cannon_military_v01')} / industrial+{vtris('var_weapon_pulse_cannon_industrial_v01')} / pirate+{vtris('var_weapon_pulse_cannon_pirate_v01')}",
        },
    ]

    doc = {
        "schema": "sf-foundry-composition/1",
        "batch": "fleet_breadth_20260720",
        "lane": "G",
        "generatedFrom": {
            "audit": "assets/ships/parts/revamp-evidence/fleet_breadth_foundry/repetition-audit.json",
            "bible": "design/foundry/FACTION_SURFACE_LANGUAGE.md",
            "materialProfiles": "assets/ships/foundry/fleet_breadth_20260720/materials/material_profiles.json",
            "kitManifest": "assets/ships/foundry/fleet_breadth_20260720/kit/kit_manifest.json",
            "variantsManifest": "assets/ships/foundry/fleet_breadth_20260720/variants/variants_manifest.json",
            "heroManifest": "assets/ships/foundry/fleet_breadth_20260720/variants/hero_manifest.json",
            "decalsAtlas": "assets/ships/foundry/fleet_breadth_20260720/textures/decals_atlas.json",
            "liveGrammar": "src/render/partsLibrary.js (read-only)",
            "branch": "codex/fleet-breadth-foundry-20260720",
        },
        "sectorModifiers": sector_modifiers,
        "cells": cells,
        "sharedResources": shared,
        "cloneFleetProof": {"before": clone_before, "after": clone_after},
        "gaps": gaps,
        "costRollup": cost_rollup,
        "top5IntegrationActions": top5,
        "contrastAxesReference": list(AX.values()),
        "decalCellCount": len(dec_m),
        "kitPieceCount": kit_m["piece_count"],
        "packTris": pack_tris,
    }

    # Stable JSON
    out_json = OUT_DIR / "fleet_composition_matrix.json"
    text = json.dumps(doc, indent=2, sort_keys=False, ensure_ascii=False) + "\n"
    out_json.write_text(text, encoding="utf-8")

    # Human MD
    md = build_md(doc, wasp_added, hub_tris, var_by_stem, pack_tris)
    out_md = OUT_DIR / "fleet_composition_matrix.md"
    out_md.write_text(md, encoding="utf-8")

    print(f"cells={len(cells)} json={out_json} md={out_md}")
    print(f"cost_sum_tris={cost_rollup['foundryCandidateGeometryTris']['sum']}")
    print(f"pack_tris={json.dumps(pack_tris, sort_keys=True)}")


def build_md(doc: dict, wasp_added: dict, hub_tris: dict, var_by_stem: dict, pack_tris: dict) -> str:
    lines = []
    a = lines.append
    a("# Fleet Composition Matrix — Fleet Breadth Foundry")
    a("")
    a("Lane G integration blueprint. Machine-readable twin: `fleet_composition_matrix.json`.")
    a("Schema `sf-foundry-composition/1`. All tris are arithmetic from kit/variants/hero manifests.")
    a("")
    a("## Before / after clone-fleet")
    a("")
    a("| Before (live) | Shared visual | After (foundry) |")
    a("|---|---|---|")
    a(
        "| SCN/MTS/DMC/Free patrol+escort | `wasp_production_v1.glb` tint only | "
        f"SCN var +{wasp_added['scn']} · MTS var +{wasp_added['mts']} · Free var +{wasp_added['free']} · DMC kit pack +{pack_tris['dmc_industrial']} |"
    )
    a(
        f"| All factions hauler | `helios_span.glb` | MTS sealed +{var_by_stem['var_helios_span_mts_sealed_v01']['tris_added']} · "
        f"DMC orebox +{var_by_stem['var_helios_span_dmc_orebox_v01']['tris_added']} · "
        f"Reach scrap +{var_by_stem['var_helios_span_reach_scrap_v01']['tris_added']} · SCN/Free kit packs |"
    )
    a("| All factions miner | `helios_cradle.glb` | Per-faction kit packs on cradle (DMC/Free/SCN/MTS/Quiet) — **no baked cradle vars yet** |")
    a("| All factions courier | `helios_lark.glb` | Per-faction kit packs — **no baked lark vars yet** |")
    a(
        f"| reaver_pirate == corsair_raider | `ashline_rig.glb` | reaver hook +{var_by_stem['var_ashline_rig_reaver_hook_v01']['tris_added']} · "
        f"corsair blade +{var_by_stem['var_ashline_rig_corsair_blade_v01']['tris_added']} |"
    )
    a(
        "| lancer_sniper / choir_zealot / quiet_ghost | production Wasp (gap) | "
        f"Reach lance kit · Choir zealot kit +{pack_tris['choir_zealot']} · Quiet ghost kit +{pack_tris['quiet_ghost']} + hostile map entries |"
    )
    a(
        f"| SCN/MTS/Free trade hubs | `place_station_trade_hub.glb` | overlays SCN +{hub_tris['scn']} · MTS +{hub_tris['mts']} · Free +{hub_tris['free']} |"
    )
    a("")
    a("### Distinguished-by axes (same role, ≥3 axes)")
    a("")
    a("Same-role cells diverge on named bible contrast-table axes (see JSON `distinguishedBy`). Example **patrol**:")
    a("")
    a("| Faction | Axes | Construction answer |")
    a("|---|---|---|")
    a("| SCN | Segmentation, Fasteners, Repair, Modules | Recessed torx + rail splits + color-matched plate kit (`var_wasp_scn_patrol`) |")
    a("| MTS | Segmentation, Fasteners, Paint, Modules | Clamshell fairings + hidden seals (`var_wasp_mts_escort`) |")
    a("| Free | Segmentation, Fasteners, Repair, Decals | Hand rivets + untrimmed patches (`var_wasp_free_militia`) |")
    a("| DMC | Fasteners, Repair, Cleanliness, Modules | Dome rivets + overplate + ore dust kit pack |")
    a("")
    a("## Per-faction fleet lineup")
    a("")
    a("### Solar Concord Navy (`faction_scn`)")
    a("")
    a("- **Patrol / escort:** `var_wasp_scn_patrol_v01` — framed dorsal plates, two-tone band, recessed fasteners (bible §1).")
    a("- **Law / customs:** modular `hull_interceptor` + scn_law kit + military pulse barrel (high-sec ambient).")
    a("- **Hauler / courier / miner:** Span/Lark/Cradle donors + SCN kit language (orthogonal rails, hatch frames).")
    a("- **Military station presence:** trade-hub SCN overlay (bastions, customs booms, cladding band).")
    a("- **Wear:** high-sec skew fresh; serviceWorn default.")
    a("")
    a("### Meridian Trade Syndicate (`faction_mts`)")
    a("")
    a("- **Patrol / escort:** `var_wasp_mts_escort_v01` — clamshells, gold zone, conformal blisters (§2).")
    a("- **Hauler:** `var_helios_span_mts_sealed_v01` — sealed cargo clamshells + logo.")
    a("- **Courier / miner / express:** Lark/Cradle/freighter + MTS access/sensor kit; express ideally remapped to sealed Span later.")
    a("- **Hub:** MTS commerce rings + holo boards overlay.")
    a("- **Wear:** freshest corporate skew.")
    a("")
    a("### Drift Miners Collective (`faction_dmc`)")
    a("")
    a("- **Miner (identity role):** Cradle + full rivet/gusset/orebox kit language; hauler uses baked `var_helios_span_dmc_orebox_v01`.")
    a("- **Patrol / escort:** production Wasp + DMC industrial kit (no baked wasp DMC yet — gap).")
    a("- **Weapons:** industrial clamp barrel variant.")
    a("- **Wear:** serviceWorn/patched heavy; ore dust baseline.")
    a("")
    a("### Free Frontier (`faction_free`)")
    a("")
    a("- **Militia patrol/escort:** `var_wasp_free_militia_v01` — bolt-on plates, conduit, hand rivets.")
    a("- **Hauler / courier / miner / smuggler:** kit packs (tape-and-pray, mixed plates).")
    a("- **Hub:** free habitat-pod / scrap-skirt overlay.")
    a("- **Wear:** patched-heavy even in mid-sec.")
    a("")
    a("### Crimson Reach (`faction_reach`)")
    a("")
    a("- **Reaver:** `var_ashline_rig_reaver_hook_v01` — grapple/crane scavenger.")
    a("- **Corsair:** `var_ashline_rig_corsair_blade_v01` — ram lip + blade plates (split from reaver).")
    a("- **Swarmer / bruiser / jackal / PD:** dart/lode donors + scrap kits; jackal/PD close hostile-map gaps.")
    a("- **Lancer sniper:** kit on Wasp until dedicated lance body exists.")
    a("- **Scrap hauler:** `var_helios_span_reach_scrap_v01`.")
    a("- **Wear:** patched-dominant; soot proud.")
    a("")
    a("### The Quiet (`faction_quiet`)")
    a("")
    a("- **quiet_ghost:** bonded flush kit on Wasp + `faction_quiet` profile (dim emissive, no registration).")
    a("- **Smuggler / miner:** multirole/cradle + anonymous blanking language.")
    a("- **Wear:** serviceWorn; flats wiped.")
    a("")
    a("### Ascendant Choir (`faction_choir`)")
    a("")
    a("- **choir_zealot:** lancet rails + ritual rivets + heat shrine kit on Wasp + `faction_choir` (brightest emissive).")
    a("- **Wear:** serviceWorn with doctrinal votive soot.")
    a("")
    a("### The Vael (`faction_vael`)")
    a("")
    a("- No default-route traffic/hostile ship cells in first-hour core (zone/late content).")
    a("- **Gap:** organic re-proportioned kit required before any Vael cell; rectangular kit is a defect per bible.")
    a("")
    a("## Total new-asset cost")
    a("")
    cr = doc["costRollup"]["foundryCandidateGeometryTris"]
    a("| Bucket | Tris |")
    a("|---|---:|")
    a(f"| Kit library (47 pieces, shared) | {cr['kit_all_pieces']} |")
    a(f"| Lane F variant overlays (tris_added) | {cr['lane_f_variants_tris_added']} |")
    a(f"| Hero wasp overlays (tris_added) | {cr['hero_wasp_tris_added']} |")
    a(f"| Hero trade-hub overlays | {cr['hero_hub_overlay_tris']} |")
    a(f"| Scenery props (shared pool) | {cr['scenery_props_tris']} |")
    a(f"| **Sum unique candidate geometry** | **{cr['sum']}** |")
    a("")
    a(f"- **Textures unique (shared):** 12 maps (1 decal atlas + 3 trim + 8 grime masks).")
    a(f"- **Materials unique per cell:** 0 — shared `KitMat_*` + donor materials + runtime tint.")
    a(f"- **Cells in matrix:** {doc['costRollup']['cellCount']} "
      f"(baked-variant-bearing: {doc['costRollup']['cellsWithBakedVariant']}; "
      f"kit-only: {doc['costRollup']['cellsKitOnly']}).")
    a("")
    a("## Sector wear modifiers")
    a("")
    a("| Band | Wear skew |")
    a("|---|---|")
    a("| High-sec | fresh ↑ / patched ↓ (renormalize) |")
    a("| Mid-sec | use cell baseline `wearTierDistribution` |")
    a("| Fringe | patched ↑ / fresh ↓ |")
    a("")
    a("## TOP 5 integration actions (do NOT edit in this batch)")
    a("")
    for t in doc["top5IntegrationActions"]:
        a(f"### {t['rank']}. {t['action']}")
        a("")
        a(f"- **File:** `{t['file']}`")
        a(f"- **Map:** `{t['map']}`")
        a(f"- **Candidates:** {', '.join(f'`{c}`' for c in t['candidates'])}")
        a(f"- **First-hour visibility:** {t['firstHourVisibility']}")
        a(f"- **Tris delta:** {t['trisDeltaVsLive']}")
        a("")
    a("## Gaps (not invented as cells)")
    a("")
    for g in doc["gaps"]:
        a(f"- **`{g['id']}`** — {g['need']} _(fallback: {g['fallbackUsedInMatrix']})_")
    a("")
    a("## Cell index")
    a("")
    a("| Faction | Role | Donor | Tris added | Integration |")
    a("|---|---|---|---:|---|")
    for c in doc["cells"]:
        p = c["proposed"]
        integ = p["integrationRequirement"]
        if len(integ) > 80:
            integ = integ[:77] + "..."
        a(
            f"| {c['faction']} | {c['role']} | `{p['donor']}` | {p['expectedRuntimeCost']['trisAdded']} | {integ} |"
        )
    a("")
    a("---")
    a("")
    a("*Generated by `tools_g_build_matrix.py` (Lane G). No live `src/` or release maps modified.*")
    a("")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
