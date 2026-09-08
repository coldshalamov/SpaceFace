<!-- LIFETIME: DURABLE -->
# Asset repurpose pool

Owner ruling (2026-09-08): a random duplicate copy of a model is garbage; a **worked variant with a
genuinely different design** is future content. The game's roster needs many distinct silhouettes
(miner, tanker, tug, customs, scavenger, heavy hauler, fast interceptor, specialist — see
`design/VISION.md` "Everything important should have a silhouette"), so these stay on disk and in
the repo until each is either reworked into an NPC/faction hull or explicitly retired by the owner.

This file is informative (`DURABLE`): it dispatches nothing and reserves nothing.

## In the pool

| Asset | Size | What it is | Repurpose pitch |
|---|---|---|---|
| `assets/ships/m4_ashline_v2/` | 134MB | Candidate-only hostile hull family with its own acceptance gate (`scripts/check-m4-ashline-v2.mjs`, unwired) and a Quaternius donor kit inside. Live Ashline Dart/Maul/Hook use `assets/ships/m4_ashline/PROVENANCE.json` instead. | Extra Reach-hostile body or a mid-tier pirate hull; wire its gate once repurposed. |
| `assets/ships/kestrel_borrowed_time_v2/`, `_v3/` | 55 + 54MB | Earlier hero generations, genuinely different takes on the Borrowed Time. | Elite/ace variant of the Kestrel line, or donor geometry for a player ship tier. Legacy gates `scripts/check-kestrel-borrowed-time-v2/-v3.mjs` are unwired. |
| `assets/ships/m4_hero_hauler/` | 26MB | Distinct heavy-hauler silhouette; no manifest reference. Live hauler role is `helios_span`. | Heavy freighter or tug NPC — reads as mass at top-down camera. |
| `assets/ships/m5_kestrel_upgrade/` | 69MB | **Owner-supplied** Borrowed Time revamp candidate, isolated by its own README. | Player ship upgrade tier or a unique named NPC. Do not delete without an explicit owner decision. |
| `assets/incubator/npc_activity_pack/evidence/role-identification-sheet.png` | 2.8MB | Role identification sheets for NPC craft (kept deliberately when the surrounding evidence strips were purged). | Silhouette reference for new NPC roles. |

## Deleted 2026-09-08 (recoverable from git history if ever wanted)

Superseded same-design generations and capture evidence — NOT distinct designs, so not pool
material: `m4_helios_hub_v2..v12` + `_v6_1` (superseded by the sha-bound promotion recorded in
`m4_helios_hub/production/promotion-report.json`), `kestrel_borrowed_time_v4/source_candidates/`
+ `release_candidates/` (hitch_polish v7/v8/v9, material_truth_v6 iteration snapshots),
`fleet_player_bodies_v1/*/evidence/`, `kestrel_borrowed_time_v4/evidence/`, `assets/works/*/evidence/`,
`assets/incubator/*/evidence/` (minus the two `build-report.json` feeds and the role sheet),
`assets/third_party/helios_v4/v5/v8/v9/v11/v12/dense_candidates` (superseded vendor rounds;
`helios_v3` stays — it is `VENDOR_ROOT` for `tools/blender/build_m4_helios_hub_v3.py`).

## Capture policy going forward

`.gitignore` now ignores capture media under `assets/**/evidence/` (png/jpg/webm/mp4/gif), so
iteration evidence stops landing in the repo. Verdict `.md`/`.json` reports there remain trackable;
anything genuinely worth keeping in an `evidence/` dir needs an explicit `git add -f`.

## Flagged for the sector lane (not changed here)

`design/reference-sector/` still gates Tethys on a *named human reviewer* and
`scripts`/`ceresFiveMinuteAcceptance.mjs` (`evaluateCeresHumanReview`) implements that gate in code.
Policy (`AGENTS.md` §4) says no human verdict is an execution gate. Docs and code must be reconciled
together by whoever owns that lane; a doc-only edit would make the docs lie about the check.
