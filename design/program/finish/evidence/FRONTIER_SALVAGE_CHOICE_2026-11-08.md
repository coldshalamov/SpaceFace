# A drifting hulk, two households

## Scene and player choice
The existing Frontier salvage owner already files rights when an eligible ambient hulk drifts within900WU of up to two living homesteads. A player-handled haul inside a claimant's receiving radius settles it to that household, destroys the hulk into supplies, pays the carrier and files the outcome. Taking it outside every claim area or stripping it through the existing player-kill path can instead jump the claim. These are implemented consequences, but their receiving endpoints were invisible.

This increment assembles that into a readable local scene using the actual hulk and named households. A pilot near the filed wreck hears who filed it, sees a nonphysical receiving circle at each live claimant and can choose the physical destination. The briefing warns that the hulls remain solid and that stripping or carrying the wreck away costs standing. A real settlement closes all circles and confirms title/payment; a jump or lapse gets a distinct response. No wrecks, rewards, building modules or free supplies are spawned by this helper. It does not weaken the protection that keeps mission-pinned/persistent property out of ambient disputes.

This is coherent later-route Frontier work while Lane B owns the opening, not a claim to have completed first-hour Adventure. Fresh origin/master remains `f95de0eb1ba7560839209936afba48c7b96fe41a`. Reserved/held/foreign source, model production, publication, worktrees and security/workflow changes are excluded.

## Four-path implementation
`src/systems/faction_frontier.js` gets isolated presentation hooks, newly posted claimant generation stamps and trusted save remapping for those stamps. New `src/missions/frontierSalvageChoice.js` owns only guide/contact presentation. New `test/frontier-salvage-choice.test.mjs` and this note complete the candidate.

Before owner `/tmp/faction_frontier.before-salvage-choice.js`, SHA256 `6997c0645026cc48c9feead2599af22859788998831e295673739a521effa416`. Prior full Barn/provision/aid chain, including the savedSteadGenerations mapping, is preserved and remains a dependency. Owner CRLF is retained.

Each visible endpoint requires a live current-generation claimant matching the dispute's stamp. An open scene also requires the exact live wreck ID/generation and dispute tag. Old unstamped saved disputes retain their original mechanics silently. On fresh restore, a claimant stamp rebinds only when the trusted saved-ID map and pre-remap generation match; otherwise it becomes null. Rings are nonphysical, untetherable, and update their center and radius from the current household. Radius is the existing260WU plus body radius, not a new delivery rule. Sector/mode/arena/loss/generation/closed-state cleanup removes stale endpoints. The helper never marks a hulk handled, moves it or pays.

Once-heard contact state lives on the serialized dispute. Initial contact requires a living undocked local pilot within650WU of the actual hulk. A closed-outcome response requires that the offer was heard and that the pilot is near a surviving exact claimant. The owner can garbage-collect closed claims; presentation does not prolong them.

## Verification
Command:
`node --test test/frontier-salvage-choice.test.mjs test/faction-frontier-expansion.test.mjs test/frontier-aid-receiving.test.mjs`

Author **47/47 pass**, eight new tests. Cases include two named/nonphysical circles, no cargo/reward mutation by guides, physical destination choosing either claimant through actual owner settlement, once-only pay, unhandled drift rejected, player-handled haul-out jumps instead of settling, stale marker/claimant generation, mode cleanup, old unstamped mechanics, actual native haul and fresh-save missing ambient hulk lapse.

Native Rapier uses a starting Pelican and real flight/cursor catch/line progression to take a12t fixture ambient wreck at(750,0) between fixture households(0,0)/(1500,0), choose the first household and haul it into its existing320WU radius. No post-boot player/wreck teleport. Production guide exists and disappears at actual settlement. **71.27 simulated seconds, actual12t mass, zero relevant pilot/wreck impacts, one260-credit claim payment, selected household gets one supply increment.** This is a bounded fixture proof of actual physical choice, not a natural campaign encounter or general collision-free guarantee.

Persistence is deliberately bounded. An ordinary unpinned ambient wreck is not in the persistent-entity snapshot. The actual serializer/fresh `_spawnPersistentEntities`/Frontier deserialize/save:loaded test verifies that such a missing hulk lapses its claim, creates no reward and restores no guide or free replacement. This increment does not turn ambient wrecks into durable mission property, and it does not promise a mid-haul Save/Continue resume. The existing protected-content behavior remains intact.

## Acceptance limits
Rendered names/rings, ambient encounter density, natural two-household discovery, competing traffic, player stripping and UI/disk Continue are not newly playtested. The native scene is fixture-established, though its movement and settlement are real. No screenshots, published commits, integration or user acceptance claimed. Next acceptance is encounter an actual eligible hulk near two homesteads in the rendered game, choose each recipient in separate runs, and verify the title/standing consequences are readable. SF-GAME, SF-LIVING-WORLD and SF-SECTOR-COHERENCE remain open.

A separate restoration regression explicitly marks an already-filed fixture hulk persistent, then restores it into a fresh simulation. Valid claimant mappings restore two rings; a same-ID replacement or missing trusted recipient map restores only the other ring and nulls the suspect stamp. This artificial persistent fixture tests the binding seam; it does not claim ordinary ambient hulks become durable or change protected-content admission.

Final independent read-only review reproduced47/47 and native71.27s/zero relevant impacts/260 once; source/tests approved within the ambient-mid-haul, rendered and full-campaign limits above.
