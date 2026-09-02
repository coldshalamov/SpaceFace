<!-- LIFETIME: DURABLE -->
# PQ-131.09 — authored Cargo port + crates + courier report

## Outcome

Asteroid Works installs the authored `place_works_cargo_port` (one-cell loading frame with launch
cradle, five-crate export stack, berthed courier pod; 13,058-tri LOD0, 1024² atlas) wherever the
cargo port machine is placed. The procedural port body, merged crate pile, and berthed pod capsule
are retired from `makeMachine` — `sm_cargo_port` routes to `buildAuthoredCargoPortAt` (installed),
`beginAuthoredCargoPortGhost` (ghost), and the proof mount. Runtime semantics carried over to
authored hooks:

- `crate_0..4` are the five-stage export stack: the existing export-buffer stage now toggles the
  authored crates' visibility; the procedural floor pile stays retired for authored sites.
- `pod_root` is the berthed courier (visible while a pod is ready). On `courierLaunched` it
  UNDOCKS — `scene.attach` preserves world pose — climbs the shaft with the same eased rise, then
  redocks to its authored cradle pose; the transient procedural capsule remains only as a fallback
  for a site whose port has not finished loading. The berthed-visibility drive yields to the climb.
- `pod_thruster` is the only mutable surface (instance-owned emissive shells, lit under way);
  frame, cradle, crates, and pod hulls stay shared authored-atlas resources. The port has no lamp
  hook; the generic machine lamp drive is a documented no-op here.

Work zoom uses LOD0, site zoom LOD1, LOD2 stays authoring-only; the parts GLB's contract carries
`exportedLods: ['lod0','lod1']` (stamped — the older builder predates that field).

## Frozen artifacts

- Authoring source: `F4B8C87DF96FCE89…` (full value in HASHES.json), 3,833,156 bytes
- Parts GLB: `3579817BDB91C4F1…`, 3,831,408 bytes
- Release GLB: `4E1BE6A90CCDEDE4…`, 850,076 bytes
- Render package GLB: 1,264,524 bytes
- Evidence frozen in `assets/works/cargo_port/evidence/cycle_003/` (work/site stills, staged
  crates, courier mid-climb)

## Review and player-route acceptance

- Integration review: **KEEP** — routing order, hook hierarchy (pod_root's meshes are
  `LOD[01]_pod`), thruster-only instance ownership, undock/redock climb with pose restore, hash-
  bound release/package/manifests, scoped dirty set. Tests: works-cargo-port-wire 4/4,
  works-part-loader 5/5, works-fabricator-wire 4/4.
- Visual + material judges first returned REVISE, but both had misidentified the orange Fe
  ore-debris shards (which fill every mined cell) as the port's structure. A calibrated tie-breaker
  with explicit location guidance returned **KEEP** on the actual machine: frame + cradle + pod
  read as manufactured equipment with material variety, staged crates legible, climbing pod reads
  as a pod. All four verdicts are recorded in the ledger; the miscalibration is noted as process
  evidence (reviewers must be told what the surrounding rubble is).
- Full route: staged crates visible at stage 3 (`11c-port-crates.png`), courier climb at 87% of
  the shaft (`10d-courier.png`), captures seed-fixed and reproducible.

## Next product unit

`PQ-131.10` — authored Inclusion kit (ore, exotic, ice, gas, scars, lock plate).
