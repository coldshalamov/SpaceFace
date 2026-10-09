# S1 Stage B — facade-miss census (registry.get sim-owned ids, main-side reachable)

Scope: every `registry.get('<id>')` in src/ where `<id>` is sim-owned
(`PRODUCTION_INIT_ORDER ∩ isNodeSafeSystemId`, 188 ids) and lacks a facade.
Result: 56 distinct get() ids, 45 sim-owned misses — most callers are sim-side
(src/systems/, src/balance/, src/careers/, src/save/, src/core/newGameBoot.js
all execute inside the worker realm under the lane) and resolve the real system.

Main-side callers split into:
- **Read-only degrades** (verified OK, stage-5 census shape): alerts.js:268
  asteroidSites.projection, galaxyMap.js:3810 claims.list for label routing,
  input.js:603 mining._lockTargetId soft-lock fallback, base.js:1178 claims.list
  for build UI. On the lane these render blank/fallback — acceptable.
- **Lane-aware already**: crucibleLabControls throw path uses laneRpc
  ('crucibleThrowStep') behind laneCommandSink(); adoptTether/kernelFor degrade
  to false (sandbox path).

## Mutating callers — dead-feature candidates (gate the Stage-E default flip)

1. `claims.claim` — input.js claimOrOpenBase (:700). `registry.get('claims')` →
   undefined → `return false` → the key FALLS THROUGH to `deployBeacon`:
   pressing Claim near a POI silently drops a beacon instead. Worst miss of the
   class — a wrong action, not just a no-op. Reads (isClaimed/list) need
   `claims` in DOMAIN_MIRROR_KEYS (not currently mirrored); claim() needs an
   rpc returning the new claim row.
2. `crafting.build` — industry.js:416 attemptIndustryBuild (Fabricate button
   silently fails). Also `state.crafting.queues` (:233) isn't mirrored, so the
   industry screen shows empty queues on the lane even if build is rpc'd.
   Needs 'crafting' mirror + craftingBuild rpc + await at the hold-complete seam.
3. `missions.postAndAcceptAuthoredOffer` — racingLaunch.js:111 armRacingContract
   (circuit contract silently doesn't post). `missions` already mirrors
   whole-root; needs missionsPostAuthoredOffer rpc + armRacingContract made
   async at its caller. Also world.enterSector/relocatePlayerInSector (:119)
   hit the world facade's default-miss — needs worldEnterSector +
   worldRelocatePlayerInSector rpcs (or fold into the race-arm rpc).
4. `drill` minigame — drill.js + asteroidScreen.js: tickInput (per-frame!),
   pulseScan, end, getDrillTier/getDrillDPS/getTargetTelemetry. Per-frame
   tickInput must NOT be an rpc — needs the input-descriptor surface
   (laneDomEvent class) or the drill reads moved to the mirror + actions
   shipped as input writes. Its own design item, not a facade.

## Landed in a35b3f6b5

- `cargoJettison` rpc (worker handler) + `cargo` facade jettison() (Promise of
  dumped count) + HUD handler awaits it — the §2d dead feature closed.
- `_noteLaneFacadeMiss`: every miss logs `[lane] facade miss on sim-owned
  system '<id>'` once per name + emits `lane:facadeMiss` (declared
  main-side-only in KNOWN_UNFORWARDED_BUS_EVENTS). The LANE-FWD-style gate can
  subscribe/assert on named misses in a later wave.
- Golden `0b33dde1…` bit-identical on BOTH lanes post-change.
