# Scale 4: keep the second slip

## Actual route and authored purpose

This new increment follows the Archive checkpoint; it does not modify that candidate. Fresh origin/master remains `39887a0186bea79eed4c8648fa34a4eb6c4e461e`. Existing dirty/held paths and NOW claims were inspected. Scope is clean `src/systems/kesslerScale.js`, new `src/systems/kesslerComparisonContact.js`, `test/kessler-comparison-contact.test.mjs`, and this report. No generated files, models, publication, worktrees or external execution tasks.

The actual Book 1 mission spine (`src/data/missionsData.js` STORY_BEATS, `src/story/campaign47a/campaignData.js`, and `embodiedMissions.js`) routes sealed alloys to Tethys, then weighs on Scale 4 before the Ceres furnace job. `kesslerScale.js` already owns the open measuring ring, four existing worksite dressing pieces, real cargo-pod eligibility, low plate read, persistent pod receipt, campaign variance flag and weighed event. Those owners and their geometry remain unchanged.

The existing activity is concrete, but stops narratively at a short reading: the player receives a clue without a small reason to revisit the registrar. This increment makes the next visit an optional empirical comparison, not a new quest gate. When the living pilot reaches the ring within 350 WU in flight, Kessler explains how to place and recover freight. The actual scale owner supplies the first variance reading. Four simulation seconds later, while the pilot is physically nearby and undocked, LOG distinguishes one bad reading from a pattern and invites a load with a different stamped mass. A second actual reading with a different stamped mass at the displayed tenth-tonne precision retains both slips and produces a delayed, persistent LOG comparison. No pay or standing is invented and neither cargo ownership nor Book 1 progression changes.

The consequence is deliberately limited: two paired readings are retained in story flags and spoken together. This does not establish who skimmed freight, create a new allegation, prove cargo disappeared, or grant a new campaign outcome. The numbers come from existing physical-pod mass and the established plate factor, not a fabricated manifest. Kessler's existing voice and physical reading are retained; LOG supplies the optional follow-up.

## Integration and persistence

The clean measuring source gains one import, one call after the owner commits a read, and one calendar contact tick. The helper writes only its additive story flags and emits existing comms popups. It cannot weigh, take cargo, move a body, advance a mission, pay, or change reputation. Local voice requires an alive pilot, valid position, flight mode and no independent `ui.docked` latch. Existing remote weighing remains legal; its voice waits until a pilot visits, without claiming that pilot delivered the remotely measured pod.

Samples retain only plate, true mass, and the owner's monotonically increasing read count. Equal-mass reweighs cannot complete the comparison. There are no live entity references or recycled numeric IDs in saved contact state. Pending first/second responses and spoken flags are primitive JSON-safe story flags. The test calls the actual save `_serializeMissions` boundary, which clones the whole story, and reconstructs the serialized flags across a fresh system initialization. This is serializer-boundary/resume evidence, not a full save/load or Continue run. Existing story flags are the persistence boundary; no separate timer or automation is created.

## Physical discovery and honest limits

The first native experiment released 2 and 3 iron units through the actual cargo owner and found both pods physically weighed 20t. `spawnPayloadEntity` has a minimum physical mass of 20. Therefore a different unit count alone is not a different scale load. The implementation retains the true physical comparison and the player line now explicitly asks for a different **stamped mass**: same stamp, no new comparison. The successful owner experiment uses 30 and 31 iron units, producing 24t and 24.8t bodies and 22.6t/23.3t plate reads. This is an optional revisit using existing freight, not a requirement to buy cargo or exceed a starter hold's capacity. Small equal-stamp loads still produce normal existing readings and campaign progress.

Native evidence uses actual cargo-owner bay releases, native physical pods, the scale owner, and real flight/physics. Bay-release arguments and starting cargo are test setup, not a claim that the full flight-jettison/tow/recover control sequence was exercised. Local pilot departure and return are driven with ordinary flight inputs; the test does not fly the entire alloy mission, dock/unload at Tycho, or populate ambient Tethys traffic. Existing worksite rendering, voice/audio timing and label readability are not newly visually accepted. No screenshots are claimed.

## Goal state and next action

SF-GAME / SF-WORLD-DIRECTION / SF-SECTOR-COHERENCE / SF-LIVING-WORLD remain open. The increment supports the actual Book 1 route and a small revisit consequence; it does not replace the twenty-concept game scope or complete a sector dossier. SF-ASSETBANK/SF-ASSET-QUALITY remain integration/review responsibilities with model production left to local agents.

Next: independent source/owner review, preserve these four paths with their dependency identities, then authorized publication and an integrated Tethys playthrough of real jettison/tow/recovery plus the delayed comparison. No publication or acceptance claim is made by a passing unit/native fixture.

## Final evidence

Focused contact suite: **7/7 pass**. Combined comparison, scale, worksite, Kessler open-ticket and existing rope-scale evidence suites: **49/49 pass**. The separate formal rope-scale evidence is untouched: this contact does not create an economy-contract filing or Bar slip. Native run completes in **62.7 simulated seconds**, with actual 24t/24.8t cargo bodies, 22.6t/23.3t readings, a physical 400-WU departure and return, and one paired response. Starting cargo and bay-release commands are fixtures; no full jettison/tow/recovery acceptance is claimed. Independent reviewer reproduced the revised native route and found no source blocker. Logs `/tmp/kessler-boundary-final.log`.

Review caught an initially hidden 1t comparison threshold: 30 and 31 actual iron units produce visibly different 24.0t and 24.8t stamps, but the first helper refused them. The condition now compares at the actual displayed tenth precision. Native regression uses those adjacent quantities; a separate boundary test distinguishes unchanged rounded stamps from a changed tenth. No promise of a different stamp is left behind an undisclosed one-tonne requirement.
