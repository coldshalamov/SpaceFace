# PRI-06 — Hail a station from flight and a named resident answers (#969)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#969" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md` (file-by-file: what the PR does, what master already has,
where it conflicts). Design: `design/game/09_CREATIVE_DIRECTION.md` (the Town Recipe: **Faces** — a named
resident with a findable berth, a want, a one-line voice, and memory of what you did).

## What the player gets
Select a station in flight → HAIL → a named resident answers on a channel. The HAIL key shows a small
work mark when that resident has work. The resident can point you at the berth (sets a course), and a
simple contract can be taken or tracked over the radio. What you said on the radio is remembered at the
dock. Nessa Venn at Lantern Ward is a proper resident (and cannot be hailed once her tug is lost).

## Build — three commits, in this order

### 1. One catalog of residents (`fleet(PRI-06): station residents live in one catalog the dock and the radio both read`)
- New `src/data/stationResidents.js`: move `CANONICAL_CONTACTS` out of `src/ui/station/barContacts.js`
  **from master's current list** (master's list may have grown since the PR — move what is there now,
  do not copy the PR's older list) and add the PR's `LANTERN_WARD_RESIDENT`. `barContacts.js` imports it.
  Pure move: no contact may gain, lose or change a field. Prove it with a test that the dock's generated
  contacts for three stations are deep-equal before and after (capture "before" from `git show HEAD:`).
- New `src/data/contactHailConstants.js` (leaf constants) and the import swap in
  `src/systems/scannerReadModel.js`, as the PR does.
- `src/missions/missionAttention.js`: move the dock-attention read model out of
  `src/ui/station/missionDockAttention.js` **including everything master added since** (for example
  `recommendMissionBoardOffer`), then add the PR's `berthReadiness` extension (unsatisfied required
  conditions, releasable/sellable cargo, partial-delivery settlement). `missionDockAttention.js` becomes a
  re-export of every name it exports today. Bring `test/mission-dock-cargo-readiness.test.mjs`.

### 2. The resident channel in the simulation (`fleet(PRI-06): a hailed station answers as its resident; simple contracts ride the radio`)
- `src/data/stationContactPresence.js` (new), `src/data/contactHail.js`, `src/data/lanternWardHail.js`,
  `src/systems/scanner.js` (the resident-hail lifecycle, `contactHail:cancel`, save resets, guards),
  `src/systems/stationContacts.js` (`stationContact:hailSpoken` → contact memory, dock timer untouched).
- `contactOfferReadiness(stationId, missionId)`: the PR adds it to `src/systems/missions.js`. Put it in
  `src/systems/missionBoardOps.js` instead (the board's ops mixin — it is a read of a posted offer), so
  `missions.js` is not edited. Keep its rule exactly: only
  `bounty_hunt, patrol_clear, mining_quota, recon_scan, salvage_retrieval`, with no preloaded cargo,
  story tag, clauses or set-piece, may be accepted over the radio (`remoteSafe`).
- `contactHail:cancel` is sent from the main thread: add it to the forward set by regenerating
  `src/core/mainToSimEventSurface.js` (`node scripts/lib/eventSurfaceCensus.mjs --forward-set`) — never
  hand-edit the census numbers. Port none of the PR's other edits to that file.
- **Cost:** `_readContactHailAvailability` must not run a resident/offer search every tick. Compute the
  work mark when the selected target changes, when the board changes (`mission:*` events) and on dock/
  undock; keep the result. Say in the receipt what triggers a recompute.
- **Saves:** no new saved state is required for a channel (it is reset on restore, as the PR does). Contact
  memory written by a flight hail uses the existing contact-memory record.
- Bring `test/station-resident-channel.test.mjs`, `test/lantern-ward-hail.test.mjs`,
  `test/d210-lane-parity-comms.test.mjs`, and the PR's additions to `test/contact-hail-route-detail.test.mjs`
  (master re-pointed that test's CSS pins at `styles/ui.css` — keep master's pins, add only the
  resident-channel assertions).

### 3. The two UI touches (`fleet(PRI-06): the hail prompt shows the resident, the work mark and a way to close the channel`)
Master re-parented the hail prompt onto the Stage prompt slot and moved its styles to `styles/ui.css`;
keep that. Add only:
- `src/ui/contactHailPrompt.js`: resident name/role on the panel, the work mark on the HAIL key
  (`!` work offered · `◇` tracked · `✓` ready to hand in), aria-label carries the work label, and a
  `CLOSE CHANNEL` key that emits `contactHail:cancel`. Style in `styles/ui.css` beside the existing hail
  rules, using existing tokens only (no new colours, no glow, type ≥ the floor `node scripts/check-type-floor.mjs` enforces).
- `src/ui/commsRadial.js`: register the `resident_*` / `lantern_repair` action ids and prefer
  `residentName/residentRole/residentFactionId` over the generated callsign.
- Every resident line is one short sentence (PR-INTAKE rule 5). Cut any line over about 90 characters to
  its point.

## Drop, do not port
`src/render/renderer.js`, `src/render/renderPackageManifest.js`, `assets/**`, `test/ashline-*.test.mjs`,
`src/systems/missions.js`, the PR's docs.

## Files you may edit
The files named above, and `styles/ui.css` (hail rules only). If `src/systems/scanner.js`,
`src/ui/station/barContacts.js` or `src/ui/contactHailPrompt.js` shows foreign changes in `git diff`, do the
other commits first and re-check every ten minutes for up to thirty; then report Blocked for that commit.

## Checks
After each commit its own tests; at the end, in one call:
`node --test test/station-resident-channel.test.mjs test/lantern-ward-hail.test.mjs test/d210-lane-parity-comms.test.mjs test/contact-hail-route-detail.test.mjs test/mission-dock-cargo-readiness.test.mjs $(grep -ln "barContacts\|missionDockAttention\|contactHail\|stationContacts" test/*.mjs | tr '\n' ' ')`
— report pass/fail counts; reds that already fail on untouched master are reported, not "fixed".
`npm run check:src-imports`, `node scripts/check-type-floor.mjs`.
One picture: `node scripts/ui-bench.mjs --list | grep -i hail` and shoot the hail shot ids at desktop and
`--viewport=390x844` into `.devshots/fleet/pri-06/`; name the PNG paths in the receipt (the lead opens them).
