# 14 — Phase 15 Convergence Audit (Cycle 1)

Audit of the alien-ecology build as it stands after roadmap phases 0–13 landed on this branch.
Scope: AE-150–AE-159, run against the code, not the intent. Phase 14 (late-game setpieces) is
deferred to the extension roadmap; findings that depend on it are marked accordingly.

## AE-150 — Content census

| Layer | Shipped | Where |
|---|---|---|
| Fauna species | 16 authored + void_carrier | `src/data/alienFauna.js` |
| Infestation props | 22 kit pieces | `src/render/partsLibrary.js` |
| Ecology sites | 7 (nursery, freighter, quiet_ice, three_hull, breathing_dock, harvest_deep, converted_yards) | `ALIEN_SITES` |
| Machine sites | corridor/pylon/monolith/vault/ossuary set + sker_null_causeway | `MACHINE_SITES` |
| Ecology missions | 12 rows across 8 faction desks | `ECOLOGY_MISSIONS` |
| Unlock modules | 11 rows (filter, bio-spectral, coherence meter, locker, purge ring, heat lure, quiet mask, relay needle, cradle, handshake, seal) | `src/data/modules.js` |
| Biohazard commodities | filament sample + cradled live specimen | `src/data/commodities.js` |
| Revelation sources | survey, beam ops, deep trace, architecture evidence | `REVELATION_SOURCES` |

## AE-151 — Duplicate-mechanic removal

- `contaminationAt` (zone-level) and `pointContaminationAt` (site falloff) coexist by design:
  zone = cheap aggregate for UI/missions; point = field truth for exposure/fauna. Kept — the
  zone value is derived from the same tables, no drift possible.
- `sectorFlags` (deep advisory, domain beat) vs site `beats`: sector flags are per-sector
  one-shots, beats are per-site staged reveals. No merge — different keys, different axes.
- Verb audit: every new behavioral module key is registered (VERB/INTEL/SCALAR) so no key
  silently does nothing.

## AE-152 — Difficulty tuning

- Deep advisory gates on `DEEP_FILTER_GATE.minTier 3 / minLean 0.03` — fires only where the
  authored lean actually reaches dangerous C (sker 0.04 qualifies; shallow sectors never nag).
- Lure retarget applies only to heat-sensitive species (`sens.heat >= 0.6` or `heatHunter`);
  cold/non-heat fauna ignore dropped charges. Prevents the lure from trivially pulling whole
  site populations.
- `stealthBioMult` folds min across fitted mods (stacking masks can't reach zero detection).
- Domain threshold requires C ≥ 0.8 *at a point* — only reachable at bloom-state deep sites
  (converted_yards bloom ≈ 0.84); cannot fire on a benign sector.

## AE-153 — Economy tuning

- `cmdty_live_specimen` carries `noMarketSeed` — stations never stock it; a neutral 'none'-role
  listing is minted on first quote (`mintUnseededListing`). Keeps market equilibrium honest:
  no fake supply of an animal you have to capture yourself. Also keeps the 47a economy golden
  byte-identical (verified `sim-golden-diff`: IDENTICAL).
- Contamination custody refusal is waived only by a fitted `containmentSeal` module — the
  sealed-sale path tallies `sealed_sale` vs `biohazard_sale` separately per faction so tuning
  can read uptake from `ae.factionConsequences`.

## AE-154 — Performance dense-scene pass

- Lures capped at 8 per sector (`ae.lures`); expiry checked on the same 1 Hz tick as other
  ecology cadences — no per-frame scans.
- Coherence meter emits at 1 Hz only while the player is inside a site mid-band; zero cost
  elsewhere.
- Deep advisory/domain/Wren beats are flag-gated one-shots; no repeated emission work.
- `effectiveRevelation` is computed once per call site, not per fauna label.

## AE-155 — Save migration audit

- `ensureAlienEcologyState` normalizes every new field (`sectorFlags`, `wrenRecognized`,
  `factionConsequences`, `lures`, `offersEmitted`, `deepTraceDone`) — old saves deserialize
  clean; `lures` deliberately do not persist (a lure is a live burn, not world state).
- New per-site record keys are additive; `siteRecord` creates them with defaults on demand.

## AE-156 — Accessibility

- All new player-facing beats are toast/comms text (domain threshold, route advisory, Wren
  recognition, coherence readout as scanner-label suffix) — legible, no color-only encoding,
  no motion effects added.
- No new audio cues shipped this cycle (AE-157 audio mix remains open — no new sound events
  were introduced to mix).

## AE-158/159 — Terminology + canon

- "Vethari" appears only inside gated revelation text and the phase-14 reserved evidence keys;
  nothing in the shipped toasts names the apex — consistent with the roadmap's "scale without
  normalizing the apex mystery" rule.
- Faction desk names on ecology missions match the faction table ids (scn/mts/dmc/quiet/
  reach/free/choir/vael); the mission `factionId` field is what `ecology:factionOutcome`
  tallies against — one vocabulary end to end.

## Open for later cycles

- AE-140–AE-149 setpieces (Phase 14) — mapped onto extension packets.
- AE-157 audio mix — pending any new audio events.
- Live-specimen market behavior beyond neutral minting (research-station premium) — candidate
  tuning packet.
