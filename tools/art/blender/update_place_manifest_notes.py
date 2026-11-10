#!/usr/bin/env python3
"""HISTORICAL / LEGACY REPLAY ONLY: patch retired Full Finish manifest notes."""
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
        'usage: update_place_manifest_notes.py --legacy-replay\n'
        'historical replay only; not a current graphics production route'
    )
    raise SystemExit(0)

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = ROOT / 'assets' / 'ships' / 'parts' / 'parts_manifest.json'

NOTES = {
    'place_station_blackmarket': 'PRO Full Finish 2026-07-06 — trim/wear + AO bakes (Hull/Mech/Accent) + Quiet smuggler scrap weld/kill silhouette/neon flicker DET via blender_mcp. 46 MCP EEVEE renders. tris={tris}.',
    'place_gate_jump_ring': 'PRO Full Finish 2026-07-06 — trim/wear + AO bakes (Hull/Mech/Accent) + jump ring segment weld/core glow/ion scorch DET via blender_mcp. 46 MCP EEVEE renders. tris={tris}.',
    'place_station_mining': 'PRO Full Finish 2026-07-06 — trim/wear + AO bakes (Hull/Mech/Accent) + Belt hopper clutter/ore spill/beacon stripe DET via blender_mcp. 46 MCP EEVEE renders. tris={tris}.',
    'place_station_fab': 'PRO Full Finish 2026-07-06 — trim/wear + AO bakes (Hull/Mech/Accent) + industrial weld spark/crane rail/forge scorch DET via blender_mcp. 46 MCP EEVEE renders. tris={tris}.',
    'place_station_research': 'PRO Full Finish 2026-07-06 — trim/wear + AO bakes (Hull/Mech/Accent) + sterile observatory ring/sensor array/cold frost DET via blender_mcp. 46 MCP EEVEE renders. tris={tris}.',
}


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for entry in data.get('parts', []):
        pid = entry.get('id')
        if pid not in NOTES:
            continue
        log_path = ROOT / 'assets' / 'ships' / 'parts' / 'revamp-evidence' / pid / 'finalize.log'
        if not log_path.exists():
            print(f'skip {pid}: no finalize.log')
            continue
        fin = json.loads(log_path.read_text(encoding='utf-8'))
        entry['tris'] = fin['tris']
        entry['bytes'] = fin['bytes']
        entry['note'] = NOTES[pid].format(tris=fin['tris'])
        print(f'updated {pid}: {fin["tris"]} tris')
    MANIFEST.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
