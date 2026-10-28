# Cast, work and place: first binding reconciliation

23 October 2026. Source baseline: public master `bd04be8953aca6aac1630c67457da11f56cf8b2b`.
This is commission 2 of WORLD_BUILD_REQUESTS, routed through existing PQ-032/story and canonical-contact owners. It is not a new identity system or a completed world-binding migration.

## Delivered slice versus outstanding decision

Implemented in this candidate only:
- The existing `contact_rook` card is a **Bounty Broker**, with the already-authored canonical refrain “One name. Two payers.” Rook's work is assigning liability, not a newly invented humanitarian career.
- The existing `contact_kurtz` card presents **the Ashfall Witness**, including its derived uppercase callsign. Creative Direction R6 governs presentation even though the older character sheet retains a superseded working name.
- All contact IDs, station hints, beat comms, branch/ending links, and depth-contact data remain unchanged. No station, faction, mission, reward or save schema is changed.

These are deliberately small presentation repairs, not a claim that the cast now inhabits a reconciled world. The live bar still names the Witness “Kurtz,” and the mission owner still supplies that name. The campaign's Rook operation is still a pod rescue. Those inconsistencies remain explicit.

No proposed scene or relocation below is implemented. Public NOW claims `embodiedMissions.js` for grok-inf50 and `missionLog.js` for claude-beta-oct23; neither is touched. Open PRs #544, #523 and #480 include `barContacts.js`; preserve those writers' work. PR #552 owns the Tethys/Veil staging and rumor changes. No rope work is commissioned here.

## Source authority and reference contract

Creative Direction governs the runtime: divergent lower-layer files are bugs, not equally authoritative variants. Canonical bindings below are the implementation targets. Safe migration and active ownership justify deferring a correction, not accepting the contradiction. Any alternative to an established canonical role, faction or place requires an explicit revision by the canon owner at the higher authority layer first; a runtime comment, this crosswalk or a convenient travel explanation cannot authorize it.

Canonical roles and private motives: `docs/worldbuilding/sheets/characters/{kessler,rook,voss,hale,mira,slate,drift,quinn,kurtz}.md`. Apply `docs/worldbuilding/CREATIVE-DIRECTION.md` R6 over the old Witness sheet's title. These are author-facing motives, not dialogue to have characters confess.

Actual stations/factions: `src/data/sectors.js`.
Docked cast and replies: `src/ui/station/barContacts.js`, especially CANONICAL_CONTACTS, canonicalContactForStation and buildCanonicalReply.
Campaign cards/comms: `src/story/campaign47a/embodiedDialogue.js`.
Campaign operations: `src/story/campaign47a/embodiedMissions.js`.
Durable conversation memory: `src/data/stationContacts.js`; the stationContacts system remains its writer.

The canonical `npc_*` IDs, campaign `contact_*` IDs and bar IDs are different existing namespaces, not interchangeable aliases. The bar constructs `contact_<stationId>_<canonicalKey>`. Moving a contact by changing stationIds changes that memory lookup identity. A display-name correction alone does not migrate or rename an identity.

## Binding crosswalk and desired encounters

### Kessler
- Identity: canonical `npc_kessler`; campaign `contact_kessler`; current bar `contact_station_helios_kessler`.
- Canon: cargo weigher at Tycho Relay, world_tethys, MTS. Runtime bar: Helios Station, `station_helios / sector_helios_prime`, SCN. Card hint: `station_tethys`. Campaign B0/B1 use Kessler; B0's comms explicitly return to Helios.
- Established desire: nineteen years of skim toward a warm Core berth for his daughter. He never tells her. Placing him at an already comfortable Core station dilutes the distance his arithmetic is trying to close.
- Proposed experience: a freight intake where the scale and sealing work are visible, then an unchanged procedural answer when the pilot returns. Keep the private number private; no daughter-rescue quest.
- Smallest next binding decision: bind canonical Tycho to an actual station with a safe B0/B1 handoff. Keeping the contradictory Helios placement would require an explicit higher-layer canon-owner revision first, not an annotation calling the mismatch intentional. Do not silently move him to Tethys and strand accepted work. The parked mass-slip PR is not expanded here.

### Rook
- Identity: `npc_rook`; `contact_rook`; bar `contact_station_coalition_rook`.
- Canon: unaffiliated bounty-tag coordinator at Cinder, world_charon. Runtime bar: Coalition HQ, `station_coalition / sector_helios_prime`, SCN. Card and campaign B2 origin: `station_tethys / sector_tethys_junction`; B2 destination: `station_expanse / sector_charon_expanse`.
- Established desire: turn his private double-bill tally into a pardon, badge and warm Core booth. Coalition placement risks presenting the reward he has not earned as his normal workplace. His first double-tag was Elroy; that is not a new side quest to invent.
- Delivered: role and refrain corrected only. The rescue operation and its rewards remain untouched.
- Proposed experience: the player encounters a competent clerk handling a real posted tag, notices the second payer without receiving an explanation, and later returns with a changed mission record. See the bounded scene below.
- Next decision: bring B2's existing physical rescue implementation into agreement with the canonical double-tag and Cinder booth, through the story owner and a tested migration. Recasting the canonical event instead requires an explicit higher-layer canon-owner revision first. Cinder is not a station ID that can be substituted into the current table.

### Voss
- Identity: `npc_voss`; bar `contact_station_beltout_voss`; no matching base CONTACT_CARDS entry.
- Canon: MTS claim recorder at Hollow, world_pallas. Runtime: Belt Outpost, `station_beltout / sector_ceres_belt`, DMC.
- Established desire: a private map of sealed shafts, believed to contain the fortune hidden behind exhausted-claim filings. Voss does not know what Shaft 7 actually conceals.
- Place meaning: a desk beside a worked face and an unworked face makes “exhausted” contestable. A generic outpost label does not establish Hollow's seals or mining history.
- Smallest proposed scene: retain the existing fields inquiry and point to a verified, already surveyed mining face; on return, contrast the player's actual survey with the clerk's filed description. Use mining/survey facts, not an invented exhausted flag or extra ore reward. First settle Hollow's physical station binding and faction through the existing story/world owners. Do not reveal Shaft 7 through this small encounter.

### Hale
- Identity: `npc_hale`; bar `contact_station_customs_hale`.
- Canon: SCN customs inspector at Gate 3, world_tethys. Runtime: Customs Gate, `station_customs / sector_tethys_junction`, SCN. This is the closest functional match, but “Gate 3” has not been declared an official runtime alias by this patch.
- Established desire: none private. He performs the procedure accurately; no future revelation repairs him.
- Proposed readable context: inspection approach outside, the same initials at the desk inside. Show a fine only when the existing law owner has actually assessed it. The current second-fine line must not become a second charge.
- Next small decision: verify and document Gate 3 → station_customs as a canon-consistent physical binding with the story owner, then make the docked context reflect actual inspection status. No conversion scene.

### Mira
- Identity: `npc_mira`; `contact_mira`; bar `contact_station_tethys_mira`.
- Canon: Quiet sealed-freight handler in Bourse freight annex, world_io. Runtime bar/card: Tethys Trade Hub, `station_tethys / sector_tethys_junction`, MTS.
- Established desire: escape; the sheet's deeper account says the ticket stays bought but unclaimed, and the money is enough. Do not commission fundraising. Her fear that leaving makes her visible keeps her at the relay.
- Place meaning: actual departing freight beside a document that never leaves makes the contradiction perceptible. The Tethys overlook can expose freight movement, but does not prove a Bourse/Quiet binding.
- Proposed next scene after binding: the existing route reply names a real profitable destination, the pilot completes ordinary trade/delivery through existing owners, and a return description leaves her passage unclaimed. This is an optional docked detail, not a second passenger token, ticket purchase or account of off-screen travel.
- Next decision: bind canonical Bourse and Quiet allegiance to a concrete runtime destination before adding that detail. Retaining Tethys/MTS instead requires an explicit higher-layer canon-owner revision, not a runtime justification. Preserve sealed-manifest custody and accepted deliveries.

### Slate
- Identity: `npc_slate`; `contact_slate`; bar `contact_station_forge_slate`.
- Canon: unaffiliated Pit shipyard welder, world_pit. Runtime bar: Forge Foundry, `station_forge / sector_vesta_forge`, DMC. Card and B3 origin: Tethys; the force refit route also names Slate's Tethys yard.
- Established desire: an inventory of failure points, waiting for the one insured hull whose failure pays. He knows the seams, not the complete conspiracy.
- Place meaning: a repair berth, its cut surface and a recurring service craft can express precise competence without announcing sabotage.
- Smallest next decision: identify the actual physical implementation of the canonical Pit shipyard and reconcile the Forge/Tethys references through its owner. Do not declare either divergent station to be the Pit without a canon-consistent binding; an alternate origin requires a higher-layer canon-owner revision. Then attach one double-pass inspection detail to a real completed repair receipt. Do not create spontaneous ship failures, duplicate a welder or change purchased hulls.

### Drift
- Identity: `npc_drift`; bar `contact_station_drift_drift`; no matching base CONTACT_CARDS entry.
- Canon: ore-ledger clerk at Meridian Exchange, world_ceres. The sheet's YAML says DMC while its Notes explicitly say the character works at the MTS-adjacent Exchange, not for DMC. This is an internal source conflict, not permission to pick a convenient faction.
- Runtime: Drift Market, `station_drift / sector_pallas_drift`, MTS.
- Established desire: treat sixteen years of moisture-loss skim as the pension never provided. The principal never decreases. The ledger page turns before the scale settles.
- Proposed next encounter: an actual ore sale and its existing market receipt, followed by the clerk's familiar rounding language. No balance alteration just to dramatize a metaphor.
- Next decision: have the canon owner resolve the sheet's internal faction conflict, then bind canonical Meridian to an actual station. Keeping the conflicting Pallas location requires an explicit higher-layer canon-owner revision first. Never infer that the character owns the similarly named faction or market.

### Quinn
- Identity: `npc_quinn`; two live bar IDs, `contact_station_smuggler_quinn` and `contact_station_sker_quinn`.
- Canon: unaffiliated currency changer at one Outpost 9 bar in Cinder/outer Charon band. Runtime: Smuggler Den, `station_smuggler / sector_pallas_drift`, and Sker Bazaar, `station_sker / sector_sker_haven`; contact faction Quiet, even where the station faction is Reach.
- Established desire: buy the bar, then station, then his name out of the hierarchy. The station is not for sale. His short-count ledger is not a purchasable quest objective.
- Place meaning: one familiar counter and the same hidden drawer make his impossible accumulation legible. Two independent Quinns fragment that continuity.
- Next decision: select the one actual Outpost 9 binding with the story owner and preserve BOTH old conversation records through an explicit conflict policy. Do not delete the less convenient record, sum talk counts for a reward or invent travel between bars.
- Proposed first return detail after consolidation: the stack checked under ordinary light and UV, with the same drawer. The withdrawn currency remains six-year-old history, not a new monetary event.

### The Ashfall Witness
- Identity: `npc_kurtz`; `contact_kurtz`; bar `contact_station_ashcache_kurtz`; canonicalKey `kurtz`.
- Canon: unaffiliated former Concord administrator, off-grid administrative derelict in Ashfall Reach, behind the Iron Maw. Runtime bar/card/B7: Ruined Cache Station, `station_ashcache / sector_ashfall_reach`; bar and station faction Vael.
- Established desire: none active. They count rather than publish, burn or act. They do not request rescue. The twenty-year ledger and eleven-year isolation remain distinct.
- Delivered: campaign card title/callsign only. Proposed owner-coordinated follow-through: change only bar name to “the Ashfall Witness”; keep all desk choice IDs and UI intents. Then reconcile campaign contactName and other visible ledger titles in their owners' files. Do not blanket-rename internal Kurtz event keys.
- Next place decision: explain the administrative derelict's relationship to the Vael cache without recasting the Witness as Vael or treating Vael faction labels as proof of their personal allegiance. Arrival should get quieter, not busier; the desk remains an optional encounter with a possible future self, not a rescue broker.

### Veil place boundary
Research Station Veil is `station_veil / sector_veil_nebula`, Free Frontier. It is not silently renamed into canonical Vael hospitality. Sori's DMC assay, Suhl's interpretation and Venn's courier identity remain separate. Commission 3 composes the existing research edge; a hospitable Vael destination needs its own actual place/faction decision under commission 2. The Witness's current Vael station assignment does not solve that gap.

## One connected playable next scene: Rook's posted tag

PROPOSAL, not implemented, and deliberately not a new rescue/tow mechanic.

Use the already reachable Coalition bar and its current bounty reply only as a transitional test seam while canonical Cinder's physical binding and migration are prepared. Coalition is an acknowledged runtime bug, not an accepted alternate home. This scene proposal neither grants canon acceptance nor removes the obligation to deliver the canon-correct booth; its presentation and receipt logic should follow that corrected binding. The player meets Rook at work, asks about bounties, receives the **actual** bounty_hunt or patrol_clear entry already selected from that station's mission board, and uses the existing Accept + Track readiness/acceptance route.

At first contact, the player sees a second signature below the posted payout line: a docked presentation of the established stylus tell, not a forged second payable contract. Do not name another ecology member. An empty board keeps the existing “No open tag I like” response, never spawning a replacement for narrative convenience.

The player leaves to perform that real contract through the mission owner. On returning, Rook's short line may acknowledge only that exact accepted/completed mission ID, not proximity, elapsed time, a kill of an unrelated target or merely having seen the offer. His line should concern the receipt, not confess his pardon fantasy. A still-active or failed contract keeps its real status. A completion does not pay twice, change reputation twice, alter Elroy, or advance B2.

Implementation seam: existing buildCanonicalReply and live bar offer acceptance, existing missions state/completion evidence, and stationContacts as sole durable conversation writer. Before coding the return line, verify the mission owner retains a stable completed ID on Continue. If not, defer the acknowledgment until that owner can expose a bounded existing receipt; do not invent a separate narrative-completion boolean. No author-facing wish becomes player omniscience.

Acceptance: empty-board case; blocked readiness; accepted versus merely previewed offer; actual completion versus unrelated completion; Save/Continue with the same receipt; repeated talk without repeat payment; native dock/undock access. This modest scene makes Rook's current work coherent while leaving the larger origin/place ruling open.

## Save/reference migration contract for later binding work

This slice needs no migration: only four derived presentation fields differ. Existing IDs and station hints are pinned by tests. The current bar ID construction explains why relocation is a different operation.

Before any later move, inventory the old station-keyed IDs and their stored met/talkCount/standing/flags, plus accepted mission issuer/destination references. Choose one destination and one identity per character; retain old lookup compatibility long enough to load existing saves. Quinn requires an explicit two-record merge/conflict rule, not an assumed maximum or sum. Do not change accepted mission destinations or grant progress because a new station label matches canon.

Migration acceptance must cover pre-contact, met, accepted, completed and Continue states, and preserve ending/evidence custody. Canonical source IDs must not replace live IDs wholesale. A version bump with no tested state transform is not a migration.

## Verification and limits

The focused existing embodied-dialogue test runs against an exact public-source dependency closure, not the old dirty checkout. New assertions pin Rook's role/refrain, the Witness name/callsign, station hints, unique identity and existing B7/C/D links. Both corrected assertions reject the unchanged public baseline.

A separate full exported-card comparison confirms only contact_rook.roleLabel, contact_rook.blurb, contact_kurtz.name and contact_kurtz.callsign change; all beat comms and depth cards remain identical. No aggregate, anvil, native game, browser, visual, migration or full-save acceptance is claimed. The scene and place decisions above remain proposals.
