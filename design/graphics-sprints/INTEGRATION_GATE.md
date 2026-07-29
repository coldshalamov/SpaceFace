# Integration Gate — Integrator Checklist

> **Activated-sprint checklist.** Use after a named graphics handoff. It does not force ordinary
> coherent asset work into a separate integrator session when the task owns the integration seam and
> no active writer or lock conflicts.

**One agent, once per handoff batch.** Not parallel with Blender lock holder. This checklist proves
release integration only. It cannot set visual acceptance: the current
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md` G0-G7 record, exact candidate hashes, and
required independent review remain authoritative.

## Preconditions

- [ ] Handoff YAML in `design/graphics-sprints/handoffs/`
- [ ] `blender.LOCK` released OR integrator is same session post-export
- [ ] No `release.__building/` in progress

## Per asset ID

1. [ ] Evidence packet names its exact finalized source and release hashes, renderer/build provenance,
   current critique, representative renders, player-route proof, and applicable G0-G7 states
2. [ ] `finalize_part.mjs` / exporter log shows **zero** assertion failures
3. [ ] Source GLB path and hash match the handoff; no fallback or mixed-epoch evidence is substituted
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

## Record integration result, not visual completion

Record this in the currently authorized handoff/evidence record. Do not create a second global status
surface merely to carry the example. `integration_candidate` means the release path is built; it does
not mean `accepted` or `full_finish`.

```json
"engine_vector": {
  "productionState": "integration_candidate",
  "candidate": {
    "sourceSha256": "<exact finalized source sha256>",
    "releaseSha256": "<exact release sha256>"
  },
  "gates": {
    "G0": "pass",
    "G1": "pass",
    "G2": "pass",
    "G3": "pass",
    "G4": "pass",
    "G5": "blocked",
    "G6": "blocked",
    "G7": "blocked"
  },
  "visualAcceptance": "pending",
  "review": "independent review/evidence path or explicit blocker",
  "handoff": "design/graphics-sprints/handoffs/2026-07-08-A-engines.yaml",
  "wired": [],
  "pending_thread_c": ["PART_LIBRARY_CONTRACT", "engineRecordFor"]
}
```

## Release Thread C

Only after the release build and the current owner authorizes the exact runtime seam — assign IDs from
handoff `thread_c_actions`. Wiring does not close any visual gate.

## Failure

If any check fails: **do not wire runtime**. File issue in handoff YAML `integrator_notes` and return to Thread A/B/E.
