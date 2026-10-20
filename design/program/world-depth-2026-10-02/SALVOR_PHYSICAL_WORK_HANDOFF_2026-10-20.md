# Physical salvor work: source-only living-world increment

## Outcome and scope

General demand-dispatched cutters now travel to the same finite wreck, settle relative to its
native motion, pause an interrupted/displaced cut, carry the conserved lot back to an actual yard,
and obtain the existing economy owner's acknowledgement before clearing the hold. This is the
existing Towline/working-aftermath occupation, not a new mission, economy, queue or asset family.
The live Vesta producer uses the public Ironback/PulsePlate hull for this role. No model was edited.

Implemented locally; **not browser/gameplay accepted, merged, deployed, or published by this unit**.
The original and expanded world program remains open. Root owns source-only public proposal/CI.

## Causal reproductions before changes

- Seed 47047: the ordinary cutter finished WORK after its wreck moved to a 3,902.997 WU gap,
  draining five scrap without physically reaching it.
- The authored Vesta source disappeared and allocator ID 3 was reused by an unrelated wreck.
  Source resolution returned null, but raw numeric-ID fallback took eleven foreign alloys while
  the real source ledger still held eight scrap.
- Mid-WORK Continue correctly rematerialized the source under a new ID, but a cutter 18,393.985 WU
  away immediately took its eight units on the next 0.25-second update.
- First authentic full-stack route exposed PulsePlate-specific handling: late RCS braking hit a
  light wreck, and the denied-site BRAKE command charged the plate and launched the cutter.
- Independent review found a lean far-row promotion retained cargo only on the traffic record;
  saved-while-shelved Continue then rebuilt an empty hold beside the still-correct durable lot.
  It also found NaN native angular velocity accepted as settled. Follow-up authored-source
  shelving exposed a dropped source key, now retained and matched together with its point ID.
  All reproduced review defects were fixed.

## Authoritative seams

- `traffic.js`: stable source-key/ordinary-body identity, existing source claims, conserved
  manifest and work-id ledger, native identity/readiness/current pose checks, physical yard intake.
- `npcJobsRuntime.js`: existing deterministic phase kernel and sole movement-intent writer.
  General work clocks wait for native arrival; controller leases retain the existing clock
  contract but cannot extract while another controller owns the hull. The tractor resolves the
  same stable source as the cutter; changed source identity detaches its old line.
- `farActorTable.js`: existing lean projection preserves the same traffic manifest and keyed
  ordinary source pool/claim. It does not create cargo or a second ledger. A shelved source waits
  for promotion; loss of its worker releases its reservation and journals the row mutation.
- `economy.js`, source stock owner and save format are unchanged. Exact intake receipts still
  accept only the original lot and duplicates cannot move stock twice. Existing Forge policy
  credits scrap and ignores non-listing electronics, while authenticating the complete lot.
  The acknowledged intake then clears the entire manifest, including ignored commodities.
  Retaining rejected cargo or making disposal an explicit consequence is a separate, preexisting
  economy gap; this increment does not silently redesign that policy.

No production pose/velocity teleport, random stock roll, new claim owner, or virtual extraction.
Native reads reject missing/recycled body records, pending restore, stale readback and non-finite
translation, velocity, quaternion or angular velocity. Range uses actual hull envelopes and a
22 WU service margin; relative speed must be at most 8 WU/s. PulsePlate uses ordinary RCS, with an
early closing-speed taper, never its BRAKE/flip-burn command for a denied worksite.

## Evidence and tests

- Final wired `npm run check:sim:salvor-work`: **37/37 pass**. The actual CI dispatcher
  `node scripts/check-ci-report.mjs --list-groups` places it in the existing sim group.

- New physical owner tests: moving source, unsafe relative drift, controller interruption,
  changed claim with fresh retarget progress, source loss/recycled IDs, duplicate source keys,
  ordinary/authored mid-cut Continue, ordinary/authored unresident source, loaded far promotion, saved-while-shelved
  Continue and released reservation after worker loss.
- New authentic native routes use the public world station producer, real Vesta faction cutter,
  ordinary notice delay, flight/AI, combat tractor, Rapier and live economy. No route phase,
  speed, position, cargo or receipt is forced:
  - stationary: dispatch 36.03 s, cut 118.15 s, Forge intake 158.33 s;
  - drifting: dispatch 36.03 s, cut 138.67 s, Forge intake 208.93 s.
  Both conserve seven cargo units from source to hold, credit exactly five scrap at the intake
  event and produce zero duplicate stock delta. The other two electronics are ignored and the
  complete hold is cleared under existing yard policy; this is not end-to-end commodity
  conservation. Separate native adversarial test rejects scalar pose spoofing, a native
  source displaced by 4,000 WU, actual 100 WU/s relative motion and NaN angular velocity.
- Existing salvor occupation, PQ048 source/Continue/hard-sector-exit and SF079 sever/wrangle
  behavioral assertions are retained. Their no-physics fixtures explicitly select custom backend
  and stage real work/yard arrival instead of silently depending on remote timetable extraction.
- Adjacent native tow/occupational-head/job convergence/far-actor/Mile traffic regressions:
  44/44 passed. Other source-claim/source-admission/economy receipt checks passed.
- Independent review: 35/35 adversarial/focused checks plus native resident/shelved Continue 2/2.
  It additionally measured a large drifting source worked at a 177.01 WU standoff, and an actual
  3,903 WU displacement followed by 40.25 WU of real pursuit with unchanged cut progress.
- Public prerequisite `assets/ships/motions/salvage-cutter.motion.json` was absent from this sparse
  working tree. Materialized exact origin/master blob f3155f74e8e7da494137fa5d0bbfcce4c77662b8;
  ANI09 then passed 3/3. This is not a new or modified asset.

Local logs/reproductions are under ignored `scratch/salvor-physical-work-20261020/`. Independent
review evidence is in the sibling `salvor-physical-independent-review-20261020/` directory.
These are local evidence, not a published URL or visual acceptance claim.

## Public portability manifest

Read current remote immediately before commit: public master remains
`a8a9500ab87e1bcff91c407e96f744a52202a134` (20 October 2026, 14:12 UTC).
The private branch must not be pushed. Port only this unit's delta from pre-unit source baseline
`ecf59c0b`, never whole private source files or ancestry.

Exact source/test paths:

- `src/systems/traffic.js`
- `src/systems/npcJobsRuntime.js`
- `src/world/farActorTable.js`
- `test/salvor-physical-work.test.mjs`
- `test/salvor-native-route.test.mjs`
- `test/fixtures/salvorNativeFixture.mjs`
- `test/salvor-occupation.test.mjs`
- `test/pq048-salvage-cutter-loop.test.mjs`
- `test/sf-079-salvor-sever-then-wrangle.test.mjs`
- `package.json`: new `check:sim:salvor-work` and its single insertion in the existing check chain.
- this handoff.

The existing public `_driveLivingAdventureWorker`, physics authority, `hullEnvelopeWu`, far-row
journal and traffic/manifest APIs already exist on public master. No new private helper is needed.
One contextual conflict is expected: the private runtime `advance` call already has Mile-specific
conditions. On public master retain its public surrounding logic and change only the call to
`advance(entry.job, salvorTarget ? Math.min(step, 0.1) : step, this._sink)`. Do not import the
private `mileJob`, `mileCrewJob`, convoy helper, Tally or Thimble additions. New far-row clauses
belong before the existing public Anvil clause; do not copy neighboring private Mile/Tally clauses.

## Remaining acceptance boundary

Own-cloud CUA localhost refused at 12:49 UTC and supported sandboxed Chromium failed socket
creation with EPERM at 13:27 UTC. Neither was bypassed. No browser route or contact-sheet/player-
truth PASS is claimed. Offline geometry renders are inspection aids only. Native synthetic-yard
Continue may take the documented scalar restoration fallback (`identity_or_contract_changed`),
so resident/shelved Continue proves custody/readiness, not whole-world exact native snapshot replay.
