<!-- LIFETIME: VOLATILE -->
# NOW — active work and path leases

```yaml
refreshed: 2026-07-26
baseCommit: aca82bb0c586df0d9f1cd506b04f7afaa408144a
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
| `C:/Users/93rob/sf-ctl-a` → `claude/pq018-phase2-worldsite-20260726` | controller run 2026-07-26 | `src/data/worldSite*.js`, `src/data/wreckCathedralEvidenceCatalog.js`, `src/systems/worldSiteKernel.js`, `test/world-site-*`, `test/m2-world-records.test.mjs`, `test/pq018-wreck-cathedral-site.test.mjs` | PQ-018 Phase 2 lease. Write set deliberately excludes `assets/**`. |
| `C:/Users/93rob/sf-ctl-b` → `claude/pq023-vp220-port-20260726` | controller run 2026-07-26 | `src/render/thruster/**`, `src/render/vfx.js`, `src/render/vfxProfiles.js`, `test/vp220-*`, `test/kestrel-production-thruster-bind.test.mjs`, `scripts/check-*vfx*.mjs` | PQ-023 propulsion-port lease. Disjoint from the Phase 2 lease. |

## Current program facts needed for dispatch

| Item | Current fact | Consequence |
|---|---|---|
| Default player route | **Playable.** `npm run check:visual-stability` exits 0 at `aca82bb0` — 360 frames, 16 ships, `failureCount: 0`, no page errors. A previous entry here claiming `place_debris_chunk` "stalls playable flight" was measured and is **false**. | Do not treat the route as blocked. Route-acceptance work may proceed. |
| `check:assets:live` | Red: `75 !== 77` at `scripts/probe-authored-assets-live.mjs:118`. The two failures are the **release** artifacts for `place_debris_chunk` and `place_dead_hulk`. The probe reaches playable flight first and fails afterwards in a bulk loader sweep. | A degraded POI prop, not a boot failure. Owned by the visual-production lane. |
| `check:art` | Red at **link 1 of 23** — `test/asset-pipeline-gate-wiring.test.mjs:27`, `check:ci reaches the asset-pipeline contract through check:art exactly once (0 !== 1)`. This is a `package.json` script-wiring assertion; the chain never reaches any GLB probe. | Do not attribute `check:art` redness to assets. Fixing it is a `package.json` wiring change, currently mutex-held. |
| PQ-007 | Focused-green correction integrated; current Browser/Electron route acceptance remains open | Do not restore the rejected pursuit-slot mechanics from historical prose. Treat route evidence as a separate acceptance task. |
| PQ-017 | World Site kernel integrated; writer lease released | PQ-018 may consume the integrated manifest/kernel/runtime contract after re-reading current symbols. |
| PQ-018 | Leaf `PQ-018.asset-admission` is implemented/focused_green: the Cathedral is release-built, manifest-registered, and loads live through the ordinary place path. Site wiring, Ceres placement, evidence receipts, and route acceptance remain. | Use `roadmap/active/PQ-018.md` from Phase 2. The source hash is frozen at `f335935f…`; do not rebuild it from zero. Phase 2 must reconcile `worldSiteAssetBindings.js` (binds `spaceface.socketRole`) with this asset's `spaceface.semanticRole` markers, and generalise the binding-key assertion in `test/world-site-assets.test.mjs` before a second site lands. |
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
