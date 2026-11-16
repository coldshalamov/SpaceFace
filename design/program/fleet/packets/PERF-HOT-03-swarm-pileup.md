# PERF-HOT-03 — Stop the Swarm round's draw-call pile-up (behaviour-preserving except item 2)

Evidence: `.devshots/fleet/runs/INV-06-swarm-draw-growth.grok.2026-11-16T00-34-50/RECEIPT.md` (measured census). Same
rules as PERF-HOT-01/02: verify each item at HEAD first, one commit per item, exact paths, tests before/after.

## Items
1. **Credit chips.** Every kill drops a six-mesh chip (`src/render/visualFactory.js` ~3791 `buildCreditChip`;
   drop at `src/systems/survivalRewards.js` ~202); 14 chips = 84 draw calls. Draw all live chips with one
   `InstancedMesh` per chip part (6 calls total, any number of chips), keeping the exact look (same geometry,
   materials, scale, spin/bob). Pickup/scoop and the round-clear sweep must behave the same.
2. **Brood remains are not cargo pods (look fix + cost).** Brood remains are ordinary payloads, so
   `packagedPropSpec` (`src/render/visualOverrides.js` ~1039–1057) bolts a full LOD0 `pod_cargo_container.glb`
   onto each husk (5 calls, ~7.7k tris each) while the procedural husk flakes (`visualFactory.js` ~7492
   `buildBroodRemainVisual`, `hideImmediately: false` at ~1051) stay drawn. A brood husk must look like brood
   remains, not a cargo container: exclude brood remains from the packaged-prop path so they render only as
   their own husk visual. Find the field that marks a brood remain (`data.kind` / source) and test that a brood
   remain gets no packaged pod while real cargo payloads still do.
3. **Off-screen kestrel stand-in kits.** Nine invisible kestrel admission kits (351 meshes, ~353k triangles) stay
   mounted from t≈60 s through the Armory (`visualOverrides.js` ~777 substrate, `partsLibrary.js` ~3022 boundary;
   roster prewarm mounts `boundary.visible = false`). Find why they stay mounted after prewarm/admission and
   release them (or share one kit) when no live entity uses them. If releasing would force a re-compile when
   the next kestrel spawns, keep the programs warm but drop the per-instance kit, and say what you did.

## Checks
Each touched file's tests before/after (`grep -l`), plus any test mentioning `creditChip`, `broodRemain`,
`packagedProp`, `rosterPrewarm`. `npm run check:sim` if any `src/systems` file changes. No game boot.
