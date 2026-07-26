<!-- LIFETIME: VOLATILE -->
# NOW — active work and path leases

```yaml
refreshed: 2026-07-26
baseCommit: b266515a7095b07e2b707b6dcc93f1900d2dc4de
expiresAfterCommits: 25
expiresAfterDays: 7
```

Refresh this board before mutation. It records live collision risk, not history or completion evidence. Exact packet status remains in the queue and receipts.

## Occupied or protected surfaces

| Domain | Owner/ref | Protected paths or mutex | Disposition |
|---|---|---|---|
| Primary checkout visual production | user-directed Grok asset run + **live Blender session** | `assets/ships/parts/**` sources it authored, `src/core/graphicsProfileBootstrap.js`, generated texture/export candidates, and Blender logs | **ACTIVE WRITER — do not stage, stash, revert, rebuild, or clean.** Blender is resident and re-exporting; `place_debris_chunk` / `place_dead_hulk` / `place_dock_interior` sources were rewritten at 22:59 / 23:05 / 23:14 local on 2026-07-25, after commit `3fbd77cf`. The `blender` and `asset-manifest` mutexes are HELD. |
| `place_debris_chunk`, `place_dead_hulk`, `place_dock_interior` | visual production lane (in progress) | Those source GLBs | Re-export underway; as of the last sample the new sources still carry 0 images / 0 textures / no UV0 / empty `asset.extras`, so the release pair remains stale. 3 of 6 touched. |
| `place_asteroid_rock_a/b/c` | visual production lane (not yet started) | Those source GLBs, release artifacts, `parts_manifest.json` rows | Untouched since 2026-07-11. Still awaiting re-authoring. |
| Committed candidate refs | named local/remote branches and registered worktrees | Their branch tips and worktree metadata | These are not active writers. Preserve the refs as reviewable candidates; do not merge or rebase them merely for a checkpoint. **Both leading PQ-018 branches would revert all six place GLBs and delete the authoring textures retained at `329acfe8` — never merge them wholesale.** |
| `design/PERFORMANCE_OPTIMIZATION_CONSTELLATION.md` | unidentified concurrent agent | That file | **Created 2026-07-26 00:55 and intent-added to the index.** Not owned by the controller run. Because it sits in the index, a plain `git commit` will sweep it into an unrelated commit — **use pathspec-limited commits** (`git commit -- <paths>`) until its owner lands it. A `git merge` in the primary checkout also fails against it ("Entry not uptodate"); integrate by fast-forward from a lane instead of stashing. |
| `sf-ctl-a` / `sf-ctl-b` / `sf-ctl-c` / `sf-ctl-d` worktrees | controller run 2026-07-26 — **leases released** | — | All four lanes are merged and released. The worktrees are intentionally **left in place**: each holds a `node_modules` **Windows junction** to the primary checkout, and `git worktree remove` would follow the junction and destroy the primary's dependencies. Remove the junction first if these are ever cleaned up. `sf-ctl-a` holds a preserved, deliberately unintegrated PQ-018 candidate. |

## Current program facts needed for dispatch

| Item | Current fact | Consequence |
|---|---|---|
| Default player route | **Playable.** `npm run check:visual-stability` exits 0 at `aca82bb0` — 360 frames, 16 ships, `failureCount: 0`, no page errors. A previous entry here claiming `place_debris_chunk` "stalls playable flight" was measured and is **false**. | Do not treat the route as blocked. Route-acceptance work may proceed. |
| `check:assets:live` | Red: `75 !== 77` at `scripts/probe-authored-assets-live.mjs:118`. The two failures are the **release** artifacts for `place_debris_chunk` and `place_dead_hulk`. The probe reaches playable flight first and fails afterwards in a bulk loader sweep. | A degraded POI prop, not a boot failure. Owned by the visual-production lane. |
| `check:art` | Red at **link 1 of 23** — `test/asset-pipeline-gate-wiring.test.mjs:27`, `check:ci reaches the asset-pipeline contract through check:art exactly once (0 !== 1)`. This is a `package.json` script-wiring assertion; the chain never reaches any GLB probe. | Do not attribute `check:art` redness to assets. Fixing it is a `package.json` wiring change, currently mutex-held. |
| PQ-007 | Focused-green correction integrated; current Browser/Electron route acceptance remains open | Do not restore the rejected pursuit-slot mechanics from historical prose. Treat route evidence as a separate acceptance task. |
| PQ-017 | World Site kernel integrated; writer lease released | PQ-018 may consume the integrated manifest/kernel/runtime contract after re-reading current symbols. |
| PQ-018 | **Phases 0-3 integrated** at `aef540d3`; queue state `focused_green`. The Cathedral is a placed Ceres World Site with seven components, a physical black-box payload, and five evidence pages. | **Phase 4 only** remains: Browser/Electron route acceptance, game-camera visual review, matched Ceres performance, and the independent art verdict on the frozen source. The Ceres coordinate reservation (local `(300,2700)`, global `(-11988,10892)`, 76.632 WU clearance) is **owned by PQ-018; PQ-020 consumes it and may not relocate it.** |
| PQ-021 | **Integrated** at `b266515a`; queue state `focused_green`. The Ledger is reachable from a station destination and a Codex tab and reads the five Cathedral pages by direct lookup. | Phase 4 open: no earning through the physical route, no Browser/Electron parity, no media-at-crop check, no legibility review. Its route harness and broker manifest were not built. |
| PQ-023 | **One leaf integrated** at `cdcbac32` (propulsion family); queue state `planned`. Still an **umbrella** — six cue families remain. | The branch's relaxation of the idle-sleep perf invariant was refused; `check-vfx-frame-sleep.mjs` is byte-identical to master. Consequence: no always-on idle nozzle glow. No visual or performance acceptance exists for this leaf. |
| Uncovered invariant, now closed | `operation-unreachable` (`worldSiteKernel.js:243`) throws at boot via `_ensureWorldSiteRecords`, and nothing asserted it. | `test/world-site-operation-reachability.test.mjs` (5 cases) is wired into the pq017 world-site fast gate. Do not relax `reachableOperations` without it. |
| PQ-019–PQ-025 | Planned corridor | Use their active packets and entry gates. Do not dispatch an umbrella row when a prerequisite leaf packet is required. |

## Preserved candidates, not active authority

- Wreck Cathedral source asset and evidence are committed and reusable; current runtime contracts decide promotion.
- Narrative, Lark, and VP-220 candidates remain on named recovery refs. They are not merged, accepted, or leased merely because they exist.
- Historical planning handoffs under `docs/handoffs/chatgpt-portfolio-20260723/` are reference material. Active packets supersede their dispatch prose while retaining grounded technical findings.

## Refresh procedure

Before claiming a packet:

1. re-run `git status --short` and `git worktree list`;
2. inspect open branches/PRs touching the packet's write surfaces;
3. compare this file's `baseCommit` to HEAD and refresh when the expiry is exceeded or any listed owner changes;
4. record the packet lease and exact paths before implementation;
5. remove or update the lease immediately when work is integrated, abandoned, or moved.

Do not append closeout narratives here. Put exact-revision evidence in a receipt and rely on Git history for the rest.
