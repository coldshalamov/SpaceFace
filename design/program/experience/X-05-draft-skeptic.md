# X-05 draft — The Skeptic

**Verdict.** The crime doors exist. Freight-custody theft reports through `reportIncident`
(`lawSecurity.js:2737`), and so do titled claim chips (`:2752-2776`). But "a crime nobody can see is not a
crime" (`:2641-2651`): witnesses must be lawful or carry `data.lawWitness === true` (`:7262`). The robbed
hauler is neither. I can scoop her cells in front of her and nothing happens, so the rail's WANTED ring reads
as a lie.

**Proposal — make the victim an eye.** 1209 already stamps `guard.data.lawWitness = true`
(`1209-the-last-tow.js:283`). No new law code.
1. **344**, `fire()` (`344-opening-hauler-raid.js:258-303`): set `hauler.data.lawWitness = true` in both
   branches. Add `'lawWitness'` to the `releaseAdoptedCarrier` restore keys (`:191`) so the starter barge
   is not a permanent witness.
2. **367**, `fire()` (`367-the-salvage-tail.js:44-74`): stamp the mule. This one is post-rail, on day 1.
   Choosing **bait** (`:114-127`) leaves her spill as the temptation.

**Numbers.** One witnessed scoop costs `THEFT_INCIDENT` 0.22 (`heat.js:105,114`), which is at or above
`WANTED_THRESHOLD` 0.15 (`:51`). The player goes WANTED, the search ring opens, and Helios's guaranteed patrol
responds (`traffic.js:1936-1956`). A restitution note files on the victim (`:2711`).

**Poke → reward.** Scoop her manifest cells and the law answers, exactly as the rail taught. Scoop X-01's
labeled, player-owned share and nothing fires. The difference between a gift and a crime is on the label.

**Blocking check.** Manifest cargo uses the ordinary pickup contract, which includes the homing vacuum
(`mining._updatePickups`). If a *defender* flying through the spill auto-collects her cells, this makes heroes
WANTED, which is worse than silence. If the probe shows that, restrict the report for these two encounters to
the deliberate latch door (`stolenCargoPod:latch`, `:357,2778`).

**Jurisdiction.** The test must also assert the seed-4242 placement passes `protectedStationAt`
(`:2632-2639`) and is not denied as `no_jurisdiction`.

**Regression risk.** Keep green:
- `first-hour-law-read`, `heat-wanted-victim`, `inf-law-witness-first-response`, `infer-law-rows`
- `batch3-law-custody-identity`, `convoy-hauler-death-spill`, `freight-raider-escape-bark`
- `opening-hauler-raid-*`, `ceres-job-law-response`
- `check-encounter-director.mjs`

Coordinate with board row 462 (RC-CHASE).
