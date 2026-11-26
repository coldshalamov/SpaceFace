# Incinerator Twin Laser

A tier-4 medium spinal weapon unlocked by Capital Weapons in Adventure, and offered after cleared wave 10 in Swarm. One mounted battery fires two fixed nose-parallel beams. The advertised 180 direct DPS is split evenly, with one shared 24 capacitor/s draw and one heat clock (46 heat/s, 23 base dissipation). Normal venting and capacitor gates still apply. Each ray terminates independently at its first physical contact; a protected target remains protected. Unshielded armor/hull contact applies the existing three-stack burn for approximately four seconds after contact (refresh coalesced within 12 simulation ticks), with the existing periodic damage, immunity, attribution and victim-attached matter VFX. Environment contacts feed the existing thermal material system; ordinary indestructible terrain stays indestructible.

The existing beam pool carries two keyed red HDR conduits, with separate endpoints driven by the resolved simulation rays. The hot work face uses bounded pooled combustion, hot sparks, smoke and lights; reduced flash omits the white flash and bright sparks. The existing hull-attached fire follows its victim and retires on status expiry/death. No new per-frame whole-world query or per-beam scene object. Audio uses the existing heavy beam loop.

## Verification

Run `node --test test/incinerator-twin-beam.test.mjs test/beam-armor-flat.test.mjs test/persistent-combat-beam-pool.test.mjs`. In normal play check fitted weapon on a fixed M hardpoint, release/vent, one ray blocked by a foreground rock, two simultaneous targets, shield-only hit, and a burning fleeing hull. Check bloom-on/off, camera zoom, reduced flash, worker mode and sector transitions. Balance and live visual capture still require playtesting.
