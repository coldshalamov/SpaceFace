# Swarm Renaissance: target and current gaps

Updated 2026-10-30. This summarizes the adopted Swarm/Foundry product target and the current route
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
- The separate whole-Swarm idle/active player-truth gate also remains **FAIL**: the default pilot died
  in wave 2. Published observer/spawn repair `4a5e683497e` and corrected offline idle/active captures
  show zero spawn-motion anomalies without changing the 8 WU/s physics limit. Offline observer
  results do not change the public gameplay failure.
- Review of that death shows the actor stopped among close Wasps and triggered optional Massline
  at low hull. `4db57bc0fda9` corrects sustained evasion and optional-latch decisions; eleven focused
  actor cases pass. This is an actor correction, with no production damage, health or balance
  change. Its corrected public run is pending; it does not rewrite the original FAIL.
- The latest whole-Swarm route did not load the newer passing reader modal-body fix (15/15 focused
  checks); its screenshot interval was configured in seconds rather than 3-second steps. Those
  pictures cover round events, not continuous readability.
- Hero evidence is also bounded: public M02 bank, bomb commitment and phase return passed, with the
  target surviving as an allowed miss. Pinball's public charged dash reported target loss with zero
  contacts; actual Pinball contact remains required. No complete public three-ability experience is
  claimed.

## Remaining acceptance work

1. Rerun ordinary Foundry through waves 1–10 and the boss, retaining per-wave force captures so the
   original wave-six failure receives a causal classification.
2. Preserve the four-device and service behavior while checking two-wave structure survival, fair
   failure, siege counterplay, readable approaches and the deliberate failed-build case.
3. Establish readable combat cause and exercise all three abilities through their player-facing
   controls and status, including successful physical Pinball contact. Keep optional stealth reachable
   on its ordinary route.
4. Revisit the whole-Swarm gate with the corrected combat actor. Keep the original public
   **FAIL** distinct from corrected offline observer results and from Foundry's partial progress.
5. Measure readability and performance on the relevant headed gameplay routes. Current performance
   remains open; focused tests and source coverage are not substitutes for those routes.
