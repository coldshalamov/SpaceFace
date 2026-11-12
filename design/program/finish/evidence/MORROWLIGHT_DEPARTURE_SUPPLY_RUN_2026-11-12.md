# Morrowlight: departure preparation as a small physical voyage

Baseline: `experience-commissions/EC-G15-work-that-is-enjoyable`, commit `25341e918baed5a1f742e0bf7ed2dae3e1f8ec4e` (PR #982). This is an integration candidate, not accepted world completion.

## Creative decision

Morrowlight already has meaningful work but leaving its service card can feel disconnected from the nearby original supplies. Turn the next trip into an understandable errand: inspect the ship's fuel and protection deficits, see which surviving original locker holds an applicable supply, manually fly there, recover through the existing physical interaction, and return home to book work. Do not create another inventory, automatic service purchase, replenishment system, or new model.

This is preparation rather than a mandatory quest. A player can leave damaged, bring supplies from elsewhere, or use prepaid work already underway. Original stock is finite and shared with all other uses. The card describes missing service supplies, not a reserved reward or promise that a hold has room.

## Source-linked toolbox and implementation

- [`runtime.js`](../../../../src/features/salvageTender/runtime.js): owned service card now opens departure preparation. Each source action rechecks ownership, proximity, sector, current deficits, original body ID and occupant generation. It plots a normal manual-flight fix using existing `_course`; no autopilot. Synchronous course callbacks cannot dismiss a replacement run/card.
- [`departure.js`](../../../../src/features/salvageTender/departure.js): read-only plan derived from current fuel, hull and armor, sellable (unsealed) cargo, service stage and authoritative live recovery bodies. Fuel and combined protection estimate reuse existing per-cell/per-scrap rates.
- [`physical.js`](../../../../src/features/salvageTender/physical.js): remains the owner of finite original bodies and existing unload/restock/identity checks. No edits here. Do not infer visual placement from these identities.
- [`services.js`](../../../../src/features/salvageTender/services.js): remains the owner of spending, service transactions and paused prepaid work. No edits here. The plan deliberately does not subtract booked work from current physical deficits; it tells the player that this remaining work is prepaid and pauses when they leave, so they should not buy it again.
- [`model.js`](../../../../src/features/salvageTender/model.js): existing service rates and ranges, unchanged.

## Player knowledge and causal sequence

1. At the owned tender, the player knows this is their working home and sees its ordinary service options.
2. Preparation explains their ship's actual deficits and the unsealed supplies already in their hold. Working Bench remains required for normal repair; the starter weld is a separate ability, not silently replaced.
3. A named original locker offers an outbound fix only if it currently contains a supply the ship lacks for service. The player understands why this place matters before departing.
4. Normal flight and speed matching remain the activity. Recovery remains the existing selected single-item or complete unload, with normal hold restrictions. The navigation action neither transfers nor spends anything.
5. The preparation card also exposes the ordinary home fix. Returning and booking work remain existing actions. A new card recomputes the plan after recovery, damage or service.
6. Save/Continue restores existing authoritative state, not a stale second plan. Lost originals remain lost and depleted originals are not advertised as replenished.

## Sector and scene dossier delta

Morrowlight's original rescue-site lockers become a repeatable local route for workshop supplies rather than unrelated loot. Their salvage identity and finite stock remain intact. The tender is the return landmark; its services are the reason to return. Stock depletion changes the available preparation destinations. Neither elapsed-time ambient life nor broader mission dependencies are invented by this increment. Composition, lighting, landmark silhouette and on-screen card readability still need a new live-build visual review.

## Evidence and limits

`test/tender-departure-supply.test.mjs` covers truthful preparation, plot-only action and resource conservation, distance refusal, live depletion, recycled occupant refusal, prepaid-work disclosure, cold restore, and synchronous new-game/replacement-card callbacks.

A native physics/production starter-flight test follows the plotted original locker from staged owned-tender conditions, flies 75.007 m over 4.8 simulation seconds, then uses normal single fuel-cell recovery. Ten units remain in the original manifest. This proves that this marked local route can lead to a physical recovery interaction. It does not prove earned ownership, a whole Adventure opening, the production registry update order, a return flight, all approach directions, controller usability, or visual/audio quality. No screenshot was produced and no visual acceptance is claimed.

## Open-goal continuation

- **SF-WORLD-DIRECTION**: active; owner creative-direction integration. This candidate connects existing home, deficits, supplies and work without new lore. Next: review this errand in the earned Morrowlight progression and confirm when it first becomes useful.
- **SF-SECTOR-COHERENCE**: active; owner scene integration. Local destination and home-return hooks implemented; acceptance pending live navigation/composition review and actual return voyage.
- **SF-LIVING-WORLD**: active; owner world experience. Finite stocks and prepaid pauses are real consequences; ordinary inhabitants/economy and elapsed-time presentation are not claimed here.
- **SF-GAME**: active; owner final integration reviewer. Candidate requires independent review, exact GitHub publication verification and integrated playtest. This is not Swarm progress.
- **SF-ASSETBANK / SF-ASSET-QUALITY**: unchanged, integration/review responsibility only. Reuse of existing tender, original lockers and navigation is sufficient; no model wishlist or competing production lane warranted.

No denied path, UI-shell file, model lane, workflow, credential or deployment change. No merge or deployment authorized by this candidate. Broader concept scope remains open.
