# Dock / hulk / debris remaster checkpoint

**Last updated:** 2026-07-28
**Disposition:** `blocked` at G5 runtime presentation, G6 live performance/LOD, and G7 independent
art acceptance. Offline source and release checkpoints are integrated.

This is the durable front door for the three opening-route place remasters. It supersedes the old
iter219/iter280 density loop and its `G1_FORM` resume instructions.

## Mandatory craft route for any reopened authoring

This handoff records an offline checkpoint and the remaining G5-G7 acceptance work; it does not
create a separate art bar. Before changing any source because current player-route evidence identifies
a concrete regression, read `assets/ships/AGENTS.md` → `docs/visual-assets/README.md` →
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`. For plastic/clay/LEGO-like construction,
unexplained primitive stacks or glowing hoops/disks, or a fiction/material mismatch, also load
`.grok/skills/spaceface-blender-material-truth/SKILL.md`.

That remediation begins with a component fiction/material bill and shape-grammar audit; it preserves
the frozen role, dimensions, sockets, collision, and route composition. Use a generated reference only
for the exact blocked component, never as a whole-place replacement or PBR source. If the worker needs
that selected method but lacks image generation, use `docs/visual-assets/AGENT_PROMPTS.md` § E to hand
the bounded component to Codex. When connected Blender is available, keep the complete surfaced place
in Material Preview or Rendered shading while authoring. Headless outputs/clay views may diagnose but
cannot close G4; eligible evidence must be rerendered from the exact finalized source GLB and bound to
the source/renderer hashes.

## Scope and player routes

| Asset | Runtime role | Primary route |
|---|---|---|
| `place_dock_interior` | neutral H-04 Shipworks preview bay | Station → Shipworks selected-ship preview |
| `place_dead_hulk` | commercial carrier/drill-tender wreck | freeflight derelict/wreck POIs |
| `place_debris_chunk` | manufactured pressure-module fragment | freeflight wreck fields and salvage POIs |

The dock is a preview backdrop, not a flyable interior. The `_military` and `_grit` dock variants
were not remastered in this slice.

## Integrated artifacts

| Asset | Editable Blender source | Source GLB | Release GLB |
|---|---|---|---|
| debris | 3,923,870 B · `AA31D88E1EBE73D146995CE073B52A9E9849E98D8C19B7F77BFF5FF6F5C5B16E` | 4,172,188 B · `2B728182D45000CE89A353066371513038CDB09C231332C0971758B763331BE6` | 1,527,596 B · `016E7A103A40B7BA3183D56FCEF1362AEA0C3723274B49D4AB2439AE51151A26` |
| dead hulk | 5,010,011 B · `E3187B52879050E16C82EBEB7B353102D5F4688BEF97A4A6EF44315CACB65609` | 5,424,740 B · `7D083B28B73550434C5C4783C85719C0C6C437AB68DFC9EAE4122CA1872D0327` | 1,919,816 B · `C2C421C6FF4B87CB92566560E080190F77AC14336B0FC43045BD2BE9D02BA185` |
| dock | 20,865,932 B · `87A89A9977C1C849EB2CED3C8272B71FDE1D916E24E012D641197CBFA34A5FD5` | 22,905,000 B · `630A1780E2490BA0D4D7D401DAD8547085ED7A26A1F26A22A85FD5A5D00B1C60` | 8,749,356 B · `926CB7784E61F8ADCC533945C4C254F8D7E0AF14EFEFF465BFD8B2CAA6F0A6DE` |

Source and release rows are exact in `assets/ships/parts/parts_manifest.json` and
`assets/ships/release/release_manifest.json`.

## Production stop ledger

| Asset | Candidate state | Earliest open gate | Offline decision | Matched evidence |
|---|---|---|---|---|
| debris | source + release promoted | G5 runtime presentation | **KEEP** the deterministic rupture/load-path rebuild | `C:\Users\93rob\.codex\visualizations\2026\07\28\019fa6a4-f178-7530-8a98-a35eab6ec617\debris-rebuild-v4\matched-fast\debris_candidate_v4_sheet.png` |
| dead hulk | source + release promoted | G5 runtime presentation | **KEEP** the continuous carrier/drill-tender method reset | `C:\Users\93rob\.codex\visualizations\2026\07\28\019fa6a4-f178-7530-8a98-a35eab6ec617\hulk-rebuild-v4\matched-fast\hulk_candidate_v4_sheet.png` |
| dock | source + release promoted and modern/legacy preview route wired | G5 runtime presentation | **REVISE**, then **KEEP** the open-front v3 source after rejecting the obstructed three-portal candidate | `C:\Users\93rob\.codex\visualizations\2026\07\28\019fa6a4-f178-7530-8a98-a35eab6ec617\dock-rebuild-v3\runtime-composition-kestrel\shipworks-runtime-yaw-000.png` plus yaw 45°/90° siblings |

The exact blocker is shared headed acceptance ownership, not source authoring: PQ-034 holds
`browser-gpu`, `performance-evidence`, and `validation-broker`. The smallest unblock action is to
run the existing lower gates and request the normal Browser/Electron route after those leases are
released. G7 then requires a person who did not author the candidates.

Release-size deltas versus the superseded release files are approximately: debris 12.22 MB → 1.53
MB, hulk 5.11 MB → 1.92 MB, and dock 11.45 MB → 8.75 MB. These are artifact-size deltas, not claims
about frame time, draw calls, residency, or perceived quality.

## What changed

### Manufactured debris

`opening_debris_chunk_v4` replaces the soft twin-pod/spring read with one pressure module whose
rupture, rooted frame, severed members, insulation, and tether clevis share one load path.

- Builder: `tools/blender/remaster_opening_debris_chunk_v1.py`
- Authored LOD triangles: 12,396 / 4,660 / 1,790 (18,846 total)
- Contract: root `place_debris_chunk`; `SOCKET_Tether_Massline` at glTF `[2, 1, 0]`
- Release: 21/21 KTX2 textures; 77 Meshopt buffer views

### Dead hulk

`opening_dead_hulk_v1` replaces the symmetric dumbbell/citadel with a continuous commercial
carrier/drill-tender and a single starboard/dorsal rupture expressed through shell, longeron,
bulkhead, insulation, liner, and service systems.

- Builder: `tools/blender/remaster_opening_dead_hulk_v1.py`
- Authored LOD triangles: 18,324 / 9,236 / 2,756 (30,316 total)
- Contract: root `place_dead_hulk`; `SOCKET_Hazard_Core`; `SOCKET_Salvage_Core`; no unsupported hooks
- Release: 21/21 KTX2 textures; 73 Meshopt buffer views

### H-04 Shipworks dock

`opening_dock_interior_h04_v3` replaces the sealed slab with an open-front industrial service bowl:
one rear structural portal, outer roof stringers, rear-parked crane, pressure bulkhead, service
plinth, and a 28 m × 28 m × 13 m clear preview aperture.

The first three-portal candidate was rejected because foreground machinery obscured representative
ships. The corrected source removes that geometry instead of hiding the problem with exposure or a
camera trick.

- Builder: `tools/blender/remaster_opening_dock_interior_v2.py`
- Editable Blender LOD triangles: 21,248 / 6,216 / 2,292
- Preview GLB: LOD0 only, because `shipPreviewMount` currently renders every primitive and owns no
  place-asset LOD selector
- Contract: root `place_dock_interior`; `SOCKET_Structure_Core`; 52 m × 36 m × 17.2 m envelope
- Release: 31/31 KTX2 textures; 41 Meshopt buffer views

## Shipworks integration

The modern and compatibility Shipworks routes now resolve the accepted neutral dock and mount it
through `src/ui/shipPreviewMount.js`. The untouched military/grit variants are deliberately
unrouted: adversarial headless sampling found that their sealed foreground geometry hid the ship.
They must pass this same composition gate before being restored to station-specific routing.

The dock transform is derived from the selected ship's yaw-neutral bounds: one uniform scale
preserves the authored bay proportions, floor clearance adapts to ship height, and the selected ship
remains centered over the bay floor. Every Shipworks show/refresh resynchronizes a cached mount, and
turntable rotation can no longer make the bay breathe during fitting changes or authored admission.

`npm run check:shipworks:dock-composition` is a deterministic headless route-equivalent proof. It
loads the canonical dock, the live loading fallbacks for Kestrel, Pelican, Bastion, and Leviathan,
and the settled authored whole-ship Kestrel. It applies the current Shipworks camera and mount
transforms at 0°, 45°, and 90°, then casts 18,000 rays to visible ship vertices. The accepted dock
has **zero dock intersections**.

That ray receipt proves the source aperture does not cover the displayed ship. It does not replace
Browser/Electron presentation or a human art verdict.

## Source and release pipeline

The `.blend` files are authoritative editable sources. The source GLBs preserve semantic materials,
UV0, tangents, sockets, and metadata. Debris and hulk source GLBs retain authored LOD0/1/2; the dock
source GLB intentionally contains LOD0 only while its `.blend` retains editable LOD1/2. Base-color,
OpenGL tangent normal, and packed AO/roughness/metallic maps are produced from deterministic
authored surface inputs.

`scripts/build-place-release-assets.mjs` publishes an explicit `--ids` selection:

1. builds each selected release in temporary space;
2. applies slot-aware KTX2 and Meshopt compression;
3. validates source/release structure, materials, texture roles, and compression;
4. guards the source GLBs and parts manifest against mutation; and
5. transactionally replaces only the selected release GLBs and their existing manifest rows.

It never rewrites unselected release artifacts or changes manifest membership/order.

## Current acceptance boundary

Completed offline:

- deterministic editable Blender rebuilds;
- reviewed macro-form corrections;
- source GLB root/socket/bounds/material/LOD contracts;
- strict texture-channel validation;
- Khronos/Foundry structural validation;
- exact source/release hashes and byte counts;
- KTX2/Meshopt release publication;
- Shipworks route wiring, adaptive alignment, and zero-intersection composition proof.

Still open and must not be inferred from the offline checkpoint:

- Browser and Electron normal-route presentation;
- live LOD transition and residency behavior;
- route frame-time, draw/program, and asset-admission evidence;
- independent, nondelegable human-eye G7 art verdict.

These were intentionally not run or self-approved while PQ-034 held `browser-gpu`,
`performance-evidence`, and `validation-broker`.

## Resume only the remaining acceptance work

When those shared leases are available:

1. run the existing lower-layer checks first;
2. obtain current Browser and Electron captures from the real Shipworks and freeflight routes;
3. verify normal-camera, close, far, motion, LOD, residency, and frame-cost behavior;
4. obtain the independent human-eye art verdict;
5. update this file and the program packet with evidence paths and receipts.

Do not reopen the retired iter219/iter280 densification loop unless current player-facing evidence
identifies a concrete regression in the promoted source.
