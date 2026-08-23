# Goal state — the 2026-08-23 completion thrust

The standing brief was: finish the remaining `CANONICAL_BUILD_MAP.md` plans via delegated lanes, fix
draw-to-fly, make the game performant, polish the frontend, and end-to-end review it. This is the
ledger, so none of it depends on anybody's memory.

## Done

### Draw-to-fly — DONE
Rebuilt from a naive waypoint chaser into a real path follower: arc-length resampling, pure-pursuit
lookahead, signed cross-track error, a curvature speed governor, and a velocity-error command.
Off-line error went from 50-64 WU (with excursions to 409) to under 2 WU median. 20 tests, using
ORDERED coverage because plain coverage is fakeable by flying the line backwards. A follow-up commit
repaired four further defects an adversarial review found. `src/combat/autoTargetMode.js`.

### The Crucible plan (`PQ-133`, build map §12.1) — phases 3-12 COMPLETE
- **3-5** attack algebra: immutable AttackSpec with digest, lineage and shared proc budget,
  propagation, chain/payload/bridge traits.
- **6 + 6b** orbit nodes, Cryo Lock, Thermal Shock — and its three named debts closed: the live helm
  reads the control scale, `status_cryo_lock` is in the catalog, orbit nodes have a runtime identity.
- **7** the thirty-wave arc in three acts. Difficulty by COMPOSITION, never spawn count.
- **8** Lagrange Crucible and Cinder Sluice. **9** Cryo Drift and Storm Lattice. Five arenas now
  express five distinct laws, verified by one hull in all five idle rooms.
- **10a/10b** unlocks, records, mutators, deterministic endless past wave 30, boss circuit,
  extraction, versioned build codes.
- **11** Adventure migration: 15 modifiers became fitted Rigs with mass, energy draw and price; three
  fitted builds produce three distinct causal KINDs with no draft anywhere.
- **12** the content factory. Exit gate proven by diff: a new modifier and wave recipe authored end
  to end with `src/combat/` untouched.

**Phase 13 is NOT engineering.** The plan says it "is not implied by completion of local Crucible. It
is a separate product decision with infrastructure, security, moderation, determinism, and cost
implications." Owner's call.

### `PQ-134.01` — already done, the map was stale
The arcade structural FX had "zero consumers" in the map long after it had four live cue paths.
Corrected with evidence. **`PQ-134.02` (causal VFX/audio grammar) is genuinely still open** and needs
a four-way capture reviewed at play size — art direction, not a lane packet.

### Frontend — five real defects, all found by measuring the running game
1. Three station tabs were **destroying** 12-24px of content off the bottom: `.sx-comms` is
   `position:fixed` so nothing reserved its band, and `.sx-app` clips, so the overflow was
   unreachable rather than scrollable.
2. `.sx-fac` row 3 was a hardcoded 100px carrying 136.8px of standing ladder.
3. **You could not reach MAIN MENU from the pause screen at 1152x720** — `max-height` with no
   `overflow`.
4. The tab strip lied about which tab was selected: attention amber out-shouted selection white
   (margin 1.18x, now 3.68x), and the attention tab lost its selection colour when selected.
5. `el.hidden = true` is defeated by any author `display` rule, so the Footprint board (436x888) drew
   on top of its own empty state. Fixed globally.

Plus the Crucible door's unlock ladder and run history, and causal tags in the results screen.

### Performance
- **Orbit runtime: 126x.** It compiled a full attack spec per ship per tick to discover nobody had
  orbit. 2.3 ms/frame at 40 ships to 0.018 ms.
- **Boot diagnosed.** ~12 s headless, and the cause is that SwiftShader lacks
  `KHR_parallel_shader_compile` so THREE compiles serially. A real GPU HAS the extension. Five
  intermittently-red checks were this, not the game.

### Checks
Started at 251/272 passing. The full matrix is the only honest measure — `npm run check:ci:report`.

## Still open

| Item | Note |
| --- | --- |
| `PQ-134.02` causal VFX/audio grammar | Needs a four-way capture reviewed at play size |
| 47-A courier delivery (2 checks) | Asserts a throw-assist removed on purpose. Do NOT widen `maxDistance` |
| `check-depth-program-a1` | Asserts a transient POI id deliberately replaced by a stable one |
| `check-parts-manifest` (559 failures) | Hundreds of `_export_tmp.glb` committed and declared. Art lane |
| `check-galaxy-map-inspector` | Real: `onShow` draws before the cadence boundary |
| `probe-flight-visual` | 4,212-warning flood, caller not yet pinned |
| Asset family (~5 checks) | Release assets not built/compressed |
| Ship art (PQ-050, PQ-131) | Owner acceptance only; nothing self-promotes |
| Disk | Was 345 MB free of 1 TB; 117 GB reclaimed from process artifacts |

## Rules learned that must not be re-learned
- **No git worktrees in this repo.** Each costs 4-16 GB and nothing cleans them up.
- **A red check is one of four things** — real defect, stale contract, deliberately removed
  behaviour, or load artefact — and they need opposite responses. Three of today's were load.
- **Ranking is not enough in a check.** "Selection is the most salient" passed on the very layout it
  was written to catch; the defect was the MARGIN.
- **A negative test that restores from HEAD tests nothing** if the fix is already committed.
- **Verify a plan row before filling the gap it names.** Four of four re-tested rows in the frontend
  gap table had aged; so had the PQ-134 section.
