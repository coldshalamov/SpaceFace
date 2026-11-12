<!-- LIFETIME: RECEIPT -->
# PQ-130.07 The sim speaks — receipt

**State:** done (2026-08-21, commit `1cff0c70`). **Law:** design law §5 (timings), §2.6, §2.7, §3.2, §9, §11.8.

## What shipped (src/ui/asteroid/asteroidRenderer3d.js, src/render/asteroidInteriorPreview.js)
- Ore extracted: 3–5 lit PBR chunks pop 60–120 ms apart and arc 250 ms into the rover's live lid
  (depth interpolated cut-face → tunnel), gold `+N Si` floater rises 24 px over 700 ms (seam-chip
  symbol bank); same-cell floaters step up a tier instead of stacking.
- Gas breach: 150 ms yellow-green PointLight inside the cell; lit matte vapor floods the cell + hollow
  neighbours ~1.2 s; 4 px camera kick for 180 ms through the `poseCamera` offset seam (never a DOM
  transform — §11.1 is measured against the projection); 400 ms coral edge vignette as a radial-gradient
  overlay element mounted directly after the canvas, under the chrome (centre pixels provably
  untouched; the first version washed the Heat/Charge gauges); a buckled scorch plate on the rover for
  the shift; the pocket takes the vented scar permanently.
- MK gate: 6–10 warm metallic sparks + swarf over 300 ms; the `.04` stamp unchanged.
- Hopper full: the `.05` lid latches; 1–2 ore-coloured chunks bounce off it; 220 ms gold edge vignette.
- Machine placed: 120 ms settle (scale + drop into socket), lamp forced mint. Starved: lamp dark
  (emissive 0.06, pool light 0.45) + a gold **want chip** above the housing carrying the missing input's
  swatch or a power bolt, no text. Courier: the pod climbs the entry shaft and clears the derrick over
  1.7 s (`makeCourierPodGeo`).
- Hover box: the 7 px cyan frame → `--aw-ink` at 55 %, held to 1.5 screen px at every zoom, soft inner
  shadow; build mode keeps `.09`'s mint/coral verdict.
- One 5 s repeat gate keyed `cell|reason` (tier refusals, hopper-full); suppressions counted.
- Three dead plumbing paths routed around without editing their owners: `drill:warn` tier never reached
  the renderer (it now subscribes to `drillSys.bus`); the screen forwards `drill:break` without the gas
  flag so `addVentedScar` was dead on the live path (derived from pre-carve state); `site:courierLaunched`
  never reached the renderer (watches `fleet.launches`, baselined on first sight).

## Evidence
- `check:asteroid-theater` holds with new §11.8/§3.2 rows (yield 4 chunks + 1 floater; gas kick
  0.97–3.09 px within ~17 ms, vignette 0.25–0.5 and not full, vapor 3, 1 rover scar, 1 vented scar;
  cargo refusal expressed, 16–21 chunks off the lid, lid latched, repeat suppressed; hover box
  `#f2e8d5 @0.55 · 1.50px`). `check-drill-smooth` PASS · `asteroid-drive-cadence` PASS ·
  `check:playable` 14/14 twice.
- Stills: `10-yield`, `10b-gas-breach` (reviewed by the orchestrator), `10c-refusal`, `10d-courier`,
  `10e-want-chip`. Two fixes came from reading them: vapor rendered as a chrome ball (envMap + opacity),
  gas debris as lime confetti (saturation + single-axis spin) — both now lit, tumbling, matte.

## Recorded, not fixed
- The works screen pauses the world sim, so a courier cannot actually depart while you are inside; the
  climb is real code driven by a `fleet.launches` change.
- Law D2 wants a vented pocket permanent, but `recordClearedTile` persists *cleared*, not *was-gas*, so
  the scar dies on re-entry — a sim-persistence gap (`ent.data`), owner off-limits here.
- Machine lamps and want chips (listed under `.10`) now exist; `.10b` builds on them.
