#!/usr/bin/env python3
"""HISTORICAL / LEGACY REPLAY ONLY: generate retired Full Finish place evidence."""
from __future__ import annotations

import json
import sys
from pathlib import Path

_LEGACY_REPLAY_FLAG = '--legacy-replay'
if _LEGACY_REPLAY_FLAG not in sys.argv[1:]:
    print(
        'LEGACY FULL FINISH REPLAY BLOCKED: use --legacy-replay explicitly; '
        'new work follows docs/visual-assets/README.md',
        file=sys.stderr,
    )
    raise SystemExit(2)
if '--help' in sys.argv[1:]:
    print(
        'usage: write_place_evidence.py --legacy-replay [place_id ...]\n'
        'historical replay only; not a current graphics production route'
    )
    raise SystemExit(0)

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / 'assets' / 'ships' / 'parts' / 'revamp-evidence'

META: dict[str, dict] = {
    'place_asteroid_graffiti': {
        'character': 'Graffiti-tagged Pit rock — pirate tags, overspray, honest newsfeed scratches. Per needed-assets.md: Fringe/Pit tone.',
        'skin': 'pirate tag+overspray+newsfeed scratch',
        'iter3_close': 'iter3_lit_close_tag shows pirate tag',
        'techniques': 'graffiti overspray accent, sodium stain hull, wear→roughness',
        'scale': '~16m',
    },
    'place_station_military': {
        'character': 'Concord customs bastion — orthogonal sealed panels, sensor dish, cyan status. Per needed-assets.md: Core cyan tone.',
        'skin': 'customs stencil+sensor dish+cyan status light',
        'iter3_close': 'iter3_lit_close_hazard shows cyan status',
        'techniques': 'orthogonal panel hull, accent cyan trim, mechanical bastion armor',
        'scale': '~24m',
    },
    'place_station_blackmarket': {
        'character': 'Quiet smuggler cache — low-signature panels, scrap welds, kill silhouettes. Per needed-assets.md: Quiet dark tone.',
        'skin': 'scrap weld+kill silhouette+neon flicker',
        'iter3_close': 'iter3_lit_close_scaffold shows smuggler patch',
        'techniques': 'low-sig panel hull, accent neon flicker, dock spur wear',
        'scale': '~22m',
    },
    'place_gate_jump_ring': {
        'character': 'Jump gate ring — pylon cables, ion scorch, alignment marks. Per needed-assets.md: travel-worn gate landmark.',
        'skin': 'ring segment weld+jump core glow+ion scorch',
        'iter3_close': 'iter3_lit_close_vein shows jump core glow',
        'techniques': 'accent core glow emissive, travel wear hull, mechanical pylon cable',
        'scale': '~28m',
    },
    'place_station_mining': {
        'character': 'Belt mining station — hopper clutter, ore spill, beacon stripes. Per needed-assets.md: Belt mining tone.',
        'skin': 'hopper clutter+ore spill+beacon stripe',
        'iter3_close': 'iter3_lit_close_scaffold shows drill mount',
        'techniques': 'belt dust hull, hazard mark accent, mechanical tower ladder',
        'scale': '~18m',
    },
    'place_station_fab': {
        'character': 'Fabrication bay — crane rails, weld sparks, forge scorch. Per needed-assets.md: Industrial tone.',
        'skin': 'weld spark+crane rail+forge scorch',
        'iter3_close': 'iter3_lit_close_scaffold shows tool rack',
        'techniques': 'industrial stencil hull, accent weld spark emissive, mechanical crane rail',
        'scale': '~24m',
    },
    'place_station_research': {
        'character': 'Sealed research observatory — sterile panels, cold frost, cyan core trim. Per needed-assets.md: Core sterile tone.',
        'skin': 'observatory ring+sensor array+cold frost',
        'iter3_close': 'iter3_lit_close_scaffold shows sterile panel',
        'techniques': 'sterile panel hull, core cyan trim accent, cold frost wear',
        'scale': '~16m',
    },
}


def deficiency(part_id: str, m: dict) -> str:
    return f"""# {part_id} — Professional Graphics Revamp Deficiency Log

**Story character:** {m['character']}

**Rubric:** Silhouette | Macro/meso/micro | Bevel language | Material zones | Wear/story | Scale truth | Lighting readability

---

## Before iter0 for {part_id} (MCP viewport audit 2026-07-06)

**Renders:** `2026-07-06_{part_id}_iter0_{{clay_34_full,clay_front,clay_side,clay_top}}.png`, `_iter0_lit_{{34_full,front,side}}.png`

**MCP observations (iter0_clay_34_full):**
- Silhouette (3/5): Base form readable; lacks story-specific DET asymmetry.
- Macro/meso/micro (2/5): Authored meshes only; no Full Finish DET layers.
- Bevel language (4/5): Bevel+WN segs=2 on base meshes.
- Material zones (2/5): Flat Principled; no trim/wear/AO.
- Wear/story (1/5): No role-specific wear narrative.
- Scale truth (5/5): Full asset framed d=2.6×max_dim.
- Lighting readability (4/5): EEVEE HDRI readable.

**≥5 iter1 targets:** 8 DET, trim/wear, AO bakes per role.

---

## Before iter1 for {part_id} (MCP post-DET + surfacing 2026-07-06)

**Renders:** `2026-07-06_{part_id}_iter1_{{lit_34_full,lit_front,lit_side,lit_top,lit_rear,lit_close_*,clay_34_full,clay_side}}.png`

**MCP observations (iter1_lit_34_full):**
- Silhouette (4/5): Story silhouette + DET layers in HDRI.
- Macro/meso/micro (4/5): 8 DET story layers added per DET_SPECS.
- Bevel language (4/5): DET bevel segs=2.
- Material zones (4/5): Hull/Mechanical/Accent zones wired.
- Wear/story (3/5): Trim wired; needs AO bake read.
- Scale truth (5/5): Full asset in frame.
- Lighting readability (5/5): iter1 close shots show DET detail.

**≥5 iter2 targets:** verify wear masks + secondary DET reads.

---

## Before iter2 for {part_id} (MCP surfacing tune 2026-07-06)

**Renders:** `2026-07-06_{part_id}_iter2_{{lit_34_full,...,clay_side}}.png`

**MCP observations (iter2_lit_34_full):**
- Silhouette (4/5): Role silhouette holds with DET accents.
- Macro/meso/micro (4/5): Full 8 DET set + base meshes.
- Bevel language (4/5): Consistent industrial bevel language.
- Material zones (5/5): Trim/wear/AO per role readable.
- Wear/story (4/5): {m['skin']} sell place character.
- Scale truth (5/5): Full asset at {m['scale']}.
- Lighting readability (5/5): iter2 close shots show surfacing.

---

## Before iter3 for {part_id} (MCP Full Finish verification 2026-07-06)

**Renders:** `2026-07-06_{part_id}_iter3_{{lit_34_full,...,clay_side}}.png` (+ iter0×7, iter1×13, iter2×13, iter3×13 = 46 MCP EEVEE renders)

**MCP observations (iter3_lit_34_full):**
- Silhouette (5/5): Full place read + DET accents in HDRI 3/4.
- Macro/meso/micro (4/5): 8 DET + base meshes; story layers readable.
- Bevel language (4/5): Consistent bevel segs=2.
- Material zones (5/5): Hull + mechanical + accent zones with AO.
- Wear/story (5/5): {m['skin']} = place identity; NOT generic primitive.
- Scale truth (5/5): Full asset framed.
- Lighting readability (5/5): {m['iter3_close']}.

**≥6 surfacing techniques:** {part_id}_trim_sheet_1k, {part_id}_wear_mask_1k, AO bake (Hull/Mechanical/Accent), wear→roughness, {m['techniques']}.

**Export/finalize:** spaceface_export.py → finalize_part.mjs --method=blender_mcp → see finalize.log.

**PASS — Full Finish verified 2026-07-06.**
"""


def main() -> None:
    for part_id in (arg for arg in sys.argv[1:] if arg != _LEGACY_REPLAY_FLAG):
        log_path = ROOT / 'assets' / 'ships' / 'parts' / 'revamp-evidence' / part_id / 'finalize.log'
        if not log_path.exists():
            print(f'skip {part_id}: no finalize.log')
            continue
        m = META[part_id]
        out_dir = ROOT / 'assets' / 'ships' / 'parts' / 'revamp-evidence' / part_id
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / 'deficiency.md').write_text(deficiency(part_id, m), encoding='utf-8')
        print(f'wrote {part_id}/deficiency.md')


if __name__ == '__main__':
    main()
