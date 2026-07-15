# Integration Gate — Integrator Checklist

**One agent, once per handoff batch.** Not parallel with Blender lock holder.

## Preconditions

- [ ] Handoff YAML in `design/graphics-sprints/handoffs/`
- [ ] `blender.LOCK` released OR integrator is same session post-export
- [ ] No `release.__building/` in progress

## Per asset ID

1. [ ] Evidence folder contains current critique, representative renders, and player-route proof
2. [ ] `finalize_part.mjs` / exporter log shows **zero** assertion failures
3. [ ] Source GLB path matches handoff
4. [ ] If **new** id: add to `parts_manifest.json` `parts[]` + `runtimeSlots`
5. [ ] If a wholeship is blocked: run the live body/classification audit before clearing its status

## Build

```bash
npm run build:sg04:release-assets
```

## Gates (all must pass)

```bash
npm run check:parts-manifest
npm run check:assets:live
npm run check:asset-reachability
npm run check:visual-stability
```

For station/place batches add:

```bash
npm run check:station-archetype-glb-load
npm run check:station-archetype-wiring   # after Thread C wires anchors
```

## Update status ledger

Append to `assets/ASSET_STATUS.json` (create if missing):

```json
"engine_vector": {
  "lifecycle": "RELEASE_BUILT",
  "art": "full_finish",
  "review": "independent visual review recorded in evidence folder",
  "handoff": "design/graphics-sprints/handoffs/2026-07-08-A-engines.yaml",
  "wired": [],
  "pending_thread_c": ["PART_LIBRARY_CONTRACT", "engineRecordFor"]
}
```

## Release Thread C

Only after `RELEASE_BUILT` — assign IDs from handoff `thread_c_actions`.

## Failure

If any check fails: **do not wire runtime**. File issue in handoff YAML `integrator_notes` and return to Thread A/B/E.
