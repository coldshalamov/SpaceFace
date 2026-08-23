# RECEIPT — Dirty-tree adoption, 2026-08-22

**Session:** 2026-08-22, master. **Base:** `2630d9a9`.
**Task:** review, finish, commit and push everything dirty in the worktree.
**Outcome:** done. 2,375 status entries (~3,000 real files, 788 MB) reduced to a clean tree
across eight commits, all pushed.

---

## 1. Orphan determination

Every lane was dead before adoption, by three independent measures:

- Last commit on master `2630d9a9` at **18:22**; adoption began **22:15**.
- Newest dirty file in any lane: **173 minutes** old (rover). Every lane past the 90-minute line.
- `node scripts/check-now-liveness.mjs` independently reported **both** `NOW.md` rows STALE and
  printed its own instruction: *"Any agent may ADOPT this work … and DELETE this row."*

No `git`, `codex`, or `cursor-agent` writer process existed. Cursor, python and blender-mcp were
running, but none had written either asset root since 20:00 — the mtimes carry the verdict, not the
process table.

A 0-byte `.git/index.lock` from 19:12 (199 min) was cleared after proving it was held open by no
process. A 0-byte lock contains no index data — git writes the new index *into* the lock and then
renames — so clearing it cannot lose staged content, and `git diff --cached` was empty besides
intent-to-add markers.

## 2. The deletion question — 1,011 reported, 895 real

This was the only irreversible risk in the job, so it was settled before anything was committed.

| Class | Count | Verdict |
|---|---|---|
| Hornet `evidence/hornet/cycles/**` | **895** | **Real.** Intentional, contract-mandated prune. |
| Hornet `surgical/form_v1..v4` | 35 | Phantom — `git add -N` markers, empty blob, never in HEAD. |
| Rover `source/textures` | 81 | Phantom — same, purged by the builder before first commit. |

`git status` renders both events as ` D`. Only HEAD can tell them apart: the rover lane has **zero**
files in HEAD, so nothing there could be lost.

The 895 are one scripted sweep — all 184 cycle directory mtimes fall inside **0.22 s** at 19:09:39 —
removing exactly five filenames (`orm_isolation`, `normal_isolation`, `id_or_material_id`,
`grazing_close`, `drive_rear`) from cycles 05–183. Not one directory was left half-pruned: after the
sweep every cycle dir holds exactly one of four intact signatures. Perfect rectangularity is a
script; damage is ragged. `PQ-050.md` step 7 of every cycle is *"Clean up old cycle stills and
leftover iter folders"*, and leaving them is listed there as invalidating a cycle.

**Over-reach found:** the same sweep also stripped `cycle_184`, the live build, which is therefore on
record without the five isolation proofs `ADVANCED_MODEL_TECHNIQUE_CONTRACT.md` requires for MTX-08 /
13 / 23. The builder still writes all five — this is over-reach, not a change of contract. C185
re-renders them. Recorded in the commit and in `cycle_184.md`.

## 3. What landed

| Commit | Lane |
|---|---|
| `b433c072` | Hitch-attribution median + frame-dt clamp counter (PQ-051) |
| `22dc978f` | Asteroid Works renderer/screen; removed a boot-silent module throw |
| `e5aa5cbb` | npm entries for both new tests; ignore consumed one-shot patch scripts |
| `a0fcae0f` | **Chase camera axis fix** — the camera was under the keel |
| `3a3a6139` | Hornet evidence prune (895 files) |
| `bd30f797` | Rover authored asset, first landing (1,881 files, PQ-131) |
| `bd03c7d7` | Hornet cycle 184 reviewed + logged; surgical ladder + `LADDER_STATE.md` |
| _(this)_ | Rover cycle 78 reviewed + logged; `NOW.md` cleared; receipt |

### The review step both asset lanes had skipped

Both orphaned asset lanes stopped at the same place: a cycle **built, rendered and hash-sealed, then
abandoned before anyone judged it.** Hornet C184 had no `cycle_184.md` and no `CYCLE_LOG.md` row;
rover C78 had no `cycle_078.md` and an empty `reviews/`. Under `PQ-050.md` and the rover's own prompt
set, a cycle is three stills **plus three reviews** — so neither was a cycle yet.

Six independent reviewers were run, one per still, each blind to the others. **All six returned
REVISE**, and — without being asked to — five of them independently diffed their still against the
previous cycle and reported the same thing:

| Cycle | View | Delta vs previous cycle |
|---|---|---|
| Hornet 184 | play_chase | 198 px = **1.8%** of the ship |
| Hornet 184 | play_chase_abeam | 222 px = **2.0%** |
| Hornet 184 | play_chase_close | 1,124 px = **1.7%** |
| Rover 78 | works_top | 1,031 px = **1.0%** |
| Rover 78 | works_edge | ~220 px, all in one strip |
| Rover 78 | works_site | **zero visible change** — both crops carry exactly 484 lit pixels |

Neither cycle was a full-job attempt; both are the anti-gaming row each packet already forbids, now
with a number attached. That measurement is the durable output here — it is cheap, it is
ungameable, and no prior cycle in either lane recorded it.

## 4. The three findings that outrank the rest

**1. The chase camera was photographing the wrong side of the ship.**
`spaceface_chase_camera.py` transcribed the live controller's three.js offset
`(0, D·sin60, −D·cos60)` verbatim into Blender, where **+Z is up, not +Y**. At the standard pose that
put the camera at Blender **z = −72.0** — seventy-two units *below* the ship, looking up at the keel.
Correct is **z = +124.7**. Every Hornet cycle still through C151 photographed the belly mirrored. The
fix had sat uncommitted through 33 cycles. Dozens of logged verdicts — "the canopy will not read",
"visor is a sticker", "wing planform missed" — were reports about surfaces the camera was not pointed
at. Blast radius is deliberate and stated: four `MATERIAL_TRUTH_PREFLIGHT.json` files name this module
as the camera authority and four build scripts import it, so every ship's review pose changes. The old
pose could not reproduce the game's framing.

**2. A module-load `throw` would have deleted the mining board in total silence.**
The orphaned asteroid lane guarded a new invariant with a top-level `throw`.
`uiRoot.registerScreens()` imports every screen behind a `.catch()` that only `console.warn`s — its
own comment says *"a missing/throwing module is logged and skipped"*. So it would not have crashed
anything; it would have removed the entire Asteroid Works board from the game while boot and every
headless check stayed green. That is the exact failure class `check:playable` exists for. The
diagnostic stays; the gate moved to six Node tests, negative-tested (mutating the ring order turns 4
of 6 red).

**3. Two tests existed that nothing ran.**
Neither `render-hitch-attribution` nor the new `asteroid-works-render` had an npm entry, and this repo
has no blanket test runner. Both are now named checks **and** spliced into the `check` aggregate. A
test with no entry is a dead file in a different costume.

## 5. Verification

- `npm run check:playable` — **15/15**, run alone (concurrent headless Chromium fails on this
  integrated Intel GPU; every subagent was denied browser access for the whole job).
- `npm run check:hitch-attribution` — 32/32. `check:asteroid-works-render` — 6/6.
  `check:runtime-witness` — green. 97/97 across the nine node-only asteroid test files.
- **15 mutations, 0 survivors** on the perf lane. Four of them passed *before* this session — including
  a reset that dropped the ring write pointer, which left the median reporting the previous session's
  value with the test still green.
- Rover GLBs verified byte-identical between disk, committed blob and the cycle-078 hash sidecar.
- Hornet's three worktree GLB sha256 match `cycle_184.json` exactly.

## 6. Behaviour changed outside any single lane

- **The chase camera pose changes for every ship**, not just Hornet (see §4.1).
- `mining`/runtime untouched; both asset lanes are source-only. Nothing in `src/`, `scripts/`,
  `test/` or `styles/` references `works/rover`, and the Hornet dirty GLBs are authoring copies —
  the runtime loads `assets/ships/parts/` and `assets/ships/release/parts/`, both clean, last
  touched at cycle 85.
- `tools/blender/_patch_*.py` is now gitignored: four consumed one-shot mutators that self-document
  *"Delete after running"*, hardcode an absolute machine path, and target cycle 36–39 of a script now
  at cycle 78.

## 7. Known-red, proven pre-existing, NOT caused by this work

- `test/hitch-detail-census.test.mjs` — its kestrel fixture
  (`kestrel_borrowed_time_v4/source_candidates/hitch_hero_v27/…`) has never existed in git and is not
  on disk. Unwired to any check. Its `hitchBytes > hornetBytes` assertion gets *safer* here: Hornet
  LOD0 shrank 10,413,144 → 10,225,920.
- `extract-localization.mjs --check` and `test/localization-reachability.test.mjs` both exit 1. The
  generated catalog is stale on master — `quitGame` lives in three clean committed files and is absent
  from it, and the catalog cites a line number that at HEAD is inside an unrelated function. Needs a
  `--write`; out of scope here.
- `assets/ships/fleet_player_bodies_v1/build_summary.json` is clean in git but long stale (records
  Hornet at 1,775,176 B / 33,412 tris / 9 materials incl. `Material_Ceramic`; HEAD's LOD0 was already
  10,413,144 B with 8). Drift pre-dates this lane — cycles 181–183 committed GLBs without touching it.
  Hand-editing it would be fabrication.

## 8. Shared-change requests

1. **`machineContacts()` has no consumer.** Added to the asteroid renderer's probe API; the natural
   wiring is an assertion in `scripts/capture-asteroid-works.mjs` proving a bored neighbour releases
   an arm. That file is a browser capture.
2. **The `rt.status` staleness window is still open.** Neither asteroid edit closes it; it needs a
   generation counter on `asteroidSites`, which replaces `rt.status` every tick.
3. **The rover's emissive mask cannot survive glTF export.** `EMIT_ALPHA` paints an emissive mask into
   the basecolor **alpha** channel and wires Alpha → Emission Strength. glTF 2.0 cannot carry that
   link; the exporter dropped it and emitted `emissiveFactor: [1,1,1]` with `emissiveTexture` pointing
   at the basecolor, so in the GLB *every* surface self-illuminates instead of only lamp and bit. The
   Blender stills render the node graph and are correct; **the GLB is not, and the evidence does not
   show what a glTF consumer would see.** Fixing needs a rebuild. Nothing loads these GLBs yet.
4. **No cycle still is a side elevation.** All three mandated Hornet stills are 60-degree plan views;
   `play_chase_abeam` is left-right mirror-symmetric (IoU 0.953 vs 0.466), i.e. nose-on. Wing section,
   well depth and hull cross-section are not adjudicable from any of them, yet reviews have demanded
   exactly those for twenty-plus cycles. Either add a diagnostic profile still (not a cycle still), or
   stop gating on depth the chase camera cannot show.
5. **`build_hornet_chase_form_v4.py` declares `REVISION = "chase_form_v5"`.** Filename and output
   disagree. Left as found — renaming would guess at author intent.
6. **`Grep`/ripgrep returned a false negative** on `assets/ships/fleet_player_bodies_v1`, where
   `grep -rn` and `git grep` both find hits. Do not trust ripgrep scoping on that subtree.

## 9. Not done

- **Neither art verdict was closed, deliberately.** `PQ-050.md` says *"No ship self-promotes to
  accepted"*; Hornet stays a wired candidate at REVISE and C85 remains the live game body. The rover
  is unaccepted and unwired. Those calls are the owner's.
- **`cycle_184`'s five isolation proofs are still missing** (§2). C185 re-renders them.
- **The surgical form line ends on a broken candidate.** v10 renders as three detached fragments;
  `LADDER_STATE.md` records that v7 is the peak and the resume point.
