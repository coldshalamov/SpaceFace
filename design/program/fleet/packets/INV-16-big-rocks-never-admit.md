# INV-16 — Why do Swarm boulders and monoliths never get their authored surface? (READ-ONLY, measured)

You change no tracked file. Files only under `.devshots/fleet/inv16/`. The rock agent found that in a Swarm round-3 frame only
pebbles (radius 9) admit the authored `place_rock_*` body with the new triplanar surface; boulders (r 18) and monoliths
(r 30) stay on the procedural stand-in even after ~200 s (`.devshots/fleet/looks/look05a/adm2-r3-plain.png`). Your INV-10/11
probes (`.devshots/fleet/inv10/`, `inv11/`) instrument authored admission; reuse them.
Through the lock (never kill a holder you did not start), `?swarmRound=3`: for every debris rock, log its size class,
substance, `placeId`, `authoredAssetState`, `presentationAdmission`, whether an admission was ever requested, queued,
started, failed (with reason), or skipped (by which gate: distance/LOD, residency hold, budget, a size cap, a missing asset
file, a mesh/vertex budget, `sfResidencyFailOpen`…) — with `file:line` of the gate. Check the GLBs exist for every
`place_rock_<substance>_<boulder|monolith>` the spawner asks for (`assets/ships/parts/places/` and the release manifest).
Receipt: a table per size class (count, admitted, pending, never requested, failed + reason) and the gate that keeps the
big rocks on the stand-in, with evidence, plus the smallest change that admits them without hitches.
