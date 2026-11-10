# M-01 catalog — 47-A campaign chain

Surface: `src/story/campaign47a/` sidecar (campaignData, embodiedDialogue, embodiedMissions,
storySpine, campaignReceipts, index) + `src/data/contactDeedMemory.js`,
`src/data/stationContacts.js`. Registered writers: `systems/missions.js` owns
beatIndex/branch/rewards; `systems/story.js` is presentation authority.

## What already exists

- 8 embodied beats B0–B7, each with physical verbs, two-solution set pieces, branch chain
  (traders/patrol/free), endgame choices A–E, and `campaign47a:*` receipts.
- `embodiedDialogue.js`: 15 DEPTH_PROGRAM_CONTACTS (pinned by `pq-150-03`), 9+ plain
  CONTACT_CARDS, BEAT_COMMS (one primary + one failure_recovery per beat, ≤12 words),
  WITNESS_SEAM_GREETINGS for Dorin (`dorin.trust`) and Kell (`kell.cover`).
- `contactDeedMemory.js`: CONTACT_DEED_LINES for all 15 trackers — `empty` (0),
  `remembered` (>0), and one SHARED negative-band fallback line.
- `storySpine.js` GREETING map: spine-derived callback blurbs for 13 contacts; Dorin/Kell
  ride the witness seam. `adjustBoardOffer` stamps open-miss onto offers.
- `embodiedMissions.js`: board offers with `params` (physicalVerb, completionMethods,
  authoredSetPieceId, scanLabel 'EVIDENCE CORE'), reckoning callbacks (foreign hunk,
  ~L380-407 — preserved).

## Writable seams found

- `CONTACT_DEED_LINES` records are `(name, empty, remembered)` — the negative band shares
  one generic line for all 15 contacts. Per-contact `strained` lines are the open seam:
  the counter bands already exist, only the prose is missing.
- BEAT_COMMS is saturated (all variants/choices present); adding rows doubles popups — skip.
- CONTACT_CARDS count is test-pinned — no new contacts.
- `stationHints`/`gate` fields on depth cards are schema-complete.

## Foreign hunks to preserve

`embodiedMissions.js` (reckoning callbacks + `options.state`), `starterJobs.js` scarred-ram
logic elsewhere. Do not touch DEPTH_PROGRAM_CONTACTS (15-pin) or the witness-seam pair.

Review: catalog ✓3 (Drifter / Archivist / Accountant) — recorded.
