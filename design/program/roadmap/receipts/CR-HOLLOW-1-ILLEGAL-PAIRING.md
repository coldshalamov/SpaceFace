# CR-HOLLOW-1 — the illegal-pairing payoff

**Built:** encounter 357, THE HANDOFF (`src/data/encounters/357-the-handoff.js`).
Ships that should not be together, docked anyway, with something to steal or join —
all of it physical, none of it scripted to conclude. Row 51 closes.

## The braid

A Quiet runner (seller) and an MTS mule (buyer) park nose-to-nose in a lawless
pocket — 64 WU of empty deck between them — while four contraband pods
(`cmdty_stolen_goods` / `cmdty_narcotics`) crawl the gap on a slow conveyor drift.
The pods are the deal: each is a real jettisoned-cargo body with an owner. When one
physically reaches the buyer's hull it is restamped `BOUGHT — OFF-BOOK MANIFEST` and
parks. The transfer is the world doing it, not a timer.

- `squad` block = the buyer (an MTS mule in the 'raider' casting slot: `passive`,
  `team: 2`, `scavenger` doctrine — parked and unarmed, mislabeled only by role name).
- `civilian` block = the seller (`faction_quiet`). Mixed factions per block are what
  makes the pairing read illegal at scan range.
- Both loiter + `hold_fire` on their own positions via `setEntityDoctrine` — the
  "docked anyway" read is two bodies that chose to be still.

## The steal and the join

- **Steal:** scoop a pod mid-line (it leaves the world undelivered) or shoot one —
  the deal is a robbery: both crews scatter (`forceFlee`), Quiet rep −2, the pods
  remain whatever the fight leaves.
- **Join:** stand inside 210 WU of the seller for six seconds without touching
  anything — the runner treats you as market: Quiet rep +2, a small cut
  (`handoff:quiet_lay`), and "the Den remembers faces." The deal completes around
  you and the pocket goes quiet.
- **Burn:** kill either party — the survivor scatters with the record.
- **Complete:** all pods delivered or the deadline — both crews ease off.

## Planner placement

`deck: 'civilian'` (the deal spends civilian pressure, not combat budget),
`proximity: true`, `zoneTypes: [outlaw_zone, nebula_fog, derelict_field, ambush_lane]`,
`gates.maxSecurity: 0.75` — fires in the hollow pockets of every sector whose law is
thin enough to look away, including the Quiet Cache and Hollow Station, never in a
policed core.

## Validation

`test/cr-hollow-1-the-handoff.test.mjs` — 7/7 green:

- Shape registered on the civilian deck in the hollow zoneTypes.
- Mixed-faction pairing nose-to-nose, parked (`loiter` + `hold_fire`, zero velocity).
- Contraband pods on the line drifting buyer-ward, seller-owned until delivery.
- Delivery restamps paid freight on the buyer's hull.
- Mid-line scoop resolves `take_taken` with the rep cost and unstamped release.
- Quiet approach resolves `contact_made` with the join payoff.
- Party death resolves `deal_burned`; full transfer resolves `deal_done`.

Full encounter batch (86 tests) green.
