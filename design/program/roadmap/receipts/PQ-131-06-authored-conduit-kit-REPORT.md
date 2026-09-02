<!-- LIFETIME: DURABLE -->
# PQ-131.06 — authored conduit kit (cable + lane) report

## Outcome

Asteroid Works renders authored `place_works_conduit_{power,lane}_{straight,corner,t,cross,end,junction}`
runs (12 release assets, two 1024² family kits) along carved tunnel walls/floors from the site's
network mask. The procedural conduit drawing is gone: the renderer mounts authored pieces through a
conduit mount lifecycle (template acquisition, per-component material scope, stale-generation
release) and the design law's flat-line baseline is retired. Power runs read as armored tray with
gold jacket; lane runs as translucent-topped tray with rollers. Hooks: `powered` (emissive slot) and
`flow_mesh` drive movement-only lane flow and lens-only status materials; movement reads frame
deltas, never wall time. LOD0 at work zoom, LOD1 at site zoom, no LOD2 admitted.

The probe route (`--part` capture) carves a production-like gallery so wall-mounted/wall-adjacent
parts photograph in context; captures are now seed-fixed (`game:new { seed }`) so evidence is
reproducible.

## Landing adoption (2026-09-01, zcode-main)

The authoring thread checkpointed (cycle-04 bytes, acceptance not rerun) and went stale; zcode-main
adopted the row per NOW rule 3a, finished acceptance, and landed it:

- Focused tests: works-conduit-wire (incl. the 12 artifact provenance hashes — release hash, bytes,
  render hash, metadata hash per piece), works-conduit-lifecycle, works-part-loader,
  works-gas-tap-wire — **17/17 pass**. The wire test's lane-port assertion was corrected for float32
  GLB quantization (1.1 reads back 1.100000023841858; tolerance now explicit).
- `npm run check:baseline` 14/14; `check:asteroid-theater` invariants hold at 1920×1080 and
  1280×720; `check:playable` 16/16; `check-program-docs` PASS.
- **§5 fix (root-caused during landing):** the law §5 refusal gate stamped repeats with the last
  rendered frame's clock. A headless rAF stall (~5.4s) between two refusals made a 105ms-apart pair
  read as 5.5s apart, so an identical hopper-full refusal replayed. The gate now stamps at handler
  time from `performance.now()/1000` — the same clock family as rAF — so the 5s window is the true
  interval between refusals. Found by instrumentation (single renderer instance, same key, no
  clear — pure clock staleness); no test weakening.
- **Capture harness fixes:** the shared player-save-store 404 is filtered as the optional route it
  is (matching `check-game-playable` OPTIONAL_ROUTES); the §10-yield selector equips the run's beam
  (the cheapest vein is tierReq 2 — unsatisfiable with the starter beam) and the capture seeds
  `game:new` so the evidence is reproducible.

## Review and player-route acceptance

- Player-route captures (deterministic seed): the site/network route shows **authored 20/20 runs**
  with lane flow dots and the six machines running; `10-yield`, `10e-want-chip`, `11c-port-crates`
  all expressed.
- Three independent reviews on the frozen captures: material/craft KEEP (gold jacket vs translucent
  lane identity, scene-consistent shading), visual KEEP (tie-breaker: every visible run reads as
  physical manufactured geometry — segmented deck, rollers, elbows, gold joints — "no run reads as a
  flat colored line"), and one earlier REVISE was issued against superseded (pre-seed-fix) stills
  and could not be reproduced on the current evidence; the tie-breaker explicitly refuted it
  run-by-run.

## Landing contents

This landing commit also carries the PQ-131.07 gas tap additive hunks in the shared files (loader,
renderer, manifests, capture script) that were interleaved with the conduit diff, plus the
PQ-133.00/.01 and PQ-131.07 queue-row reconciliations.

## Next product unit

`PQ-131.08` — authored Fabricator.
