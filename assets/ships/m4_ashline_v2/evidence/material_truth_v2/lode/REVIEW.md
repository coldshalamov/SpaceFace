# Ashline V2 Lode material-truth review

**Review date:** 2026-07-28

**State:** offline exact-source checkpoint; candidate remains unwired

**Role:** heavy brawler / `Ashline V2 Maul`

## Exact evidence epoch

- Finalized source:
  `assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_lode.glb`
- Source SHA-256:
  `73C253149605349857EADAA8450D4061819B156318FECA5A693540A4363B8036`
- Encoded candidate:
  `assets/ships/m4_ashline_v2/release_candidates/wholeships/ashline_v2_lode.glb`
- Candidate SHA-256:
  `32EF4CB197670257D6679780008F04E571EA2EEE5B539F00836635C7397683DA`
- Renderer:
  `tools/blender/render_m4_ashline_lode_material_truth.py`
- Renderer SHA-256:
  `2E052DF70ACC320CA5B9E68FF0AFB1D57CF35CEABAF60842FE0A1F9EED16215D`
- Evidence receipt:
  `assets/ships/m4_ashline_v2/evidence/material_truth_v2/eligible_artifacts_lode.json`
- Family evidence epoch:
  `0D1A0628F23449E1B04C806FAB101E61F7CC41C6050C677D740A67110A38C098`

All ten eligible images are bound to the finalized source and Lode-specific renderer. Historical
pre-surface renders remain ineligible.

## Fiction-development agreement implemented

The retained donor hull is now visibly organized around a brawler's real load and service paths:

- paired heavy autocannons sit in open casemates with faceted receivers, trunnion bearings, recoil
  dampers, clamps, fasteners, service lines, and radial load frames;
- the central pulse projector is a rooted fixture rather than an unexplained glowing disk;
- the open-cycle torch has a faceted pressure case, nickel hot section, nested refractory throat,
  hollow bell, thrust saddle, valve stations, accumulators, clamps, return lines, and inspection
  hardware;
- hull, mechanical steel, Reach oxide-red coating, zinc-phosphate repair primer, heat metal,
  refractory ceramic, and recessed energy cues use distinct declared material roles.

The source remains within the frozen 24 m envelope and preserves nine sockets, three compound
collision helpers, +X forward, and monotonic LODs. Final LOD triangles are
`13,472 / 4,256 / 708`; the candidate contains 21 KTX2 images and 55 Meshopt buffer views.

## Independent offline gate verdict

- **G1 — pass:** the crescent/wedge mass and asymmetric weapon deck remain the same ship and read at
  the neutral, top, and 120 px views.
- **G2 — pass:** the open autocannon bay reads as assembled machinery. Bearings, receiver, recoil
  hardware, braces, clamps, fasteners, and service paths are visible rather than hidden behind a
  renamed slab.
- **G4 — pass with P2:** the ship no longer broadly reads as LEGO, clay, plastic, rubber, or
  leather. The former oversized brown trunnion drums now read as compact layered steel bearing
  collars with axial caps. The cold torch is a recessed dark metallic throat with a distinct pale
  refractory rim, while the hot view illuminates only its interior.

Remaining P2: the refractory rim shows a coarse/blocky texel pattern only in the extreme torch
close-up. It does not restore the former flat lamp/plug read.

## Open gates

- At 45 px, primary silhouette and torch cue survive, but secondary gun construction is below the
  pixel threshold. Live-background exposure and normal-route readability require current runtime
  evidence.
- The single central weapon socket versus three visible weapons still requires runtime VFX proof.
- LOD transition, Browser/Electron, representative performance, live asset wiring, and independent
  human G7 acceptance remain open.

This review grants no runtime, performance, promotion, or final acceptance claim.
