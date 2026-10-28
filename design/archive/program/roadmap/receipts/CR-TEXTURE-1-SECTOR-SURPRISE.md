# CR-TEXTURE-1 — Per-sector surprise coverage

**Row:** build_map.md §1 row 52 — "Per-sector surprise coverage — each named place gets one
reachable one-off (rumor or skyline)".

**Spec:** build_map.md §23.2 "CR-TEXTURE — A sector should be able to surprise you once".

## What shipped

Every named sector now carries exactly one reachable texture one-off on the existing
`WORLD_ONE_OFFS` substrate — a real prop cluster at a real anchor, no mission, no scan gate,
no economy hook. Nineteen records were added to cover the nineteen named sectors that had none
(24 sectors total; the five starter-pocket sectors were already covered):

| Sector | One-off | The joke the physics tells |
|---|---|---|
| Pallas Drift | The Erased | A cleaner's stripped bow is being walked into the fog on a live salvage clamp — ropeable evidence |
| Charon Expanse | The Tag Post | Hunters hang a hull plate per paid writ beside the Lung marker |
| Sker Haven | The Impound Shelf | Everything the Reach ever seized, welded to a rack — the rack is ropeable |
| Veil Nebula | The Surge Shrine | A memorial welded to a comms mast so the storm surge rings it |
| Ashfall Reach | The Ledger | The dead liner Kurtz has counted for eleven years |
| Nyx March | The False Gate | A jump ring that never spun, made a shrine anyway |
| Hyperion Cut | The Half-Cut | A drill platform that died mid-bite and kept the grip |
| Kepler Scar | The Unbroken | One standing mast inside a ring of dead corvettes |
| Orcus Shadow | The Tide | Debris pinned in a slow ring around the anomaly nobody made |
| Rhea Cinder | The Pour | A slag stream that stopped mid-air, tank ropeable |
| Haumea Rift | The Seam-Light | A worklight burning on the fissure lip, drill still seated |
| Eris Margin | The Drift Choir | Dead habs strung on a tether line like laundry; last pod ropeable |
| Phoebe Echo | The Answer | A comms array repeating on a retired channel; the buoy answers |
| Nereid Shoal | The Open Hand | A tanker coupling mid-dock with nobody |
| Proteus Well | The Double Take | A stash rack parked in a dead boatbay's shadow |
| Triton Wake | The Watcher's Tithe | Offerings left at the anomaly's rim |
| Eunomia Gulf | The Held Note | A container addressed to a dead crew — ropeable, deliverable |
| Sedna Dark | The Pin | A lane marker for a route never finished |
| Dione Lane | The Dispute | A container impounded by both crews at once — two liens, no manifest |

Six carry `physicalBody` where the rope is the joke (the evidence, the shelf, the pour, the
choir pod, the held note, the disputed keg); the rest are non-colliding dressing on the
established `_spawnPlaceProp`/`_tickWorldOneOffSpin` path. No new art — every `placeId`
resolves a packaged GLB (verified by test and by review enumeration).

## Reachability — rumor

Each covered sector carries an `AUTHORED_DOCK_RUMORS` entry at one of its own stations
(`src/data/frontierRumors.js`): a stranger docks, asks the barkeep for rumors, and gets a
direction that names a landmark, a hazard rim, or a cardinal bearing she can fly — not a map
pin and not a mission. Charon rides the existing Expanse lead via an additive append (the
tether-wreck sentence is verbatim; the tag post was appended).

Precedence in `barContacts.buildReply` keeps existing leads honest: `uniqueWreckBarRumor`
still answers first at Sker and Haumea (both have live authored wreck leads); when its
bearing is discovered it fails closed and the texture lead surfaces. The authored lead
still attaches the purchasable `frontierRumorOffer` card; survey-unlock offers remain
reachable on the `word` choice.

## Validation

- `node --test test/world-one-offs.test.mjs` — 9/9: count pin (31 = 8 starter + 4 CV-QUIET +
  19 coverage), coverage test (every sector ≥1 one-off; every non-starter sector has a bar
  lead at one of its stations), anchor-resolution and radius bounds for all 31 records and
  every cluster part, packaged-GLB existence, spin cap, spawn-harness wiring.
- Adjacent batches: frontier-rumor-cards, bar-faction-greetings, depth-program-r2-rumor-surfaces,
  frontier-station-chart-notes (19/19); inference-expanse-writ-clerk, pq-032-00-set-pieces,
  charon-bounty-board, bounty-mark-posting, economy-honesty, depth-program-k1-services (all green).
- Live check: `buildReply('barkeep','rumors',{state},st)` returns the authored lead at 17/19
  new stations; Sker and Haumea return their pre-existing wreck leads first by design.

## Total-fix: stale golden repaired

`test/bounty-mark-posting.test.mjs` — the mark-roll golden predated the committed INFERENCE-19
gate/anchor mechanism (`anchorId`/`anchorRadius`/`anchorMinRadius`/`placeName` replaced bare
`zoneId`). Committed `rollBountyMark` in `src/data/bountyMarks.js` is the owner; the golden
was updated to the real output (`the Vesta Forge gate` anchor for that seed). Not re-recorded
to pass — verified the new output against the committed mechanism first.

## Review history

- Review 1 (subagent): flagged 6 issues — a hand-computed golden claim (false positive; the
  suite ran green), a "six bodies" comment vs five records, four rumor/comment direction
  claims that were geometrically wrong or ambiguous (Veil "south rim" → fog NW interior;
  Eris "fog edge" → inside the west fog; Hyperion "north of the cut" → "east of the
  refinery", which is literally named Cut Refinery; Rhea "cinder line" → "the claim",
  which is literally named Cinder Claim), and the Held Note restructure so the ropeable
  body is the deliverable container itself.
- Review 2 (subagent, bounded re-verify): **PASS** — all six resolved; direction claims
  re-checked against hazard centers and station names; bounds and GLB existence re-enumerated.

## Residuals

- `station_dione_customs` hosts the Dione lead while the prop anchors to `station_dione` —
  deliberate fiction (the customs crew holds one of the liens); the sector-level coverage
  contract is met either way.
- Rep-gated stations (Sker Bazaar, Ruined Cache) put the lead behind dock access; the
  physical skyline carries reachability for a stranger who only flies through.
- One-offs remain non-systemic by design: the ropeable bodies move under the existing
  Massline/rope systems and carry world-records tombstones if destroyed — no new verbs.
