# Cut intake keeps counting

Status: implemented, locally reviewed candidate; not published, merged or deployed. The receiving radio adds no trade, patient simulation, reward, ledger, saved latch, priority queue or job delay.

## A reason to return

Canon: Cut Refinery is the Drift Miners Collective's ore intake, alloy exchange and repair berth. Its crews keep the cut open against raiders. DMC's founding shaft workers learned to guard what they could carry; faction canon also includes crews hiding the true yield and eliminating a partner. The Quiet routes contraband. Hesper Quill's clinic is an authored exception to its willingness to sell carriers: food and medicine only, lower pay and no setup. Her first trusted medical delivery goes to Cut.

Inference: an intake clerk can sincerely think exact accounting protects crews, while the institution's control of claims and records can serve coercion. Hesper needs the same supply institutions but protects recipients from becoming the price of a receipt. Neither institution is secretly the other faction. No named clerk, patient, personal debt, privacy law or historical transaction between them is invented.

Proposed characterization implemented here: Cut says “Count it before you promise it.” Hesper's separate PR532 answer values “regular carriers, not heroes.” These are complementary needs with different boundaries, not a morality button.

After an actual delivery, departure or return near Cut can produce: “Cut intake: Nyx shipment accepted, 1 unit of Medical Supplies. Market count: 11. Count it before you promise it.” Commodity display name and numbers come from data. A subsequent ordinary market purchase changes current count without rewriting accepted quantity. Missing current inventory is explicitly unknown. Exact zero says not to send a carrier for nonexistent stock; it does not assert repeated shortage, medical need or patient outcomes. The market-buy owner retains its minimum stock rule; the zero-state fixture does not pretend buying can drain below that rule.

## Source and behavior

Shipping base: PR531 head `7930e49766d85435631585be9e6316faa3f6b36c`, preserving its PR526 prerequisite. Station consumer starts from blob `e3e2b3f03bb435f3659e2342eff69da25e2dc1cc`. The shared clinicFreightReadout is byte-identical to PR532 blob `b6ef7c4851f9c51e8d5adc9b8d46a05187fc09ee`; it is one shared immutable projection, not separately owned receipt logic. Future changes must coordinate both branches.

The helper's canonical receipts and committed freight exist on PR531. This branch still uses wanted/trusted clinic routes; PR532's clean-carrier/contact/fence changes are NOT imported or claimed available here.

The new receiving projection requires the actual live station Map identity, Cut station, Hyperion sector, refinery type and DMC faction. Only the latest verified clinic receipt, if destined for Cut, may speak. No search backward past later failure, contradiction or a newer other-port receipt. Invalid or aged-out facts fall back to ordinary ambience.

Clinic uses existing cadence bucket modulo four equal to two. Rhea remains at zero. Latch Nine precedence, ordinary traffic flavor, combat/onboarding/range/voice-floor gates and VFX event ownership remain. Queued clinic validity rechecks raw stock, receipt facts and live station identity. A transient generation expires clinic speech on actual game:newGame and save:restoring events, init and destroy. Actual save-owner restoring state suppresses clinic speech. No lifecycle owner or Save schema changed.

## Verification and limits

Missing ordinary speech baseline: 0/1, actual wanted work earns trust, first medical route partially delivered to Cut, but existing radio speaks generic refinery chatter. Final focused candidate: 31/31. Preserved Rhea actual-world suite: 45/45. Distinct total: 76. Independent review reran 31 plus lifecycle/range/queue adversaries; repeats are not added to the total.

Tests cover actual mission/economy settlement, actual economy.execute buy/sell with cargo and credit movement, Save/Continue, actual VoiceQueue pending/active cancellation, current stock below display precision, latest invalid/foreign receipt, ten-receipt aging, actual lifecycle event wiring and unchanged Rhea behavior. Docking/travel/time and casualty inputs are fixtures, not player flight, rendered UI, full production boot or broad-suite acceptance.

Initial qualification used recovered public `3d1bd1d756fcb6e1daef772c41cc1b675281bd17` plus reviewed Rhea, not the exact branch. That 76-case result remains separately retained. Comparison showed PR531 diverged before 37 upstream commits, so it was not treated as exact-branch evidence.

Final qualification reconstructs the exercised exact PR531 `7930e49766d85435631585be9e6316faa3f6b36c` graph plus only the intended candidate. Forward/reverse public comparisons identify the branch differences. Across both exercised graphs, 49 changed paths were examined: 48 exist on PR531 and one newer-only module is absent. Existing matching readbacks supply 41 inputs; six tiny rollback patches verify both original and target Git blobs; weapons uses its exact publicly fetched source. Missing/newer-only inputs fail closed rather than borrowing runtime. No checkout, rebase, merge or broad suite was used.

On this exact exercised composition, receiving passes 31/31 and Rhea passes 45/45, both exit zero. The missing ordinary receiving-speech baseline also reproduces 0/1 on exact PR531. It is one matched baseline test, not a claim that all 31 were red. Receiving loaded 1,050 source modules, sorted path-to-blob manifest SHA256 `1be58d57b7cb78b06e6c5fb0d3c86db482e3fcfa31185ab61be9b7950b93828f`; Rhea loaded 1,045, manifest `1efc819b7bd50fd2a857ba26b4efb5e9d3a50806eff770e98b81335737621ec1`. This qualifies exercised ESM source, not arbitrary filesystem reads, native dependencies, unexecuted game paths or current-master integration.

Repository commands: `node --test test/nyx-clinic-receiving-broadcast.test.mjs` and `node --test test/rhea-shift-broadcast.test.mjs`. Detailed qualification commands and pinned input evidence are retained with the tests.

Frozen candidate Git blobs: shared helper `b6ef7c4851f9c51e8d5adc9b8d46a05187fc09ee`; receiving projection `c0bc86b34b501e1ce1a9854b2a5df66ee4b9c056`; station consumer `54468c0a90056aabdad2265eef6f1a6dd9aa5e39`; focused test `c64622f032d6e358ac3dfa11d7ff4554b922b9a2`.

Review corrected a test that called newGame directly instead of the actual game:newGame event; the consumer now listens to the real event. An initial fixture left save._restoring true during disposal and kept the runner alive after all assertions passed; restoring that fixture flag produced terminal exit zero. An initial recovered-test run needed --preserve-symlinks-main for its symlinked path. These are not hidden as successful full runs.

Sources: [PR531](https://github.com/coldshalamov/SpaceFace/pull/531), [PR532](https://github.com/coldshalamov/SpaceFace/pull/532), [Cut geography](https://github.com/coldshalamov/SpaceFace/blob/7930e49766d85435631585be9e6316faa3f6b36c/src/data/frontierRegions/west.js), [faction canon](https://github.com/coldshalamov/SpaceFace/blob/7930e49766d85435631585be9e6316faa3f6b36c/docs/worldbuilding/orgs/factions-CANONICAL.md), [fence roster](https://github.com/coldshalamov/SpaceFace/blob/7930e49766d85435631585be9e6316faa3f6b36c/src/data/fences.js).
