# Counterweight: a working apron, not a disconnected minigame

Source review: 2026-11-12. Repository coldshalamov/SpaceFace, exact source parent 9eceb22cca06c60df0ea8c9c66c77baf02e86034 (#982). Bounded source candidate implemented and native-tested below; no fresh visual review, publication or player acceptance. The shared checkout was not switched. GitHub search found the current Counterweight commission in #982; a PR-title search is not a complete path-ownership guarantee.

## Reusable playable material

`src/features/counterweightCircuit/definition.js` provides an authored Pallas Drift venue at local 1800,-600, with registrar mast, two lane beacons, lights, demonstration machinery and return mast. These are existing authored placements, not proof of their appearance in a live camera. Seven events already reuse real cargo pods, ore containers, a fragile instrument pod and Ceres open receivers. Starter loads are18T; the instrument is9T. Preserve these roles instead of commissioning more models.

Soft Berth teaches complete-load seating and braking. Long Arm adds taut swing and deliberate release through a gate. Clean Sling adds a ship-exclusion rule. Fragile Freight makes condition consequential. Split Decision requires two-load parking. Moving Berth changes the receiver reference frame. Finale combines earned prerequisites. Do not narrate all seven as a mandatory linear ladder: `definition.js` gives Moving Berth only Soft Berth as prerequisite, and Finale excludes Moving Berth from its prerequisite list. Existing records and practice completions, rather than dialogue, own unlocks.

`physical.js` and `course.js` own real admitted bodies, safe placement alternatives, native receiver mouth/support witnesses and finite moving-receiver controls. `runtime.js` owns attempt generation, current original cohort, preparation, rewards, result lifetime and restore. `readModel.js` and `prompts.js` reuse the shared prompt deck; they should not become a new UI shell. `presentation.js` already offers receiver/exclusion/gate marks and a non-colliding personal ghost. Reuse these, not fake target rings that substitute for physical success.

## Player knowledge and current opening gap

Arrival exposes seven course records and a preview menu. Preview gives the physical question/rule, medals and practice-versus-ranked consequences. Admission waits for native plus authored presentation receipts. The next card says preparing, then staged, then gives the attachment hint. There is no clear explanation here that entering a260WU commit ring or touching a line arms the clock (`attempt.js`, staged transition; `physical.js`, commit observation).

More importantly, this is not only a copy gap. Soft Berth's first load is at local offset210,0 relative to the registrar. Its fixed authored first-load origin is also the commit-ring center. At the registrar center the pilot is already210WU away, inside the260WU ring. Thus after successful admission the clock can arm without a deliberate approach. `pickCourseShift` only shifts Z through [0,180,-180,360,-360]: the same registrar-center distance becomes210,276.5863 or416.7733WU. Placement obstruction can therefore change whether merely starting the course starts its clock. The pilot's registrar approach position further changes that result. This calculation is source-level evidence, not an ordinary-play reproduction.

## Chosen next coherent assembly: deliberate departure from the registrar

SF-SECTOR-COHERENCE / SF-GAME, state: bounded briefing-apron candidate implemented; owner: Adventure integration reviewer.

Make first arrival a legible sequence: inspect the registrar and terms; choose practice or ranked; see the actual admitted load and receiver; deliberately leave the safe briefing apron; cross the course start; perform the physical task; return to the same registrar for records and the next challenge. The world consequence is learned handling plus authenticated event history, not a fictional new job or repaired machinery.

Implementation decision: do not move any course. Retain the existing260WU proximity ring, but require the pilot to be outside the registrar160WU interaction apron before proximity alone starts the clock. A real existing course-line binding still starts immediately, including inside that apron. Once running, returning never pauses or resets the clock. No save schema, score, body pose, placement, unlock or reward changes. `physical.js` uses the existing `OFFER_RANGE_WU` and `COMMIT_RADIUS_WU` constants; `readModel.js` explains the rule in preview and staged progress, not while preparation is pending or the run is already live.

Verification: a new native Rapier fixture on the exact unchanged parent fails at registrar center because phase becomes running. The candidate passes7/7 focused tests: center plus all four exact160WU cardinal edges across all five clearance shifts; force-driven departure and exactly one arm event; outside-apron but outside-course non-start; actual native line binding from inside apron; center staging for all seven events; force-driven return retaining the original armedAt with live journal elapsed time; preview/staged/preparing/running copy states. Combined with existing attempt, briefing, native physical, persistence and venue-entry suites,44/44 pass. The first test version incorrectly inspected terminal FSM elapsedS instead of the live journal projection; corrected test reads the actual live clock. These tests create real native bodies but are not rendered ordinary player routes or full Continue.

Next executable action: independent frozen-byte review, then authorized publication on the verified current #982 head. Player acceptance remains open: ordinary registrar approach, preview selection, admission, deliberate departure, Soft Berth completion and return in a live camera; all-seven-event pacing; cold worker/browser Continue. No new assets required.

## Narrative connection and scope

Use RATCHET's earned hauling experience as context for why this place matters, but do not add another referral card now: existing RATCHET aftermath already offers its real next order. The Circuit should be an inhabited working training apron encountered in Pallas, a place to practice before taking irreplaceable freight, with its demonstration rigs and return mast making the activity readable. Those fixtures currently establish authored scenery, not proven animated workers, economy or installation activity. No asset request is justified until the arrival layout is visually examined.

SF-LIVING-WORLD remains open: no invented spectators or workforce claimed. SF-WORLD-DIRECTION remains open: broader mission-route integration and twenty-concept map not revalidated in this bounded review. SF-ASSETBANK/SF-ASSET-QUALITY stay integration/review only. This dossier narrows a consequential next scene increment rather than adding more maintenance tasks.
