<!-- LIFETIME: DURABLE -->
# PQ-050.02 — Drifter cycle 30 receipt (review bar met; promotion blocked locally)

## Outcome

The Drifter candidate closed its review bar at cycle 30:

- **Form repair landed** (`tools/blender/build_drifter_mtx.py`): blunted bow + widened hold and
  drive-house bands (non-needle three-lobe silhouette), 1.55 m hold well with self-shading tub and
  cargo blocking, lofted fat-root winglets (0.55 m root → 0.08 m tip, root fillet), abeam height
  steps (raised canopy band, drive-house dorsal spine), Hitch-style value-band contrast zoning.
  LOD0 103,666 → 111,059 tris; LOD1/LOD2 rebuilt; stills in
  `assets/ships/fleet_player_bodies_v1/drifter/evidence/drifter/cycles/cycle_30/`.
- **Calibration finding (binding):** the accepted Hitch `kestrel.glb` was rendered through the same
  sanctioned `render_glb_chase_stills.py` harness at the same 144 WU pose and reads darker and less
  legible than the Drifter candidate. Cycle-29's "dark sliver" P0 was miscalibrated against an
  imagined bright bar. Future play-size verdicts must use the Hitch reference render
  (`.dev/hitch_chase_ref/`, regenerated on demand).
- **Reviews:** three independent judges returned KEEP on the calibrated evidence (play-size read vs
  Hitch; material response/value zoning; form integrity). Five-plus valid reviewed cycles now stand:
  26, 27, 28 (prior thread), 29 (REVISE, retained), 30 (KEEP ×3).
- **Technique ledger** rebound to the final cycle-30 LOD0 hash
  (`CF2DC78202D1D3DC…`), with MTX-04 and MTX-07 rows added from cycle-30 stills.

## Blocked step (single, with fingerprint)

Promotion of the cycle-30 body to the live path is blocked on this machine: the sanctioned
incremental lane (`build-sg04-release-assets.mjs --only=wholeship_drifter_production_v1…`)
fails in the Basis encoder — `ktx2(drifter_mechanical_basecolor): Failed to convert texture: Encode
failed` (NodeBasisEncoder, 4096² UASTC LDR q2; heap raise to 12 GB did not help; texture is valid).
The aborted transaction left a mixed LOD set, so the parts/release copies were restored to the
consistent cycle-28 release bytes. The live game still runs the cycle-28 wired body; nothing was
half-shipped.

## Terminal state

- Review closure: DONE. Promotion: DEFERRED to an environment where the Basis encoder completes
  (or after repairing the local ktx2-encoder binary), then: same incremental lane → regenerate the
  three drifter render packages → `node --test test/fleet-player-wholeship-routing.test.mjs` →
  `npm run check:baseline` → queue row .02 → done.
- Hitch untouched throughout. All evidence committed.

## Next product unit

`PQ-131.08` — authored Fabricator (or the PQ-131.06 conduit landing handoff, whichever releases
the shared files first).
