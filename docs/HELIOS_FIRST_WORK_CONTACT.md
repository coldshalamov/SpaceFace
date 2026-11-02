# Helios: let Kessler put the first real ticket in front of the pilot

## Arrival and readable work

The opening already has two parallel structures: Campaign 47-A and the active
starter hull's local work book. The current Helios board owner injects the next
Hitch, Pelican or Wasp starter ticket, with its authored worksite brief and fit
requirement. Kessler's existing conversation, however, had no local-work question
or reply. A real available first activity was disconnected from the character at
the desk.

The new local-work question is available in the docked Helios context. Kessler
reads the current active hull, required tool, canonical settlement counter and
already-posted board row. Missing fit gets the actual tool name. An open local
ticket points back to the Mission Log rather than offering a duplicate, including
when the player has switched hulls. Settled work is acknowledged from the per-hull
counter, not inferred from an objective meter. A finished three-ticket book does
not restart or pretend to unlock the campaign.

For one valid current posting, the reply repeats its actual title and brief and
passes that same object to the existing bar mission-offer card. The existing
Accept + Track control remains the player's explicit commitment. Merely asking
creates, accepts, tracks, settles or pays nothing. The concurrent 47-A tutorial
and story state remain untouched. Local work is an option, not a fabricated
campaign prerequisite.

## Place, character and consequence

This uses the existing Helios station, Kessler contact, Bar and Contracts surfaces.
No NPC, ship, room, icon or model is created. Hitch's supply work, Pelican's lane
hardware and Wasp's marked runners keep the meanings and physical requirements
already authored in their ticket briefs. The new interaction makes those purposes
readable at their existing point of contact.

Kessler's memory is deliberately bounded: a settled local-ticket entry is not a
claim that every berth or lane has been permanently rebuilt. The mission owners
still govern actual work, failure, payment and later postings. The dialogue's
missing/ambiguous-board response sends the player to Contracts instead of
synthesizing a convincing but nonexistent job. It refuses duplicate or mismatched
rows, corrupt out-of-book progress, unrelated hulls and stale off-dock requests.

The composed Kessler list keeps ordinary questions and the existing weight-slip
interaction, with Dismiss after the available actions. Weight-slip reply precedence
is unchanged. This is a small conversational route through current game objects,
not another mission system.

## Source and evidence

Source paths are `src/ui/station/starterWorkdayConversation.js` and the narrow
choice/reply wiring in `src/ui/station/barContacts.js`. The helper reads existing
`src/data/starterJobs.js` functions; it has no bus, registry writer or save hook.
The existing bar renderer and mission-lane acceptance handler consume missionOffer.

Artifacts derive from exact master `38be387369b0971e62ae42a24bba2e8cf8a10544`;
relevant source/UI/preload blobs were checked again at
`75f04f69676b032174883db54937b0ad3badc28b` without changes. Shared PR724 files were
not overwritten. The source-only patch and original hashes are preserved for
reconciliation rather than wholesale replacement of newer remote work.

Focused checks exercise all nine hull/step combinations from the production board
injector, plus choices/replies, fit and counter boundaries, current posting identity,
non-mutation and the existing offer-card acceptance seam. Extracted production
functions use explicit dependency ports; this is not an ordinary-input docking or
full browser route. No rendered dialogue, full Save/Continue or visual-budget
acceptance follows solely from these tests. New-helper loading stays within the
existing lazy station-screen closure; no eager root or index edit is introduced.

## Still open

SF-WORLD-DIRECTION, SF-SECTOR-COHERENCE, SF-LIVING-WORLD and SF-GAME remain open.
The immediate player-route check is fresh Helios arrival → Kessler → current ticket
→ explicit Accept + Track → physical work → return and counter acknowledgement.
Missing or stale board state must stay honest throughout. Current art is reused;
SF-ASSETBANK/SF-ASSET-QUALITY remain review/integration responsibilities, with model
production owned by local agents. Other PR724 and Ceres work remains separately
preserved with its acceptance gaps, not silently accepted or discarded here.

### Proof boundary and first-dock lifecycle

Current mission-owner source handles `dock:docked` by ensuring the station board,
which injects the Helios starter ticket synchronously. This is not a Contracts-tab-
only dependency. That source ordering supports the first-contact design; it is not
a claim that browser/worker arrival timing has been exercised here. The reply still
handles unavailable board state honestly rather than writing a posting itself.

All 19 focused source-seam tests and syntax checks pass, including Dismiss-last
composition. A separate smoke imports the exact helper with the real game-state
factory and verifies repeated read-only offer identity and unchanged mission,
story and tracking state. Full exact `barContacts` ESM execution remains unproven
locally because the sparse artifact/runtime lacks existing localization modules.
Those imports belong to preserved newer upstream regular-patron behavior, not this
new helper. No localization stub or production fallback was added to make a test pass.

The current bar file retains newer regular-patron/localization logic absent from
the original branch base. The original base file is recorded separately for patch
restoration; newer owner work is retained, not credited as this increment's work.
