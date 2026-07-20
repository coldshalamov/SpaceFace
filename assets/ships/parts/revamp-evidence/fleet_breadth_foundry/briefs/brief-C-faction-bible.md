# LANE C — FACTION SURFACE-LANGUAGE BIBLE + MATERIAL PROFILES

Read `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/briefs/common.md` first and
obey it. You are the art director of this batch: this lane defines the visual language every
other lane implements. Taste and internal coherence matter more here than anywhere else.

## Ground truth to read first

- `src/data/palettes.js` — `FACTION_PALETTES` (primary/secondary/accent/hull/emissive/thruster
  per faction) and `PAINT_PROFILES` (personality: grime/chrome/noseArt/killMarks/patches).
- `src/data/factions.js` — `FACTION_META` (8 factions + paper-only faction_helix).
- `design/depth-program/P3-faction-visual-identity.md` — the faction identity plan; your work
  must extend it, not contradict it.
- Skim 2–3 donor GLB entries in `assets/ships/parts/parts_manifest.json` to know the real
  material-slot vocabulary (Material_Hull / Material_Accent / Material_Glass /
  Material_Mechanical; faction tint MULTIPLIES material.color over the albedo — so painted
  regions must be authored near-neutral grayscale and let the faction tint supply hue).

The 8 factions (canonical anchors — verify against source):
faction_scn Solar Concord Navy #3A78FF lawful · faction_mts Meridian Trade Syndicate #F2B233
corporate · faction_dmc Drift Miners Collective #C9772E blue_collar · faction_reach Crimson
Reach #D8334A pirate · faction_quiet The Quiet #7A5FB0 smuggler · faction_vael The Vael
#2FCFA0 xenophobic · faction_free Free Frontier #4ECBE0 independent · faction_choir Ascendant
Choir #E85FD0 zealot (personality missing from PAINT_PROFILES — define it).

## Deliverable 1: `design/foundry/FACTION_SURFACE_LANGUAGE.md`

For EACH of the 8 factions, a surface language that is more than color:

1. **Armor segmentation** — plate size rhythm, split-line geometry (orthogonal grid? radial?
   irregular scavenge?), overlap direction, where plates concentrate.
2. **Paint application** — factory-sprayed? hand-rolled? masked two-tone? unpainted alloy
   with only mandated markings? Where paint ends and bare metal begins.
3. **Exposed alloy/composite behavior** — what the under-material is and how it responds to
   light (brushed anisotropy? cast dull? ceramic matte? organic sheen for Vael).
4. **Roughness distribution** — where it is smooth vs rough and WHY (traffic, heat, hands).
   Give numeric roughness ranges per zone. Ranges must differ between factions.
5. **Panel-edge treatment** — crisp machined chamfer / rounded worn / burred cut / welded lip.
6. **Fastener + seam language** — rivets? recessed torx strips? external weld beads? clean
   hidden fasteners? spacing and scale (in metres; ships are 8–20 m).
7. **Heat & exhaust wear** — where staining accumulates, its color ramp, how far it spreads.
8. **REPAIR PRACTICE** (the depth lever — same damage, different answer): exactly how this
   faction patches a hull breach, swaps a panel, fixes a pipe. This must be visually
   distinct per faction.
9. **Decals & typography** — registration format (e.g. SCN-7741 vs a Reach kill-tally),
   placement rules, stencil vs holo vs hand-paint, warning-label density.
10. **Emissive placement** — running lights, window strips, vents; color from palette
    `emissive`; intensity discipline (Quiet runs dark; Choir glows).
11. **Cleanliness profile** — dust/carbon/corrosion budget and WHERE it concentrates.
12. **Preferred exterior modules** — which kit families (armor overlays, sensor masts,
    cargo clamps, shrouds) this faction bolts on, and how.

Then: a **cross-faction contrast table** (one row per axis above, one column per faction —
prove no two factions share the same answer on more than 4 of 12 axes), and a **worked
example**: the same donor hull (`hull_fighter`) described under Concord, Reach, and DMC
treatment — a reader must be able to tell them apart from construction alone, with all
three desaturated to gray.

## Deliverable 2: `assets/ships/foundry/fleet_breadth_20260720/materials/material_profiles.json`

Machine-readable, consumed by procedural bake scripts. Schema per faction:

```json
{
  "schema": "sf-foundry-material-profile/1",
  "factions": {
    "faction_scn": {
      "displayName": "Solar Concord Navy",
      "zones": {
        "paint":      {"baseGray": [0.24,0.25,0.26], "roughness": [0.35,0.55], "metalness": 0.0, "note": "tint-multiplied; author neutral"},
        "bareAlloy":  {"baseColor": [r,g,b], "roughness": [lo,hi], "metalness": 0.9, "anisotropyHint": "brushed|cast|none"},
        "machinery":  {...}, "ceramic": {...}, "glassCanopy": {...}, "emissive": {"color": "#hex", "intensity": 1.0}
      },
      "segmentation": {"plateSizeM": [lo,hi], "pattern": "orthogonal|radial|scavenge|organic", "gapWidthM": 0.02, "edgeStyle": "chamfer|round|burr|weld"},
      "fasteners": {"style": "rivet|recessed|weldbead|hidden", "spacingM": 0.15, "scaleM": 0.03},
      "wearTiers": {
        "fresh":   {"edgeWear": 0.05, "grime": 0.05, "chips": 0.0,  "heatStain": 0.1, "patchCount": 0},
        "serviceWorn": {...},
        "patched": {...}
      },
      "grimePlacement": {"recessBias": 0.8, "streakDirection": "airflow|none", "concentrations": ["engine root","panel gaps"]},
      "heatStain": {"colorRamp": ["#hex","#hex"], "spreadM": 1.2, "sites": ["nozzle","vents"]},
      "noiseScales": {"macro": 0.13, "mid": 4.5, "fine": 20.0},
      "decals": {"registrationFormat": "SCN-####", "style": "stencil|holo|handpaint", "density": 0.4, "killMarks": false},
      "repairPractice": "colorMatchedReplacement|rivetOverplate|weldScrapPatch|tapeAndPray|resinRegrowth|panelBlanking",
      "preferredKitFamilies": ["armor_spacer","sensor_housing", "..."]
    }
  }
}
```

Rules: every numeric field must differ meaningfully across factions — identical
noiseScales or roughness ranges across two factions is a defect. The 3 wear tiers per
faction are mandatory (fresh / serviceWorn / patched): this is how the SAME ship varies
over time and place in-game. All values must be physically plausible and implementable
with Principled BSDF + baked maps. Do not invent new runtime material slots.

## Rejection conditions (self-check before finishing)

- Any faction whose identity collapses to a hue swap when the doc is read desaturated.
- Any two factions sharing repair practice AND fastener language.
- Roughness/noise numbers copy-pasted across factions.
- JSON that a bake script could not consume without asking questions (missing units, vague
  strings where numbers belong).

Finish per common protocol (report: `reports/C-FACTION-BIBLE-REPORT.md`).
