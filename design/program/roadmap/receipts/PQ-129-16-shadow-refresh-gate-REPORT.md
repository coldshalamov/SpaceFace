# PQ-129.16 — Full-quality shadow refresh gate

Status: kept production optimization; headed Continue and sector-entry routes are presenting.

## Measured cause

After the single-HDR-clear slice, the same Intel D3D11 Continue route still measured
`bloomScene` p95 111.7 ms. A non-persistent diagnostic disabled shadows only inside an isolated
Electron profile, then restored the setting before shutdown. That upper bound measured
`bloomScene` p95 7.7 ms, reduced the hitch rate from 97.5% to 33.9%, and shortened the longest
hitch streak from 50 frames to 9. Shadows—not bloom filtering—were the remaining main-scene pole.

## Production change

All authored shadows, the 512 map, the ±300 local ortho, PCF, caster population, and default video
settings remain intact. The renderer now refreshes the depth map only when its contents can change:

- the light/player follow crosses one shadow texel;
- a realtime caster root moves, rotates, scales, changes visibility, LOD, or cast band far enough
  to change at least one shadow texel;
- caster/receiver membership, authored hierarchy, shadow projection, light direction, settings, or
  WebGL context changes;
- asteroid instance matrices change.

Sub-texel caster deltas accumulate against the last reported pose. A late present still skips at
most one required refresh and retains the dirty state for the next frame. Clean frames reuse both
the depth texture and its last prepared shadow camera; they do not move the light or recompute a new
matrix against stale depth. Dirtiness clears only after the real post route renders successfully.

## Direct result

The result-bearing public route loaded the player's save read-only into an isolated profile, entered
flight, used the public map to jump to Ceres Belt, and held thrust for 20 seconds. It exited green:

- verdict: `presenting`;
- final-tail hitches: 0;
- presentation p95: 6.8 ms;
- simFrame p95: 9.0 ms (the new largest recent bucket);
- `bloomScene`: p95 3.6 ms, average 2.5 ms, maximum 4.7 ms;
- three distinct canvas hashes; no page error, context loss, or frame error.

Against the pre-gate sector-entry baseline, `bloomScene` p95 fell from 247.7 ms to 3.6 ms (98.5%).
The simpler Continue route also exited green with `bloomScene` p95 7.4 ms and presentation p95
13.3 ms. Original-resolution witness frames retained the lit hulls, asteroids, HDR halo, and sector
composition; no shadow-off diagnostic was active in either result-bearing production run.

Report SHA-256: `B6EA1D04EB353288C8433F69C8F06C9A0FF68E5946543FC0FBDD8340A1B393F2`
for `.devshots/runtime-witness/report.json`.

## Verification

- `node --test test/shadow-present-cadence.test.mjs test/shadow-caster-policy.test.mjs test/renderer-shadow-frame.test.mjs` — 14/14 pass.
- `node --check scripts/probe-runtime-witness.mjs` — pass.
- `npm run probe:runtime-witness -- --continue` — green `presenting` candidate.
- `npm run probe:runtime-witness -- --continue --sector-entry` — green result-bearing route above.
- `test/asteroid-instance-structure.test.mjs` and `test/shadow-receiver-tally.test.mjs` pass. The
  separately invoked `renderer-settings-runtime-truth` static source test retains its pre-existing
  failure because it requires a literal `_shadowReceiversDirty = true` inside the settings handler,
  while live code already calls `_markShadowReceiversDirty()` there; no assertion about this
  candidate's runtime behavior failed.

## Routing

PQ-129.16 is complete. The current measured tail is no longer presentation-bound; `simFrame` is the
largest recent p95 at 9.0 ms. Reclassify before touching batching, LOD, autosave, or quality. The
shared queue file remains unchanged because it contains a protected foreign hunk; this active packet
and receipt preserve the disposition until that collision clears.
