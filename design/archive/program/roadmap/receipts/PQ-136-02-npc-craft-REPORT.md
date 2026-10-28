<!-- LIFETIME: HISTORICAL -->
# PQ-136.02 — Field the npc_activity_pack craft: receipt

- **packetId:** PQ-136
- **leafId:** PQ-136.02
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS (partial by art ruling — see residuals)
- **acceptance:** focused_green

## What changed

Four previously-unfielded occupational craft now spawn in ordinary ambient traffic with real jobs
on existing phase machines — no new AI path, no new spawn loop, no cap raised:

| Craft | Role | Note |
|---|---|---|
| `rescue_lifter` | `rescue` | rescue was a shipping role with no whole-ship body; it now wears the semantically exact hull. This is a visual change to live content, recorded here deliberately. |
| `prospector_skiff` | `prospector` | new occupational role on existing job machinery |
| `scrap_sweeper` | `sweeper` | new occupational role on existing job machinery |
| `apron_shuttle` | `shuttle` only | the `express` binding a first draft added was REMOVED — PQ-049 owns express identity, and a shipped liner must not silently re-skin |

Files: `src/render/partsLibrary.js` (+18, additive role rows, file+assetId always from the same
map), `src/systems/traffic.js` (+54/−16, role wiring by widening existing conditions),
`src/data/occupationalTrafficCraft.js` (new, 70 lines), `test/unused-model-live-wire.test.mjs`
(rewritten, see below).

## The art-history ruling (controller decision)

Three pack hulls — `volatiles_tanker`, `yard_tug`, `inspection_cutter`-as-customs — were wired once
(`aef7caad`) and **deliberately unwired after still reviews** (`8257fd9e`, "missing-hull kit").
Re-fielding them without a new review would reverse a recorded art verdict, so they are **held**:
no routing anywhere, both on-disk copies preserved, queued for a fresh chase-camera still review.
The guard test now asserts BOTH truths: the four cleared craft spawn live (400-seed sim sweep,
GLB + assetId + jobId asserted), and the three rejected hulls reach no traffic role, no whole-ship
map, and customs hostiles keep the Hornet — mutation-verified (re-adding `tanker` turns the guard
red with a named message).

## What passed (controller-verified, not lane-claimed)

`test/unused-model-live-wire.test.mjs` 6/6; the four traffic suites 47/47; `check:asset-reachability`
green at 276 (the count could not rise inside the write set: all pack bodies were already
render-package-referenced — the packet's rise clause was unsatisfiable and is voided here). LF
endings; write set exactly respected; every embedded GLB assetId spot-extracted and matched.

## Honest residuals / follow-ups

- Fresh chase-camera still review for the three held hulls (GPU lane queue).
- `customs` role lacks a scanner label in `targetPanel.js` (others already mapped).
- `FREIGHT_TRADING_ROLES` (`src/economy/freightCausality.js`) and `CIVILIAN_TRAFFIC_ROLES`
  (`src/systems/pirateRumor.js`) do not include the new roles — deliberate write-set discipline;
  small follow-ups.
- Blocked outright (no released body exists): `construction_rig`, `ore_barge_b`,
  `volatiles_tanker_b`, `salvage_cutter_damaged`.
