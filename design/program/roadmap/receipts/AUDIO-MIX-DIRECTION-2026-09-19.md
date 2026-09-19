<!-- LIFETIME: RECEIPT -->
# AUDIO-MIX-DIRECTION-2026-09-19 — combat pressure, comms duck, tether strain, room occlusion, sector crossfades (receipt)

```text
CURRENT STATUS 2026-09-19

DONE — the mix has direction. A scripted combat escalation rises monotonically in the bus-meter
ledger; critical comms bow the world mix; the tether strain/spool layer reads the real physics
mirror; station interiors go wet and muffled while the void stays dry; sector beds crossfade as
the player crosses sectors; the PQ-158.03 blind bed bench still names 10/10 twice; worst-case
combat stacking stays inside the pinned loudness bound; idle frames create zero nodes and the
frame-sleep counter does not grow.

Production change landed by a concurrent lane at 2f8270af2 (src/audio/audioSystem.js,
src/audio/bandBeds.js, src/audio/environmentMix.js). This close-out verifies the four seams,
authors the five missing doctrine voices, repairs three pre-existing lane reds, and receipts.
```

## The four seams

1. **Combat choreography ducking.** `PRESSURE_MIX` (audioSystem.js): a threat-scaled bandpassed
   pressure bed + sub rides the combat bus while `rt.threat` (recomputed at `MUSIC_RECOMPUTE_S`)
   leans the combat fader up (+14% at full threat) and the music fader down (-30%). Bounded end to
   end; the limiter still owns the ceiling. A critical comms phrase (`COMMS_DUCK`) bows music,
   ambient, combat, and engine to 0.58 for the phrase; comms and master never duck.
2. **Tether strain layer from real physics state.** `_updateTetherHum` now owns three strands on
   the combat bus: the strain hum (`masslineInstrument.masslineHumHz`), the overload oscillator,
   and a new winch spool whose pitch/level track `tether.reelStrength`, `tether.lineLengthRate`,
   `tether.reeling`/`payingOut` from the production mirror (`tetherGameplay._mirror` →
   `state.player.tether`). Attach / strain / release / break stay distinct recipes and captions.
3. **Reverb/occlusion stubs through the existing bus graph.** `ENVIRONMENT_OCCLUSION` (void open;
   hangar/station lowpass the positional world heard through the hull) plus a shared lowpass per
   physical bus, and authored reverb sends: `recipe.reverbMix` taps the existing
   `createEnvironmentMixRuntime` send so the active room class sets the wet level (hangar 0.42,
   station 0.28, void 0.05). Interior voices (UI, comms, non-positional cues) are never occluded.
4. **Sector theme crossfades that follow the player.** `bandBeds` retune fades the outgoing graph
   out over a bounded stop instead of hard-replacing it (at most one graph fading); the adaptive
   matrix follows `sector:enter` on the real bus.

## Lane close-out (this receipt's commit)

- **Five doctrine voices authored** (`src/audio/audioSystem.js`): `swarm_pack`,
  `mine_layer_wake`, `shield_breaker`, `capital_broadside_tollman`, `capital_broadside_ala` now
  have unique rate/gain/detune signatures. The combat-variety vertical (cabea5de0, 2026-09-18)
  added the doctrine ids and extended its own catalog pin, but the audio parity contract
  (`test/m6-audio-professional-identity.test.mjs:115`) had been red since that commit —
  `doctrineIdForOwner` never recognized the five, so their weapons fell back to the naked
  weapon voice.
- **Three pre-existing reds repaired (test pins only, no semantics changed):**
  - `test/pq-158-06-action-audio.test.mjs` — `MINIMAL_ACTION_AUDIO.length` pin was 10; the
    `latchDenied` row landed 2026-09-14 (9411ff8c8). Pin is now 11 and the per-action loop
    carries its payload.
  - `test/pq-158-05-mix.test.mjs` — `combat.damage.armor` has resolved to `vfx.armorHit` (the C3
    armor surface) since 9411ff8c8; the test still expected `vfx.hullHit`.
  - `test/pq-158-00-sample-library.test.mjs` — the orphan-wav guard now unions the delivered
    bark corpus (`barkVoice.enumerateDeliveredBarkWavs()`, 271 files) and the eight blind register
    clips (PQ-158.04 acceptance fixtures) alongside `SAMPLE_MANIFEST`, instead of failing on
    `assets/audio/voice/` payload.

## THE NUMBERS

```text
bar | before | after | target | seed
combat escalation pressure | flat under threat | pressure/threat/combat-meter rise at each
  escalation step, music fader bows; ledger entries time-ordered and bounded | monotone rise | 15819
critical comms duck | world mix stayed put | music/combat/ambient/engine bow to 0.58 for the
  phrase and recover; comms + master untouched | phrase bow | 15819
tether layer | discrete cues only | strain hum follows masslineHumHz(load/strain); spool sings
  only while the mirror says reeling/payingOut; attach/strain/release/break distinct | real
  physics state | 15802/15819
blind sector beds | — | 10/10 named from PCM, twice in-test | 10/10 twice | 15803
hangar vs void wet | same dry bus (pre-158.05) | 18.5 dB split, decay 0.92 s vs 0.14 s | >= 12 dB | 15805
worst-case combat stack | — | modeled master-referred peak under the 0.72 headroom pin and under
  the 0.5 limiter knee; pressure bed alone < 0.02 | pinned bounds | 15819
frame budget | — | idle frames: zero node creation, ledger ~4 Hz into a 240-entry preallocated
  ring; frame-sleep counter (stats.workOps) unchanged across 120 idle frames | bounded | 15800/15819
sample-backed recipes | 181/182 | 188/201 | >= 120 | 15800
audio lane suite | 3-4 pre-existing reds | 178/178 twice | pass twice | 15800-15806
```

## FILES

- `src/audio/audioSystem.js` — 5 authored doctrine signatures (close-out); the four seams landed
  at 2f8270af2
- `src/audio/bandBeds.js`, `src/audio/environmentMix.js` — crossfade + occlusion (2f8270af2)
- `test/audio-mix-direction.test.mjs` (2f8270af2), `test/pq-158-00-sample-library.test.mjs`,
  `test/pq-158-05-mix.test.mjs`, `test/pq-158-06-action-audio.test.mjs` (pins)
- `design/program/NOW.md` — lane row

## CHECKS

- `node --test test/audio-mix-direction.test.mjs` — 8/8, run twice (blind bench names 10/10 both
  passes; escalation ledger monotone; comms duck/release; tether mirror; occlusion routing; idle
  zero-allocation)
- Full audio lane (21 files, incl. m6, pq-158.00-.06, lifecycle, collision, bomb cues) — **178/178
  twice**
- `node scripts/check-sg08-mix-profile.mjs` — `"ok": true`
- `npm run check:baseline` — 15/15 green (wall budget exceeded under concurrent fleet load; no red
  links)
- `node assets/audio/generate-samples.mjs --check` — tree byte-identical to the generator

## UNPROVEN

A headed headphone listen at the shipping camera (owner capture ruling 2026-09-16: captures are
optional, not proof). The escalation ledger, the physics-mirror tether assertions, the PCM blind
bench, the wet/dry IR split, and the modeled loudness bound are the headless stand-ins.

```text
UNPROVEN: headed headphone comparison of the five mix seams. No human was in the room.
```
