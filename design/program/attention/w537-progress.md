# W-CANON progress — build_map row 537 (§34.7)

Lane: devin-w537. Date: 2026-10-26.

## Done

- Six interludes play as quiet vignette scenes on the live route, one per book boundary
  B0→B5: `src/data/encounters/926..931-interlude-*.js` — externalOnly, selfRegistered,
  livedVignette, never in ambient rotation; each stages a physical log object the pilot
  flies up to and reads (spotter buoy, painting skiff, tally buoy, relay pylon, records
  crate, catalyst grid).
- `src/story/campaign47a/interludes.js` — data seam only: id, shape, flag, minBeat,
  staleBeats, home sector/station, anchor offset, citation. Owns no cursor, pays nothing.
- `missionStoryOps._stepCampaign47aInterludes` — missions.update stepper requests owed
  scenes through `encounterDirector.requestAuthoredEncounter` (force:true, deterministic
  anchor), one quiet scene at a time, while the pilot is in flight; an interlude never
  starves behind ambient/live scenes — it waits its stage.
- `missionStoryOps._observeCampaign47aInterludeResolved` — wired in missions'
  `encounter:resolved` listener: non-aborted resolution sets `story.flags.interlude_<id>`
  + sidecar choiceLog/history rows. Aborted scenes mark nothing and re-request after a
  45 s backoff on a later quiet pass; seen scenes never request again.
- Canon adoption: `docs/worldbuilding/CANON-LEDGER.md` adjudicates every PROPOSED CANON
  marker in design/expansion (files 01–04, 06–07; 00/05/08 declare none) — ADOPTED rows
  name the canon sheet, the two REJECTED/PARTLY rows carry the one-sentence refusal.
- New canon sheets: `sheets/species/bloom.md` (families, Lostcalls, tide map),
  `sheets/worlds/sector-wonders.md` (wonders, residents, Cull arenas),
  `story/CAMPAIGN-EVENTS.md` (events/objects/Colossi register); adoptions folded into
  `orgs/factions-CANONICAL.md`, `story/NPCs-CANONICAL.md`,
  `story/CONTEMPORARY-HISTORY.md` (§9 three pressures), `story/SIDE-STORIES.md` §12.
- Indexes regenerated (`npm run build:indexes`); index.generated.js diff is my six
  imports plus downstream ordinal renumbering only.
- Tests: `test/w537-interludes.test.mjs` 6/6 PASS (catalog, gating, all-six live-route
  reachability through request→prop→resolve→flag→ledger, staleness roam, abort+retry,
  idempotence); `test/w533-books-0-2.test.mjs` 5/5 PASS (no regression).

## Notes for the reviewer

- missionStoryOps.js / missions.js carry interleaved dirty hunks from devin-w534
  (W-BOOKS-3-4). Only W-CANON hunks are staged — the two import lines, the
  `_stepCampaign47aInterludes` + `_observeCampaign47aInterludeResolved` block, the
  `encounter:resolved` wrapper, and the `_stepCampaign47aInterludes` update call.
  w534's hunks stay dirty for their lane.
- docs/EVENT_ROUTING.md and docs/SYSTEM_REGISTRY.md regenerated against the whole dirty
  tree and describe foreign lanes' in-flight events — left unstaged on purpose; the
  event-routing lane refresh belongs to whoever owns those events.
- Interleave caveat: a live interlude blocks only other interludes, not lane violence;
  `state.encounterDirector.live` is keyed `interlude:<id>`.
