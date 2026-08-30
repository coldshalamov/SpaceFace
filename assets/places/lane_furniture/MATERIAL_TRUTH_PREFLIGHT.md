# Lane furniture — construction repair preflight (Tier C family)

Family of six Helios corridor marks. This pass repairs floating parts and
unrooted joints named by the 2026-08-18 still panel. It is not a texture pass
and not a whole-asset G1/G2/G4 close.

- **Fiction:** `design/fiction/LANE_FURNITURE.md`
- **Builder:** `tools/blender/build_lane_furniture.py`
- **Source / live slot:** `assets/places/lane_furniture/source/` and `assets/ships/parts/places/`
- **Supported views:** three-quarter, starboard, rear at play-size framing
- **componentReferenceDecision:** `not_needed` — defects are missing joins, not a trapped component vocabulary
- **Visible-zone register (grouped family):**
  - billed: vane-to-mast join, tally tong arms, ash cut-end/plate/cage, claim streamer hang, locker four-longeron lattice and drum hoops, whistle basket ring
  - retained_reviewed: role-named untextured shells (paint / alloy / bare steel / plate / lens)
  - blocked: none this pass
- **Forbidden reads:** levitating bricks, cardboard fins with no root, crate-on-ladder locker, LEGO tokens in mid-air
- **2026-08-18 construction-repair panel (exact wired bytes):**
  - A: WIRE `place_lane_pin`, `place_cold_locker`; CHECKPOINT the other four (LEGO feet / scatter)
  - B: WIRE_ALL (no floats)
  - C: WIRE_ALL (no floats)
  - Synthesis: admit only the unanimous pair. Tally / claim / ash / whistle stay released on disk.
  - Wired release SHA-256: lane pin `c94e53f749dfd743d8cf9dd069936d5ce0aa2ee244251c54ab0e222d7d7a3a45`; cold locker `bc59994f9fc9b6e084571abefbacc01fd7b706298f442a6777c69afc6724abb8`
  - 2026-08-30 package repair: generated semantic node names changed the cold-locker release hash without changing its visual payload.
- **Gates:** G1/G2/G4 remain OPEN for the whole family. A selector admit is not a closed surfacing pass.
