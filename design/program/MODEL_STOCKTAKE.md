<!-- LIFETIME: DURABLE -->
# 3D stocktake — research the shelf, then plan the A-list picture

Copy-paste operator: [`MODEL_STOCKTAKE_GOAL.txt`](./MODEL_STOCKTAKE_GOAL.txt).

This is **research and a plan**, not a modeling campaign. The session that runs the goal
does not remaster a ship, does not wire a factory hull, and does not open a second queue.
It produces a live inventory and an ordered plan that folds into the packets that already
own the work.

Live execution after the plan exists still goes through
[`../../build_map.md`](../../build_map.md) **§13D** (`PQ-193`), flyable remaster `PQ-050`,
unused-pack fielding `PQ-136`, liner G7 `PQ-049.05`. Hitch / Kestrel stays frozen.

---

## 1. Why this exists

The repo is a dirty shelf: live Hitch-class bodies, factory clones, unpackaged remasters,
accessory-only kits, code-built tubes, and authored work nobody loads. Filename greps and
dated catalogs (`needed-assets.md`, the 2026-08-08 visual catalog) lie. `PQ-193` is the
opening-flyby board from a 2026-09-09 census; it is not a complete stocktake of every
model, duplicate, or missing role.

The owner asked for one research pass that starts from **what we already have** and lays
out the cheapest path to one manufactured world: fully built, actually used, nothing
wonky or half-abandoned on the default route, same quality language as Hitch, without
paying for new commissions while a shelf body can fill the slot.

---

## 2. The bar (do not invent another)

1. **One game.** A stranger shown Hitch and the nearest NPC / buoy / dock does not ask
   which title each is from. Role may differ. Construction language may not.
2. **Complete hulls.** No floating engine, wing, socket, or glow blob. An empty targeting
   lock is a defect.
3. **Jets are jets.** Reverse / brake is force leaving a nozzle, same family as the main
   drive.
4. **A valid file is not accepted art.** Packaged and wired is not Hitch-plus.
5. **Equal quality, not cheaper Hitch.** Do not pass a gate by dumping Hitch, cutting
   default quality, or deleting live detail. Performance spend is residency, batching,
   and joining by material — never a worse picture.

Chase camera only (`play_chase`, `play_chase_abeam`, `play_chase_close`). No seats, no
studio three-quarter, no cabin kits.

---

## 3. Truth sources (live maps beat inventories)

Read these. Do not dispatch from a filename list.

| Source | What it is actually |
|---|---|
| `src/render/partsLibrary.js` whole-ship / place / pod maps | What the game will try to load |
| `src/render/assetLoader.js` allowlists (`SOURCE_ROUTE_ALLOWLIST`, empty-admission / `PACKAGED_LIVE`) | What the loader will refuse, so a lock can sit on blank space |
| `src/data/ships.js` roster | The 13 buyable / flyable identities |
| `assets/ships/release/release_manifest.json` | Packaged bytes on disk — not “accepted” |
| `npm run check:asset-reachability` | Referenced vs unreferenced runtime assets |
| `npm run check:live-whole-ship-admission` | Whether live slots are allowed to publish |
| [`WORLD_VISUAL_CENSUS.md`](./WORLD_VISUAL_CENSUS.md) | Code-built objects with **no** model file |
| Default Helios / Kessler flyby, shipping chase camera | What the player actually sees |
| [`PQ-193.md`](./roadmap/active/PQ-193.md) / build_map §13D | Already-admitted never-broken order |
| [`PQ-050.md`](./roadmap/active/PQ-050.md) | One-ship remaster order |
| [`PQ-136.md`](./roadmap/active/PQ-136.md) + 2026-08-24 hull triage | Unused-pack fielding dispositions |
| `design/graphics-sprints/HULL_TRIAGE_2026-08-24.md` | FIELD / VARIANT / RESERVED / CANNOT-USE |

Dated, not live status:

- `needed-assets.md` (still calls Hitch / Pelican / Wasp blocked)
- `design/graphics-sprints/VISUAL_ASSET_CATALOG.md` (2026-08-08 snapshot)
- `design/graphics-sprints/GRAPHICS_ORPHAN_CENSUS.md` (2026-08-09 salvage notes)

Use those as archaeology. Re-prove every row against live maps.

---

## 4. How to count (never a filename grep)

Count **slots the player can see**, then the files that feed them.

A slot is a live selector, a default-route spawn, a mission object, a station, a
place mark, a pod, a wreck, a drone, a gate, or a code-built stand-in. One authored
GLB that nothing loads is not a slot — it is shelf.

For each slot, name:

- the player-facing thing (one sentence)
- the live file or “code-built, no file”
- whether it is packaged and allowlisted
- chase-camera grade vs Hitch (accepted / candidate / falls-apart / wrong-game / tube / invisible)
- shelf cousins (unused remaster, faction kit, incubator pack, worktree leftover)
- the cheapest honest next action

Do not count LOD1/2, cabin interiors, or studio beauty as missing pieces. Distant cheap
LODs are a later performance unlock, not “looks broken.”

---

## 5. Verdicts (one per slot or shelf body)

| Verdict | Meaning | Typical next owner |
|---|---|---|
| **KEEP** | Live, complete, same game as Hitch at chase size | none |
| **ADMIT** | Packaged complete body the loader still refuses | `PQ-193.00` |
| **IMPROVE-IN-PLACE** | Live file exists; form or surfacing is the weakness | `PQ-193.01`–`.05`, `PQ-050` if flyable |
| **ENCLOSE** | Accessory-only / floating parts; needs a meeting hull | `PQ-193.01` / `.08` |
| **REPURPOSE** | Unused authored body that beats live after package + chase stills | `PQ-193.06`–`.09` or `PQ-136` |
| **REMAP-AFTER-PROOF** | Factory remaster of an already-live hull. Do not swap until packaged **and** better | `PQ-050` live-body remaster, not a silent selector swap |
| **RETIRE** | Half-built, superseded, or cannot beat live. Checkpoint so nobody wires it | ledger / triage row; do not delete in the research session |
| **COMMISSION-LAST** | Default-route slot with no shelf body and no live file | new leaf under `PQ-193` only after Waves A–B |

A variant (faction kit, enclosed tanker, damage/wreck) counts as fielding. A second
object that skips the live slot is a fail.

---

## 6. Efficiency order (the plan must obey this)

Do not start variety, commissions, or a second buyable remaster until the opening
flyby is true.

1. **Nothing invisible or falling apart** on the default route (`PQ-193.00` / `.01`).
2. **Reverse is a jet** (`PQ-193.02`).
3. **Upgrade the object that is already there** — buoys, pods, 47-A family, drones,
   gates, mines, wrecks (`PQ-193.03`–`.05`, census A). Same-slot replace.
4. **Field the shelf that already beats live** (Corsair, Arclight, tanker/cutter,
   faction kits) (`PQ-193.06`–`.09`). Package before wiring.
5. **One flyable remaster at a time** (`PQ-050`, Hornet residual first). Chase camera.
   Do not remap unused `*_production_v1` onto live traffic until that exact body is
   packaged and better.
6. **Places in the game, not only in Blender** (`PQ-193.10`–`.12`).
7. **Commission** only for a named default-route hole the shelf cannot fill.
8. **Retire** half-built junk so it cannot be selected.

Reuse before authoring. Improve before replacing. Replace before commissioning.

---

## 7. What the research session must write

Three artifacts, then stop. No GLB edits.

1. **`design/program/MODEL_STOCKTAKE_MANIFEST.md`** — every player-visible
   3D slot plus every unused authored body worth a verdict. Tables, not essays. Include
   code-built census A. Update [`WORLD_VISUAL_CENSUS.md`](./WORLD_VISUAL_CENSUS.md) if a
   live primitive is missing from it.
2. **`design/program/MODEL_STOCKTAKE_PLAN.md`** — the ordered work in owner
   words: what to keep, improve, repurpose, retire, and (last) commission. Each row names
   the **existing** packet leaf (`PQ-193.xx`, `PQ-050.xx`, `PQ-136`, `PQ-049.05`). New
   leaf only when no packet owns the slot. Call out anything §13D missed.
3. **Queue fold** — if the plan needs a new leaf, add it to `PQ-193.md`, `build_map.md`
   §13D, and `program-queue.json` as a dispatch unit. Do not create `PQ-194` for this.
   Do not duplicate Hornet / liner G7.

Also write a one-page owner report: what is already good, what looks broken, what we
already own and are wasting, what we actually still need to build, and the first unit
another agent should take (`--id PQ-193`).

---

## 8. Performance (equal picture)

The plan may name residency, meshopt/KTX2 packages, join-by-material, and not
permanently residenting a new fleet. It may not name “turn down shadows / bloom /
population / Hitch detail” as the path to A-list. Distant LOD1/2 selectors stay
**later**, not this stocktake’s broken-picture list.

---

## 9. How agents get this wrong

- Filename-grep “unused” and calling that the inventory.
- Dispatching from `needed-assets.md` or the 2026-08-08 catalog.
- Treating a packaged GLB as accepted art.
- Recommending a remap of an unpackaged factory remaster (that already made traffic
  invisible once).
- Opening a parallel graphics queue beside `PQ-193` / `PQ-050` / `PQ-136`.
- Commissioning a new hull for a slot a shelf body already fills.
- Starting Corsair / Arclight / a new ship while the opening NPC is still a kitbash.
- Scoring studio crops, seats, or interiors.
- Cutting default quality or dumping Hitch to make the world “match.”
- Implementing the plan in the same session that was asked to research it.
- Editing Hitch / Kestrel.

---

## 10. Stop conditions

- The session starts modeling, re-UVing, or wiring selectors.
- Hitch freeze set is being edited.
- A live `NOW.md` row owns an exact path the fold needs; finish every disjoint
  artifact, hand off that hunk.
- The proposed “fix” is a procedural fallback hull, a glow card, or a quality cut.
- Browser stills of the default route are unavailable for a visual grade; mark that
  row `unproven` and keep inventorying from live maps.
