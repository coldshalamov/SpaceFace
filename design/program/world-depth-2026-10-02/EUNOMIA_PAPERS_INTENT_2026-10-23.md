<!-- LIFETIME: DURABLE -->
# Eunomia: explicit cargo papers, not an automatic nearby-cargo fee

Status: reviewed current-master candidate; five named files pass52/52. Production worker gate is blocked by a separately reproduced upstream missing module. No merged, live-game, visual or whole-sector acceptance claim.

## Player-facing correction

The ordinary Eunomia papers route previously washed nearby hot jettisoned cargo on docking/opening Market. A reproduced case charged the player 1613 credits for an unselected, untethered foreign merchant's eight-unit narcotics pod. It retained that merchant's title while adding a player receipt. The existing wash/save/return route working did not make that automatic payment intentional.

Market now presents a separate Papers service. Docking, opening and requesting a quote are read-only. The player sees the physical pod's label, quantity, title name, faction, distance and exact cut, then confirms one pod. At most the nearest32 eligible pods are quoted, with truncation disclosed. Ownership remains unchanged: this is the existing legality/remap service, not a title-transfer system. Held inventory is not silently washed. Refresh obtains a new quote after a verdict or a change.

## Authority and persistence

The simulation owner binds an opaque transient token to current player/pod/berth references and core occupant generations, sector/entry context, displayed cargo identity, contents, legal/title fields and exact fee. Confirmation consumes its token before validation. Changed or recycled entities, price, range, contents or context are refused. Existing economy requireFull/expectedCredits/commit/result semantics remain the sole payment authority; a missing or rejected payment owner cannot stamp free papers. Only the chosen pod is stamped and receipted, once.

Bare owner-ID filtering was deliberately rejected. Actual Continue remapped player375 to1 while saved pod title375 remained; repeated saves could lose that remap provenance. Explicit selection fixes consent without inventing persistent custody, changing title rules or rewriting Save. Existing prices/reputation cuts, narcotics legality, classified-salvage remapping and later customs rules remain unchanged.

The UI uses independent context/request IDs and ignores stale replies. Close, Back, reopen, undock, region transitions, New Game and load invalidate transient intent. Tethys still unlocks via the physical entrance parcel caught by its delivery owner, independently of washing; only its delivered guidance sentence changes. BUY, Sell and ordinary market quote/time gates are not replaced.

## Evidence and limits

On public base45a97fdbda62611cc13001bd16790f8afa844753, root ran exactly six named test files:53/53 passed.30 owner cases,10 isolated UI cases,1 actual production worker transport case and12 existing-law/market cases. Independent review caught and fixed missing fallback display identity binding and narrow-panel wrapping risk. The UI now stacks/wraps its own rows with44px controls; no global stylesheet change.

Actual Save/Continue, repeated save and region return are covered; original lawful/customs and Tethys physical delivery assertions remain. The worker check uses public createSimHost with production profile/bridgeAll, structured-cloned command envelopes and real reply capture. It fixtures the player/pod/docked state and runs zero simulation steps. It is not an ordinary flight or browser-startup test. UI checks use the repository fake DOM, not rendered visual acceptance.

Root's old-base source-qualified rerun verified1583 unique ESM inputs, manifest SHA256 b2618e482db76d666d38a00270b2a33fa5f887cf839f05d1d93e4ec77b6c96d4. This does not cover every arbitrary filesystem read or installed dependency. Two disclosed diagnostic substitutions resolve the scratch scenario URL and the source-reading LAW06 assertion without altering portable shipping test bytes.

The review's first45-pass/two-file-error output was truncated and its cause remains unknown. Subsequent complete passing runs do not retroactively explain it. Rejected pre-atomic generators, baseline failure evidence and final old-base sources were retained in verified recovery artifacts. Final old-base recovery:21members,333380bytes,SHA256 c87386dad62d18929fc9819a95ea17eda1867c3fc5e02214225bbdafc034b2a6.

## Current-master integration gate

Master advanced69commits to50d285fd9d6e013c5bd7bda59df097c615bdd933 before publication. All owned existing source/test bases except barContacts remained identical; shared dependencies changed. The delivered Tethys sentence must be applied uniquely to current barContacts while preserving newer contacts. Current-source dependency closure and six-file rerun were attempted; the split result below is the exact validation boundary. No old-base source is to overwrite new master.

## Remaining acceptance

Rendered Market reachability, ordinary flight interaction, desktop/phone visual quality and performance remain unaccepted. Existing browser approval is still required for that dependent route. No merge or deployment. All larger game, world, asset and acceptance goals remain open.

Independent current-source compatibility review (05:17 UTC): exact economy35600a4f change adds ending trade multipliers; its atomic credit handler is unchanged. Saved1504efd and migration18→19 add worldPressure/gate/nav fields, not player title, credits, ledger or pod data. Current uiRoot0ac2ab1f adds logbook recap lifecycle; stationApp56bf9aab adds help/gloss and arrival presenter lifecycle. Market factory registration, screenFor, DOM mount and onShow dispatch remain intact. stationScreen/frame/layout hashes are unchanged. Papers is a sibling of quote content, so quote repaint does not erase it. This establishes current source-level normal station/ORRERY reachability, not rendered acceptance.

## Current validation result, 05:24 UTC

Five named files pass52/52 against50d285. Source qualification covers1182unique ESM inputs; manifestSHA2566b433b248609486c373b2d7dfbed86c6810ea988616f40e69e38f51387167104, logSHA25641868f6ece5bd485e1938d8c7164995dcd6917b9ffc3707ff327ded059c62a4b. These are the owner/UI and three existing-law/market files, not the production worker case.

The worker cannot initialize: public src/systems/onboarding.js blob7530734662abb091cdb7fe68864a3aef08ddc0eb line57 imports ../onboarding/powerSituations.js, which is absent from the complete current src tree and returns404 via an exact-revision contents read. A standalone current-public onboarding import with every Eunomia override disabled reproduces the same failure before initialization. Root independently checked exact-path404 and unchanged master at05:23. No stub, suppressed import, private source or weakened worker assertion is included. The new focused package command intentionally retains the real worker test and will report this blocker until its existing upstream owner repairs it.

Initial current attempts also found missing local carrier inputs; those were exact-public source restoration gaps, repaired and retained separately from the actual missing upstream module. They are not counted as gameplay defects. Final delivery preserves all newer upstream source; barContacts reconciled target90ecdfd814bda628c1682b75400977d1a74022e1, SHA2567be710302cdcf9e43e7bd4855c9ac2f88ee40cdd87877b4a3539a6f2b93e43f9.

Root independently reran the five current named files at05:24:52/52 passed, zero skipped. Duplicate reruns are not additional distinct cases.

Focused registered gate: node --test test/eunomia-launder-confirm.test.mjs test/eunomia-launder-service.test.mjs test/eunomia-launder-worker.test.mjs. Adjacent explicit checks: test/next-wave-law-06.test.mjs, test/pq-151-02-launder.test.mjs, test/pq-177-04-black-market.test.mjs. No aggregate suite was executed.

Exact source scope: pirateDisguise owner; isolated launderService UI; Market service mount/lifecycle only; dock-arrival guidance; one delivered Tethys bar-contact sentence; three new tests; three amended existing tests; explicit package registration; this report. Shared economy, Save, onboarding, physics, worker transport, BUY and external content-packet namespaces are unchanged.
