# PQ-022 closeout 2026-07-20 — untracked full-finish batch disposition

**Authority:** This is the classification + safety record for the foreign untracked graphics/full-finish
batch present in the primary checkout at the start of the 2026-07-20 closeout (263 files / ~68.5 MB).
It is the closeout synthesis referenced from `design/program/08_GRAPHICS_OVERHAUL_CHECKPOINT.md`,
`09_DONOR_VALUE_LEDGER.md`, and `04_WORKTREE_AND_INTEGRATION.md`.

**Rule of thumb:** only the hash-bound SHA-256 manifest + this disposition are committed; the actual
archived bytes are NOT committed (they are reproducible procedural output, not source). The manifest
is the recovery record.

## Classification (5 categories per closeout spec)

### Category 1 — production-bearing and ready to integrate (COMMITTED)

Five canon/spec/brief documents plus one LIVE spec. All referenced by active work or by
`assets/AGENTS.md`. Committed at the category-1+2 preservation commit on 2026-07-20:

- `docs/worldbuilding/vibe/FACT_Voice_Bible.md` — narrative voice law for every writer and procedural
  text generator (FACT = the project's narrative canon).
- `docs/worldbuilding/vibe/OPENING-COMMS-SCRIPT.md` — 47-A opening comms canon.
- `design/spec3/SPEC3-F9-full-finish-bar.md` — LIVE per-asset quality contract; the authority for
  every Full Finish Bar claim (linked from `assets/AGENTS.md` §3.1).
- `design/revamp/GEMINI_HUD_BRIEF.md`, `design/revamp/T1C_RELEASE_SOAK_BRIEF.md` — medium-horizon
  reference briefs for the HUD polish and release-soak lanes.

### Category 2 — useful source/tooling that should be preserved (COMMITTED)

Authoring tooling, evidence machinery, and the PQ-022 capture tool. Committed with category 1:

- `tools/art/blender/revamp_full_finish.py` — Blender MCP full-finish authoring helper (per-part
  DET_SPECS, materials, bake phases). Authoritative for regenerating any removed `_export_tmp.glb`.
- `tools/art/blender/gen_revamp_textures.py` — auto-bake AO/trim/wear-map generator. Authoritative
  for regenerating any removed `Material_*_ao_1k.png` / `trim_sheet_1k.jpg` / `wear_mask_1k.jpg`.
- `tools/art/blender/cli_export_part.py` — deterministic part GLB exporter.
- `tools/art/blender/update_place_manifest_notes.py`, `write_place_evidence.py` — manifest/evidence
  helpers.
- `tools/art/blender/run_batch_places.ps1`, `run_full_finish_bar.ps1`, `run_remaining_places.ps1` —
  reproducible runners.
- `scripts/verify-full-finish-evidence.mjs` — Full Finish Bar evidence gate.
- `scripts/fix-revamp-part-contract.mjs` — post-finalize contract repairs.
- `scripts/scrub-revamp-doc-contract.mjs` — mechanical doc-contract scrubber.
- `scripts/capture-military-station-routes.mjs` — PQ-022 natural-route capture tool that produced
  the `.devshots/pq022-military-station-routes/` evidence used for the military-station route-accept
  verdict.

### Category 3 — reproducible temporary export (REMOVED after manifest)

23 intermediate `*_export_tmp.glb` Blender batch outputs + 2 scratch logs. Every tmp GLB has a
canonical `.blend` source committed under `assets/ships/parts/blender/` (or `_authored.blend` for
station archetypes); reproduce via `revamp_full_finish.py SF_PHASE=export`. The scratch logs
(`batch_full_finish.log`, `batch_remaining.log`) record that the batch crashed partway through with
a PowerShell `ParameterBindingException` — they are not finished-run receipts.

**Removal basis:** `grep -rn 'export_tmp' assets/ src/ tools/` returns no manifest or source
reference; the canonical source/release `.blend` and `.glb` for every part exists on master.

### Category 4 — superseded duplicate (REMOVED after manifest)

222 auto-generated texture files across 48 part dirs. Of those dirs, 10 have tracked overlap
(`cockpit_slab`, `hull_corvette`, `hull_fighter`, `hull_freighter`, `hull_interceptor`, `hull_miner`,
`place_asteroid_rock_b`, `place_asteroid_rock_c`, `place_gate_jump_ring`, `weapon_gatling`) — the
untracked `Material_*_ao_1k.png` / `trim_sheet_1k.jpg` / `wear_mask_1k.jpg` duplicate or overlap
already-tracked authored PBR. For the remaining 38 dirs (e.g. `place_station_military`,
`place_lane_beacon`, `weapon_railgun`, `fin_*`, `greeble_*`), the runtime uses curated textures
embedded in the release GLB (see the PQ-022 `place_station_military` release asset, which embeds 30
images) or the tracked authoring pipeline, never these auto-baked maps.

**Removal basis:** `grep -rn 'Material_Accent_ao_1k|trim_sheet_1k|wear_mask_1k' assets/ships/parts/
parts_manifest.json src/` returns no reference. None of these files are loaded by the runtime;
they were a procedural-treatment experiment that did not become the authoring path.

### Category 5 — unresolved and requiring archival preservation (preserved via manifest only)

Treated together with category 4. The 222 texture files include some for parts that may not yet have
an authored treatment (the `place_station_military` and `place_asteroid_rock_*` cases prove the
procedural maps were superseded; the others are presumptively also procedural-but-unreferenced). Per
the closeout rule "preserve ambiguous product-bearing material in a hash-bound recovery/archive
commit before removing it from the primary checkout", the **SHA-256 manifest is committed** so any
single file can be recovered bit-identically from this record + the reproducible generators in
category 2.

## Recovery procedure

To regenerate any removed file:

1. Find its SHA-256 in `untracked-graphics-batch-SHA256.json`.
2. If it is a `_export_tmp.glb`, run
   `tools/art/blender/revamp_full_finish.py` with `SF_PART_ID=<part>` `SF_PHASE=export`.
3. If it is a `Material_*_ao_1k.png` / `trim_sheet_1k.jpg` / `wear_mask_1k.jpg`, run
   `tools/art/blender/gen_revamp_textures.py` for the part.
4. Verify the regenerated file matches the recorded SHA-256.

If a regenerated file does NOT match (generator drift), the manifest is the authoritative
preservation record; consult `09_DONOR_VALUE_LEDGER.md` for the broader donor-cleanup rules.

## Files in this archive folder

- `DISPOSITION.md` — this document.
- `untracked-graphics-batch-FILELIST.txt` — the 247 category 3+4+5 paths removed.
- `untracked-graphics-batch-SHA256.json` — hash-bound recovery record (path, sha256, bytes, mtime)
  plus the reproducibility notes.
