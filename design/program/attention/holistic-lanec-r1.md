# Holistic Lane-C review — attention corpus (controller-run, agent spawn died on rate limit)

VERDICT: CLEAN for landing; one structural finding already filed.

- Cross-batch id collisions: zero (scripted join over 6 region/sector files — 0 duplicate poi_/world_site_ ids; 0 duplicate lore entry ids in 100-rim-poi-lore.js).
- Named-entity reuse: the three batches write disjoint surfaces (missions desk lines / hull+station+verbal layer / sector+frontier POIs); no shared name registry is touched twice.
- Selector reachability: verified per-batch by the three successive reviews (M: 89/89; S: 41/41 + geography 493→511; HTVEU: 55/55 + player-facing-labels; S-14r: 40/40). Bark banks resolve through barkDirector/barContacts/missions selectors; lore resolves through the rim_poi_lore reader (PULSE-07 gate green).
- Dead-space audit (D254): the S-batch and M-09 appends into barkSituationFill.js fill cells DID land partially in dead space past BARK_CELL_MIN=12 — same for ~14 previously-live fill tails displaced by base-cell growth. Filed as demo-ledger D254 (structural, lane call: promote to base cells or segment the cap). Not a landing blocker — the file's reservoir-tail idiom predates these commits.
- Register consistency: spot-read across batches holds the frontier register (measure-stakes, tally boards, lantern posts) vs the station-life register (barkeeps, regulars, tab talk) vs the mission-desk register (bounty board phrasing). No voice drift flagged by any of the five review rounds.
