# One arrival, one recorded delivery

## Player-facing consequence
The current neighborhood aid route offers two valid physical actions: carry the creditor's marked pod to the household, or bring an ordinary supply pod of your own and cover its open aid obligation. Those should have distinct histories but not invent a second physical arrival. Inspection found `_tickHomesteads` incremented the receiving record for the ordinary pod, then `_settleDebt(..., 'covered')` incremented it again. The household's guide/records could therefore report two deliveries from one real pod.

This increment makes that choice causally coherent. A carried marker adds its own delivery. A covered obligation reuses the supply intake's already-recorded arrival. The real marker is still retired, the receiving guide closes, and the household still says the supply covered its obligation. Both established board payments remain; this is not a payment rebalance or a newly created reward. This is bounded physical-consequence integration on the existing later route, not new first-hour content while Lane B reserves that work.

## Ownership and scope
Fresh remote remains `f95de0eb1ba7560839209936afba48c7b96fe41a`; live Lane B reservations unchanged. Three paths only: isolated `src/systems/faction_frontier.js::_settleDebt` count guard/comment, new `test/frontier-aid-one-delivery.test.mjs`, this note. Before owner `/tmp/faction_frontier.before-aid-one-delivery.js`, preserving every prior Barn/provision/pickup/receiving/heading increment. No held mission, foreign/reserved source, assets/models, publication, worktree, workflow or credential edits.

No settlement radius, physical mass, fee, faction reward, deed, expiry or line behavior changed. No historical saved counter is guessed downward: the evidence needed to distinguish old physical arrivals from duplicate bookkeeping is absent. The correction applies to new owner settlements. Existing closed debt guard still owns replay suppression.

## Verification
Before editing source, the new real-owner regression failed **2 != 1** after one ordinary supply pod covered aid. `/tmp/aid-one-before.log` records that reproduction. The carried alternative remained green. Final code changes only the debt-side increment to `if (how === 'carried')` because the covered path is already counted by intake.

Command:
`node --test test/frontier-aid-one-delivery.test.mjs test/frontier-aid-receiving.test.mjs test/frontier-aid-pickup.test.mjs test/frontier-aid-heading.test.mjs test/faction-frontier-expansion.test.mjs`

Author **51/51 pass**. Four new tests cover real supply-covered one-count plus both existing fees and once-only replay; carried marker still increments once; native physical supply alternative; and fresh actual persistent entity restore with paid debt/count and no reward replay. The last test also verifies a legacy saved count17 remains17 and a subsequent real pod produces18, not a guessed historical repair.

Native Rapier proof uses starting Pelican flight, cursor catch and line progression to carry an explicit10t supply into the ordinary200WU supply radius. Two fixture-built stationary homesteads and their owner-posted debt establish the scene; there is no player/cargo teleport after boot. The existing receiving guide exists and closes after intake. The ordinary marker is retired as covered rather than carried. Result **81.60 simulated seconds, one recorded delivery, actual10t body, two pilot–load contact events, zero other relevant impact pairs**. Player survives; this is not contact-free.

Actual native credits increase650, with every grant captured and summed:140 `frontier_supply:2:2`,190 existing `frontier_lead:lead:2:1`,320 `frontier_aid:debt:2:0`. The test does not mislabel650 as supply pay. The hungry-lead and aid rewards already exist; this increment neither adds nor removes them. The real economy balance matches the event sum.

Fresh restoration uses `_serializeEntities`, `_spawnPersistentEntities` into a new simulation, Frontier deserialize, saved-ID map and `save:loaded`. It verifies the paid obligation and delivery count survive without marker resurrection or replay. This is not a full UI/disk Continue or rendered route acceptance.

## Acceptance limits
The household scene is still fixture-established for native proof, not reached through a complete campaign. Rendered guide/contact readability and full Continue remain open. Existing tow contacts remain physical polish work; this correction does not claim to solve them. SF-GAME, SF-LIVING-WORLD and SF-SECTOR-COHERENCE remain open. No screenshot, published commit, integrated build or user acceptance is claimed. Next playtest should compare the two visible player choices, verify one arrival on each, and retain the explicit payment breakdown.

Independent read-only review reproduced51/51 and native accounting; final source/tests/evidence approved within the stated limits.
