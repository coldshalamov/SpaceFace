# Swarm Renaissance: target and current gaps

Updated 2026-11-01. This summarizes the adopted Swarm/Foundry product target and the current route
outcomes. The source was the user-provided 171-page `SpaceFace_Swarm_Renaissance_Extended_Design_Bible.pdf`;
its catalogs are a design bank, not shipment quotas. The detailed whole-game outcome map is
[INTEGRATION_COVERAGE.md](./INTEGRATION_COVERAGE.md), and packet source reads are indexed in
[SOURCE_COVERAGE_2026-10-29.md](./SOURCE_COVERAGE_2026-10-29.md).

## Adopted product target

The goal is a compact, complete Foundry journey reachable from the ordinary Crucible menu:

- A prompt, physical opening horde with clear combat cause and effect, authored arena rhythm, and
  construction as a tactical choice.
- A complete first ten-wave journey and a credible, distinct boss. The opening minute has a working
  starter weapon, grouped ingress, physical kills, payout and a purchase that changes a later wave.
- Three readable approach corridors; all four construction types used across two consecutive waves;
  meaningful repair/rearm; siege counterplay against weak links; structures that survive and fail
  fairly; and at least one causal chain a player can explain.
- One deliberately failed build, three distinct standout abilities, and an optional reachable stealth
  mission. The solo-opening lesson stays optional.

The appendix's wave, boss, arena and other catalogs are not quotas. This direction does not authorize
a second simulation, combat or damage writer.

## Current implementation and evidence

- Fortify exposes four device types, run-scoped purchases, physical fields/projectiles, paired segment
  damage, paid repair/turret rearm and enemy weak-link counterplay. The paused screen is registered
  in both runtime paths.
- Veil Step, Boomerang Bomb Run and Pinball Rush are fresh-profile Crucible starter choices with
  canonical runtime/readout owners. Veil Step still lacks a public outcome; the older Boomerang and
  Pinball receipts below remain scoped. The optional Tethys capsule mission exists on the ordinary
  Contracts board. Its stale standing case file now refreshes after casing (focused behavior pass),
  but natural public stealth-route acceptance is still open.
- The latest headed public Foundry run cleared waves 1–8 and reached wave 9 alive before its 45-minute
  cap. Public controls, round transitions, player-model visibility, LOD/pop behavior, VFX, loadout and
  edge markers passed; offscreen markers passed 1,219 samples after the observer repair.
- The route's original verdict remains **FAIL**: a moving asteroid at the wave-six opening lacked a
  captured causal identity. The run recorder had retained only the first four seconds of the run.
  The original artifact is preserved under `.devshots/finish/integration-2026-10-29/foundry-ten-wave-current/`.
  The per-wave recorder now reinstalls a bounded opening observer and retains wave-scoped receipts;
  its nine focused cases pass. That fixes capture coverage, not the original route result. A new
  public first-ten/boss run with per-wave force capture is required to classify the motion.
- Foundry readability and frame time remain **UNKNOWN** (observed p50 65 ms / p99 186 ms). No
  ten-wave/boss journey has passed.
- The corrected extended public Swarm route reaches round three with functional route, controls,
  spawn motion, transitions and presentation checks passing. Its aggregate remains **INCOMPLETE**
  for readability, LOD and performance. The older wave-two death remains failed history. The short
  idle lineage observation passes spawn motion for its 45-second window; the earlier generation-161
  wreck's excessive first-seen motion remains causally unclassified. Neither result changes the
  8 WU/s passive-body limit. See the current Swarm entries in `INTEGRATION_COVERAGE.md`.
- Review of that death shows the actor stopped among close Wasps and triggered optional Massline
  at low hull. `4db57bc0fda9` corrects sustained evasion and optional-latch decisions; eleven focused
  actor cases pass. This is an actor correction, with no production damage, health or balance
  change. The later extended functional pass does not rewrite the original FAIL.
- An earlier whole-Swarm route did not load the newer passing reader modal-body fix (15/15 focused
  checks); its screenshot interval was configured in seconds rather than 3-second steps. Those
  pictures cover round events, not continuous readability.
- Hero evidence is also bounded: public M02 bank, bomb commitment and phase return passed, with the
  target surviving as an allowed miss. The later public Pinball charge/release reaches canonical
  `pinball_complete` with one admitted player-attributed physical contact and a live pilot. Its
  contacted body is unidentified, so a locked-target hit is unclaimed. The older zero-contact result
  remains history. No complete public three-ability experience is claimed.

## Remaining acceptance work

1. Rerun ordinary Foundry through waves 1–10 and the boss, retaining per-wave force captures so the
   original wave-six failure receives a causal classification.
2. Preserve the four-device and service behavior while checking two-wave structure survival, fair
   failure, siege counterplay, readable approaches and the deliberate failed-build case.
3. Establish readable combat cause and the complete three-ability experience through player-facing
   controls and status, retaining the verified physical Pinball outcome. Keep optional stealth
   reachable on its ordinary route.
4. Complete Swarm's remaining aggregate diagnostics and idle-motion classification. Keep the
   extended functional pass, original public **FAIL**, bounded idle observation and Foundry's
   partial progress distinct.
5. Measure readability and performance on the relevant headed gameplay routes. Current performance
   remains open; focused tests and source coverage are not substitutes for those routes.
