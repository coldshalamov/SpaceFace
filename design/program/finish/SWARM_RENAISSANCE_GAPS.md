# Swarm Renaissance: design target and current gaps

Updated 2026-10-29 from the user-provided 171-page
`SpaceFace_Swarm_Renaissance_Extended_Design_Bible.pdf`. The complete extracted text is a local
scratch artifact only; this repository summary records the relevant proposal and current status.

## Adopted product direction

The user adopted the PDF's Parts I–X as design direction for this finish campaign. The PDF describes
itself as research/proposal (p.1); its catalogs are a design bank, not shipment quotas (p.2). Keep
its core player experience: a prompt, physical opening horde; clear causal combat feedback; authored
arena rhythm; construction as an active tactical choice; and a compact, complete Foundry journey.
Appendix A says source inspection does not establish ordinary-route reachability or fun (p.157).

The requested Gold target is the small complete slice described on pp.11, 20–21, and 171:

- From the ordinary Crucible menu, reach Foundry's first ten-wave journey and a credible distinct
  boss.
- The first minute presents a working starter weapon, grouped ingress, physical kills, payout, and a
  purchase that visibly changes a later wave.
- Provide three readable approach corridors and a build phase that preserves the field; operate all
  four construction types across two consecutive waves; make repair/rearm meaningful.
- Show siege counterplay against weak links, structures surviving between waves and failing fairly,
  and at least one causal chain the player can explain.
- Include one deliberately failed build and retain three distinct standout player abilities plus an
  optional stealth mission. Keep the solo-opening lesson optional.

The appendix catalogs (30 waves, 10 bosses, 14 arenas, and the other large option banks) are not
coverage quotas. This target does not authorize a second simulation, combat, or damage writer.

## Current implementation and evidence

The ordinary Swarm objective is the finite hostile ship cohort; Brood adds pressure and rewards.
Current progress/clear semantics name both populations, and the HUD label is `HOSTILE SHIPS`.

Fortify has four device types, run-scoped purchases, physical fields/projectiles, paired segment
damage, paid repair and turret rearm, and enemy weak-link counterplay. The real paused screen is
registered in both runtime paths. The current headed public Foundry run cleared waves 1–8 and reached wave 9 alive before its 45-minute cap. All four devices and paid service remain reachable through public controls. Controls, round transitions, player-model visibility, LOD/pop behavior, VFX coverage and offscreen markers pass; the latter includes 1,219 samples after `c2f5714f570`. Its original verdict is FAIL for one moving asteroid at the wave-six opening. Streaming the artifact found that force capture had stopped after the run’s first four seconds, so it could not explain a later opening. The recorder now captures each wave separately; nine focused cases pass. The original failure is retained until a new route with those windows classifies the motion. Readability and frame time remain UNKNOWN (p50 65 ms / p99 186 ms). The ten-wave/boss outcome is still unfinished. Current artifacts: `.devshots/finish/integration-2026-10-29/foundry-ten-wave-current/`.

The published observer/spawn correction `4a5e683497e` fixed capture overflow and unmapped-player
attribution. Corrected offline idle and active traces now report zero spawn-motion anomalies without
changing the physics speed threshold. However, the original whole Swarm idle/active player-truth gate
remains FAIL because the default pilot died in wave 2. This is separate from the Foundry route above;
do not claim that Swarm is green or accepted. The latest route also did not load the newly passing
reader modal-body fix (15/15 focused checks), and its screenshot interval was configured in seconds
instead of 3-second steps, so it provides round-event pictures only rather than continuous visual
coverage.

Hero evidence remains bounded: M02 completed bank, bomb commitment, and phase return alive, while
the target survived (an allowed miss). Pinball performed a charged physical dash and honestly
reported target loss with zero contacts; native contact tests are separate evidence. No full public
three-ability/contact experience is claimed.

## Remaining acceptance work

- Complete the ordinary Foundry first-ten journey, including its boss, through public controls.
- Preserve the current four-device/service behavior while verifying two-wave survival, fair structure
  failure, siege counterplay, readable approaches, and the deliberate failed-build case.
- Establish clear combat cause/readability and exercise the three abilities through their real
  player-facing controls and status. Keep the optional stealth mission reachable on its ordinary
  route.
- Revisit the original Swarm gate only after a material gameplay change. Keep its FAIL distinct from
  corrected offline spawn-reader results and from the current run's partial progress.

Packet ownership and current route results are summarized in
[INTEGRATION_COVERAGE.md](./INTEGRATION_COVERAGE.md); packet source-read status is in
[SOURCE_COVERAGE_2026-10-29.md](./SOURCE_COVERAGE_2026-10-29.md).
