#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
JOB="$ROOT/design/program/vm-drop/ranger-chase"
SCRATCH="${TMPDIR:-/tmp}/spaceface-ranger-c6"
C5_COMMIT="e9dc277ab081436b49da3336f28ccd0348749347"
mkdir -p "$SCRATCH"

for lod in 0 1 2; do
  git -C "$ROOT" show "$C5_COMMIT:assets/ships/fleet_player_bodies_v1/ranger/source/wholeships/ranger_production_v1_lod${lod}.glb" > "$SCRATCH/ranger_c5_lod${lod}.glb"
done

blender --background --python "$JOB/build_ranger_chase_form_c6.py" -- \
  --source-lod0 "$SCRATCH/ranger_c5_lod0.glb" \
  --source-lod1 "$SCRATCH/ranger_c5_lod1.glb" \
  --source-lod2 "$SCRATCH/ranger_c5_lod2.glb" \
  --out-dir "$JOB" --lods 0,1,2

blender --background --python "$JOB/render_ranger_chase_cpu.py" -- \
  --glb "$JOB/ranger_c6_lod0.glb" --out "$JOB" --ship ranger --samples 24
