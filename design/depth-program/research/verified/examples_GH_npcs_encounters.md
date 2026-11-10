# SpaceFace Creative-Concept Pool — Categories G & H

> **Purpose:** a creative-concept pool, not a spec. Each entry below is a candidate the director /
> story teams can pick from, adapt, or reject. Two categories:
> - **G — Named NPCs & Contacts** (15 slots × 5 candidates = 75)
> - **H — Chance Encounter Templates** (8 slots × 5 candidates = 40)
>
> **Source-grounding.** All entries honor:
> - The `card(id, name, roleLabel, stationHint, blurb, namedCaptainId)` shape from
>   `src/story/campaign47a/embodiedDialogue.js`, including the **12-word blurb limit**
>   (`MAX_CONTACT_BLURB_WORDS = 12`) and the 12-word comms spirit (`MAX_COMMS_WORDS = 12`).
> - The 8 faction voice registers documented in `src/data/barks.js`
>   (`faction_scn` Concord bureaucratic · `faction_mts` Meridian mercantile · `faction_dmc` Drift
>   blue-collar · `faction_reach` Reach predatory bravado · `faction_quiet` Quiet terse ·
>   `faction_choir` Choir zealot ritual · `faction_free` Frontier plainspoken · `faction_vael`
>   Vael alien clause-language).
> - The encounter-shape schema in `src/data/encounters.js`
>   (`tier / deck / weight / zoneTypes / script / pressureCost / cooldownS / gates / proximity /
>   squad / bark / choices / timeoutChoice`) and its receipts discipline (short, factual,
>   never overclaim).
> - The named-ace / named-captain pattern in `src/data/namedAces.js` and `NAMED_CAPTAINS`
>   (escalation by COMPOSITION, never +HP%; gimmick = an existing gameplay verb).
> - Real station IDs cited from `src/data/sectorAnchors.js` / `src/data/sectors.js` /
>   `src/data/frontierRegions/*` — every stationHint is a real id present in those files.
>
> **Two depth lessons applied throughout** (from the verified research extracts):
> - **Rebel Galaxy — "named characters are depth that costs words, not polygons."** A focused
>   roster of NPCs with a voice, a role, and a quest hook carries more perceived depth than an
>   extra ship class. We write the personality in; the systems already render it.
> - **Naev — "self-registering dynamic content + faction-partitioned event trees."** Each
>   encounter template below declares its own trigger metadata (sector type, faction space, rep
>   gate, random) the way Naev's Lua files embed an XML manifest in a comment header. The
>   `encounterDirector` + `encounterScripts` host should be able to spawn any of these by reading
>   the `Trigger` field alone — no central registry edit.

---

# CATEGORY G — NAMED NPCs & CONTACTS (15 slots × 5 = 75 concepts)

SpaceFace currently ships **10 contacts + 3 named captains + 3 aces** (see `embodiedDialogue.js`
`CONTACT_CARDS`, `encounters.js` `NAMED_CAPTAINS`, `namedAces.js` `CORE_ROSTER`). Rebel Galaxy's
lesson is explicit: write the named character, let existing systems render them. Each slot below
specifies a ROLE; the 5 candidates per slot are genuinely different people who could fill it.

Every NPC candidate carries: **Name** (with callsign where apt), **Role label**, **Station**
(real id cited), **Blurb** (≤12 words, in voice), **Backstory** (2-3 sentences), **Quest/faction
hook** (mission giver? rep gate? story branch?), **Voice register** (which of the 8 barks voices).

---

## Slot G1 — Fixer / Black-Market Broker (Quiet-aligned)

The Quiet's register (from `barks.js`): terse, minimal, says as little as possible — "Seen."
"The hold. Now." A broker in this voice sells information by the syllable.

### G1-a — "Halfword" Pell
- **Role label:** Routing Clerk (Quiet)
- **Station:** `station_smuggler` (Smuggler Den, Pallas Drift)
- **Blurb:** "Routes change. I sell the next one. Twice." *(7 words)*
- **Backstory:** Pell was a Concord traffic controller who erased one transponder too many and
  was quietly retired into the Quiet's logistics arm. She remembers every ship that ever paid
  her, and every ship that didn't. She sells lane-safety intel the way a clerk stamps a form.
- **Quest/faction hook:** Repeatable "safe route" broker — pays the player to run Quiet cargo on
  a gated lane; rep gate (Quiet ≥ neutral) to unlock. Refusing three in a row silently closes her.
- **Voice register:** faction_quiet — one-line sentences, no pleasantries, never repeats a route.

### G1-b — Mother Vesh
- **Role label:** Booth Keeper (Quiet)
- **Station:** `station_sker` (Sker Bazaar, Sker Haven)
- **Blurb:** "Air for sale. Origin unspecified. You buy." *(7 words)*
- **Backstory:** Vesh runs the breathable-air booth referenced in the ambient comms
  (`amb_sec6_air`). She is old enough to remember the Pit's atmo debt being filed. She treats
  anonymity as a currency and never asks where cargo came from, only where it's going.
- **Quest/faction hook:** Black-market commodity fence + the through-line quest "Origin
  Unspecified" — a chain that traces a canister of air back to the Pit, paying out in Quiet rep
  and unlocking the endgame Choice B hint early.
- **Voice register:** faction_quiet — even terser than Pell; noun phrases, no verbs where avoidable.

### G1-c — Tessik "No-Trace"
- **Role label:** Wreck Broker (Quiet)
- **Station:** `station_orcus_shadow` (Shadow Vault station, frontier west)
- **Blurb:** "Wrecks pay twice. Once in salvage, once in silence." *(9 words)*
- **Backstory:** Tessik buys derelicts no Concord surveyor will touch and sells the black boxes
  back to whoever the dead crew was running from. He has a scar across his throat from the one
  time he talked to the wrong buyer. He doesn't talk much now.
- **Quest/faction hook:** Salvage-fence mission giver — buys Category-D wreck loot at premium,
  but each sale quietly raises a `quiet.heat` flag that eventually triggers a Concord audit
  encounter (H5). Moral cost baked into the payout.
- **Voice register:** faction_quiet — vocal-cord-damaged rasp implied; shortest lines in the pool.

### G1-d — Clerk Yune
- **Role label:** Sealed-Evidence Broker (Quiet)
- **Station:** `station_nyx_march` (Nyx Fence, frontier west)
- **Blurb:** "Sealed files open for a fee. Then re-seal." *(8 words)*
- **Backstory:** Yune worked the same Concord records office that filed Incident 7741 (the
  Tessera). She knows REF 44-C from the inside. She sells the un-sealing of inconvenient records
  and is the only NPC who will speak the player's ship registration aloud without flinching.
- **Quest/faction hook:** Story-branch NPC — for a steep fee she reveals that Contract 47-A's
  payment was never going to clear, seeding the endgame Choice C (wormhole) path. Rep gate:
  Quiet friendly AND ≥ B6 story beat.
- **Voice register:** faction_quiet layered with faction_scn bureaucratic residue — she still
  cites ref codes, but whispers them.

### G1-e — "Latchkey" Orin
- **Role label:** Smuggling Architect (Quiet)
- **Station:** `station_eris_margin` (Margin Fence, frontier)
- **Blurb:** "Every lock has a shape. I file keys." *(8 words)*
- **Backstory:** Orin designs the physical contraband hides that let haulers survive Concord
  scans. Former shipyard welder (knew Slate at the Pit). He retired to the frontier when a hide
  design of his got a crew killed — the Tessera's previous crew.
- **Quest/faction hook:** Upgrade hook — sells a contraband-hold module that raises the
  `patrol_scan` bribe success rate. Side quest "The Welder Who Knew" ties him to Slate and to the
  gang graffiti thread; completing it changes his dialogue to reference the dead crew by name.
- **Voice register:** faction_quiet with one faction_dmc telling detail (he still calls shifts
  "cycles," miner-style).

---

## Slot G2 — Rival Pilot (recurring, has memory of the player)

The pattern to match: `namedAces.js` CORE_ROSTER — a named ace with `gimmickTag`, a
`returnArchetype`, a `signatureBark`, and `aceMemory` persistence (return tier, escapes, kills,
lastSeenSector). The rival remembers the player across encounters.

### G2-a — "Coldburn" Rey
- **Role label:** Named Rival (Free Frontier)
- **Station:** Roams; first encountered near `station_reach` (Io Reach)
- **Blurb:** "You took that lane. I remember which one." *(8 words)*
- **Backstory:** Rey is an independent hauler who lost a contract to the player early (B1/B2
  beat) and has nursed it into a vendetta. He's not a pirate — he's a competitor who shoots. His
  gimmick is **intercept**: he cuts the player's lane rather than ambushing from a belt.
- **Quest/faction hook:** Recurring minor combat encounter across multiple sectors; each escape
  raises his tier (escort +1, never +HP% — per the named-ace escalation rule). On the third
  defeat he surrenders, becomes a reluctant ally, and unlocks a co-op convoy mission.
- **Voice register:** faction_free — plainspoken, "no hard feelings but I'm shooting now" — but
  personal; the only NPC who addresses the player by ship name.

### G2-b — Skipjack Marn
- **Role label:** Named Rival (Reach)
- **Station:** Roams outlaw sectors; base at `station_sker` (Sker Bazaar)
- **Blurb:** "Same cargo, faster hull. Race you for it." *(8 words)*
- **Backstory:** Marn is a Reach-affiliated racing-pirate who treats cargo theft as a
  competition. Her gimmick is **tether-cut**: she grapples cargo pods mid-transit and bolts. She
  remembers every hauler she's beaten and every one she hasn't.
- **Quest/faction hook:** A "salvage race" encounter — both player and Marn sprint for a
  time-limited cache; winner takes all. Beating her three times flips her to neutral and opens a
  Reach rep line. Losing three times sets a `marn.dominance` flag that makes Reach tolls higher.
- **Voice register:** faction_reach — bravado over hardware, but cheerful, not cruel; she's
  having fun.

### G2-c — Halver Goss
- **Role label:** Named Rival (Concord deserter)
- **Station:** Roams; first seen fleeing `station_coalition` (Coalition HQ, Helios Prime)
- **Blurb:** "We were on the same patrol. Once." *(7 words)*
- **Backstory:** Goss is a former Concord wingman who went privateer after refusing an order
  (the order is a story reveal — it involved firing on a civilian hauler). He hunts the player
  specifically because the player's clean Concord record disgusts him. Gimmick: **doctrine
  mimic** — he flies the player's own combat doctrine back at them.
- **Quest/faction hook:** Major combat encounter; defeating him drops a black box that, when
  sold to Yune (G1-d), begins a Concord-atrocity story branch (ties to H5 faction-secret).
  Sparing him (comms choice after he surrenders) unlocks him as a wingman for the endgame.
- **Voice register:** faction_scn bureaucratic cadence corrupted into bitterness — still cites
  regs, but to mock them.

### G2-d — "Echo" Tann
- **Role label:** Named Rival (Vael-touched)
- **Station:** Roams anomaly sectors; anchored to `station_veil` (Research Station Veil)
- **Blurb:** "Clause-bound. You are in my ledger now." *(7 words)*
- **Backstory:** Tann is a human pilot who spent too long in Vael space and now speaks in their
  clause-language, claiming to hold a "contract" on the player's wake. Whether the Vael actually
  retained him or he's broken is left ambiguous. Gimmick: **drift-lock** — he matches the
  player's vector exactly, mirror-flying.
- **Quest/faction hook:** Encounters escalate the longer the player stays in anomaly sectors;
  defeating him requires breaking the mirror (a tether or scan, not guns). Resolution opens a
  Vael-rep line and a first-contact hint toward the Category-A1 alien vessel (H2).
- **Voice register:** faction_vael — clause-numbered, alien contract-language, but with human
  stutters that betray the original voice underneath.

### G2-e — Cinder Jo
- **Role label:** Named Rival (bounty hunter, Quiet-adjacent)
- **Station:** Roams; posts from `station_rhea_cinder` (Cinder Claim, frontier)
- **Blurb:** "Board paid. Nothing personal. Then it got personal." *(8 words)*
- **Backstory:** Jo is a bounty hunter who took a contract on the player, lost, and kept coming
  back — at first for the money, then because the player embarrassed her. Her gimmick is
  **long-range laser snare**: she tags from outside tether range and closes only to confirm.
  She is the hunter-ace complement to the existing `cap_sable_iask` (also a sniper, but
  Reach-factioned; Jo is independent).
- **Quest/faction hook:** Standard named-ace loop (return tier, escalation) with a twist: on
  the fourth encounter she offers to call it off if the player helps her kill the broker who
  posted the original bounty. That mission branches — accept (Jo becomes ally, Quiet rep down)
  or refuse (Jo becomes permanent recurring hostile).
- **Voice register:** faction_quiet terse core + one faction_free plainspoken line when she
  drops the contract pose.

---

## Slot G3 — Scientist Studying the Vael (research-station contact)

`station_veil` (Research Station Veil, Veil Nebula) is the obvious anchor — a `research`-type
station in an anomaly-palette sector. Vael-study NPCs bridge the `anomaly_whisper` encounter and
the Vael faction voice.

### G3-a — Dr. Iren Suhl
- **Role label:** Xenolinguist (Free Frontier)
- **Station:** `station_veil` (Research Station Veil, Veil Nebula)
- **Blurb:** "The clauses answer back. I keep the transcripts." *(8 words)*
- **Backstory:** Suhl has spent nine years decoding Vael contract-language and has reached the
  unsettling conclusion that the Vael are not speaking to humans so much as *transcribing* them.
  She is calm, methodical, and mildly haunted. She pays for Vael artifacts the way a university
  pays for field samples.
- **Quest/faction hook:** Mission giver for Category-A5 precursor-archive and Category-A1
  alien-vessel content — each Vael artifact delivered unlocks one decoded "clause" of world
  lore. Completing the set opens the H8 anomaly-drift encounter as a repeatable.
- **Voice register:** faction_free plainspoken base, but she quotes Vael clauses verbatim
  (faction_vael intrusions) when discussing her work.

### G3-b — Prof. Maren Doss
- **Role label:** Anomaly Physicist (Concord-civilian)
- **Station:** `station_haumea_rift` (Rift Observatory, frontier)
- **Blurb:** "The wormhole flickers on a schedule. We missed it." *(8 words)*
- **Backstory:** Doss is a Concord-funded physicist who discovered that the Veil Nebula
  wormhole (gated by `tech_long_range_survey`) has a periodicity — and that someone has been
  using it on schedule for decades. She is being quietly defunded. She is frightened of her own
  data.
- **Quest/faction hook:** Story-mission giver — "The Schedule" chain requires the player to
  observe the wormhole across three visits, then deliver her dataset to either Concord (Vale,
  Choice A) or the Quiet (Choice B). The choice pre-loads the endgame.
- **Voice register:** faction_scn bureaucratic precision corrupted into obsessive academic —
  she can't stop citing dataset refs.

### G3-c — Yael, "The Listener"
- **Role label:** Field Acoustician (Drift Collective)
- **Station:** `station_veil` (Research Station Veil) — seconded from the Collective
- **Blurb:** "Whispers have mass. I record the weight." *(7 words)*
- **Backstory:** Yael treats the `anomaly_whisper` CHN UNKNOWN lines as literal audio phenomena
  and has been recording them for years. She believes the whispers are not speech but *echoes*
  of ships that haven't arrived yet. She is the only NPC who treats the player's hull as a
  tuning fork.
- **Quest/faction hook:** Scan-tech mission giver — pays for deep-anomaly scans; each completed
  scan adds a new `WHISPER_LINE` to the pool and raises the `anomaly_whisper` encounter weight
  slightly. Repeatable, low-stakes, high-atmosphere.
- **Voice register:** faction_dmc blue-collar fatigue — she's a shift worker, her shift just
  happens to be listening to the void.

### G3-d — Dr. Olem Vey
- **Role label:** Vael-Biology Researcher (Concord-civilian)
- **Station:** `station_proteus` (Proteus Den, frontier) — field station
- **Blurb:** "Their hulls heal. Ours don't. Yet." *(6 words)*
- **Backstory:** Vey studies Vael vessel regrowth and is quietly trying to apply it to human
  hulls — an unpopular line of research that has made Concord administration nervous and the
  Choir very interested. He is excitable, ethical, and about to be shut down.
- **Quest/faction hook:** Upgrade hook — completing his research chain unlocks a slow-hull-regen
  module. The final mission forces a choice: hand the research to Concord (Vale, safe payout),
  the Choir (they revere it, faction_choir rep up massively), or destroy it (Quiet approves).
- **Voice register:** faction_scn procedural citations over faction_free enthusiasm — a
  researcher who still believes in the paperwork.

### G3-e — Sister Lha
- **Role label:** Choir Naturalist (Ascendant Choir)
- **Station:** `station_phoebe_echo` (Echo Shrine, frontier)
- **Blurb:** "The Vael sing the Pattern's bass note. Listen." *(8 words)*
- **Backstory:** Lha is a Choir scholar who believes the Vael are not aliens but an earlier
  verse of the same Pattern the Choir worships. She is serene, courteous, and absolutely
  certain of something the player cannot verify. She treats Vael encounters as religious events.
- **Quest/faction hook:** faction_choir rep gate and mission giver — her quests send the player
  into Vael space to "observe, not engage." Completing her line unlocks the Choir as a
  recruitable faction and changes the `anomaly_whisper` lines to Choir-cadence variants.
- **Voice register:** faction_choir — ritual cadence, "the Pattern," "ascent"; she speaks of
  the Vael the way a cantor speaks of a hymn.

---

## Slot G4 — Disillusioned Concord Officer (story-moral-hook NPC)

Concord's register: procedural, bureaucratic, cites REF codes, bloodless. A disillusioned
officer still sounds like Concord — the disillusion IS the tell.

### G4-a — Lt. Hale (the customs filer — canonical)
- **Role label:** Customs Officer, RET 44-C (Concord)
- **Station:** `station_customs` (Customs Gate, Tethys Junction)
- **Blurb:** "I file the second fine. I always file it." *(8 words)*
- **Backstory:** Hale is the canonical customs officer from `narrative.js` FIGURES — the filer
  of REF 44-C, the second fine, the suppressed evidence. He has filed it so many times he no
  longer reads what he's suppressing. The disillusion is that he knows it, and files it anyway.
- **Quest/faction hook:** Story-moral NPC — the player can befriend him (small courtesies
  across visits), at which point he quietly offers to *not* file one specific fine. Accepting
  is a Choice-A-path moral stain; refusing is a Choice-C-path clean hand. His dialogue changes
  based on player's cumulative `hale.trust` flag.
- **Voice register:** faction_scn — pure bureaucratic; the horror is that there's no change in
  his voice whether he's filing a parking tag or an atrocity.

### G4-b — Cmdr. Reva Voss
- **Role label:** Retired Patrol Commander (Concord)
- **Station:** `station_drift` (Drift Market, Pallas Drift) — drinking at the bar
- **Blurb:** "I enforced the corridor. The corridor was wrong." *(7 words)*
- **Backstory:** Voss ran the patrol corridor out of Tethys for fifteen years. She resigned
  after an order to look the other way on a convoy that was carrying "administrative records"
  (the B5 chain-dest cargo). She drinks at the Drift Market and will not go home to Helios. She
  is the Voss referenced obliquely in `amb_drift_claims` comms.
- **Quest/faction hook:** Witness NPC for the Choice C/D endgame paths — she's the only person
  who will confirm, off the record, that the corridor order came from Vale Holdings. Seeking her
  out is optional; doing so unlocks a fifth endgame epilogue card.
- **Voice register:** faction_scn cadence broken by faction_dmc tiredness — she still says
  "copy" and "acknowledged" to the bartender.

### G4-c — Warrant Orrin
- **Role label:** Inspector General (Concord) — still serving
- **Station:** `station_coalition` (Coalition HQ, Helios Prime)
- **Blurb:** "The audit is clean. The audit is always clean." *(8 words)*
- **Backstory:** Orrin is the internal-affairs officer who has opened seventeen investigations
  into Director Vale and closed seventeen investigations into Director Vale. He is not corrupt;
  he is defeated. He believes the system works and cannot explain his own case files. He will
  become the player's ally only if the player brings him evidence he cannot shred.
- **Quest/faction hook:** Evidence-chain mission giver — the player collects sealed records
  (Yune G1-d, Tessik G1-c, wreck black boxes) and delivers them to Orrin, building an
  `orrin.case` counter. At case ≥ 5, Orrin offers a Choice-A-adjacent branch: become his
  witness inside the service. The cleanest Concord-aligned ending, but it costs the player their
  Quiet rep entirely.
- **Voice register:** faction_scn — but with longer pauses; the bureaucrat who has started to
  hear his own ref codes.

### G4-d — Sgt. Linn Orav
- **Role label:** Defector, Patrol Wing (Concord → Free Frontier)
- **Station:** `station_reach` (Reach Station, Io Reach) — in exile
- **Blurb:** "I followed orders. The orders followed me back." *(8 words)*
- **Backstory:** Orav defected after being ordered to disable a civilian drive in the contested
  corridor (the same corridor referenced in the `trap_distress` comms). She now flies Frontier
  escort and is hunted by Concord. She is angry, not sad. She wants the player to understand
  that the order was *legal*.
- **Quest/faction hook:** Wingman-hire NPC (Free Frontier) and the moral inverse of Orrin —
  hiring her raises faction_free rep but tanks faction_scn. Her side mission is to recover the
  black box of the ship she was ordered to disable, which ties directly into the H5
  faction-secret witness encounter.
- **Voice register:** faction_scn procedural structure filled with faction_free plainspoken
  fury — she still files her sentences like reports.

### G4-e — Director Vale (canonical — the moral counterweight)
- **Role label:** Sector Administrator (Concord) — antagonist
- **Station:** `station_helios` (Helios Station) — admin wing
- **Blurb:** "Good work. Keep it clean." *(5 words — the canonical line)*
- **Backstory:** Vale is already canonical (`narrative.js` FIGURES, the B7 "story_vale_goodwork"
  line). This concept formalizes her as a recurring contact across B3-B7, not just a popup.
  Every interaction is courteous, every transaction is clean, and every one advances the
  player's complicity. She is the moral-hook NPC the player cannot refuse because she is always
  polite and always right on paper.
- **Quest/faction hook:** The spine itself — she is the administrator who signs every contract
  the player takes. Meeting her in person (B4 clearing) is the first time the player sees the
  common denominator of all three branch contracts. Her single direct line fires at B7
  jump-charge regardless of choice.
- **Voice register:** faction_scn — flawless, warm, procedural; the most frightening voice in
  the game because nothing in it is wrong.

---

## Slot G5 — Pirate Kingpin (Reach — quest giver for the criminal path)

Reach's register: predatory but under-armed, bravado over hardware — "We eat ships like yours
for the scrap." A kingpin is Reach's voice turned organizational.

### G5-a — Boss Sker Vane
- **Role label:** Reach Kingpin (Reach)
- **Station:** `station_sker` (Sker Bazaar, Sker Haven) — the repGated station
- **Blurb:** "My lane. My toll. My cut of your apology." *(8 words)*
- **Backstory:** Vane runs the Sker Bazaar and the Reach syndicate behind it. He inherited the
  lane from a captain the player's old crew (the Tessera gang) once ran cargo for. He knows the
  hull. He has decided to be amused rather than vengeful — for now. He is the criminal-path
  quest giver, and his quests always pay well and always cost something off-ledger.
- **Quest/faction hook:** Criminal faction arc — his mission chain (toll enforcement, convoy
  raid, rival-pirate assassination) raises Reach rep and unlocks the Sker Bazaar services at
  full. The final mission reveals he has a file on the Tessera's previous crew; turning the
  file over to Orrin (G4-c) flips Vane permanently hostile.
- **Voice register:** faction_reach — bravado, but measured; the kingpin is the Reach voice
  with patience.

### G5-b — "Red Ledger" Cal
- **Role label:** Toll Architect (Reach)
- **Station:** `station_kepler_scar` (Scar Bazaar, frontier)
- **Blurb:** "Every lane has a price. I set the decimal." *(8 words)*
- **Backstory:** Cal is theReach's pricing mind — the one who decides which tolls are tolls and
  which are robberies. He treats the lanes as a market and the haulers as inventory. He is
  sociable, numerical, and entirely without loyalty. He will sell the player's schedule to a
  bounty hunter if the math favors it.
- **Quest/faction hook:** Criminal-path broker for the `pirate_toll` and `ambush_snare`
  encounters — taking his missions raises the spawn weight of those encounters in the player's
  favor (the player gets a cut). Betraying him (selling his ledger to Meridian) unlocks a
  faction_mts branch instead.
- **Voice register:** faction_reach bravado cross-bred with faction_mts mercantile — he talks
  tolls like a Syndicate broker with a knife.

### G5-c — Matriarch Kett
- **Role label:** Smuggling Fleet Owner (Reach)
- **Station:** `station_eunomia` (Eunomia Fence, frontier)
- **Blurb:** "Cargo moves. I own the trucks. Drive." *(7 words)*
- **Backstory:** Kett runs the Reach's logistics arm — a mirror of the Quiet, but louder. She
  employs dozens of small crews and treats them as disposable. She respects the player because
  the player survived the Tessera; she would still sell the player if the price covered the
  funeral. She is the Reach's answer to Mother Vesh (G1-b).
- **Quest/faction hook:** Convoy-raid and convoy-guard mission giver — the only NPC who offers
  BOTH sides (raid Meridian convoys OR guard Reach convoys), branching on rep. Completing her
  chain unlocks a Reach-faction ship paint job and a unique escort archetype ("kett_runner").
- **Voice register:** faction_reach — imperious, treats the player as hired help; "Drive." is a
  complete sentence to her.

### G5-d — "Soft" Pellin (the reluctant kingpin)
- **Role label:** Inherited Boss (Reach, unwilling)
- **Station:** `station_orcus_shadow` (Shadow Vault station, frontier)
- **Blurb:** "I didn't want the title. The title wanted me." *(8 words)*
- **Backstory:** Pellin inherited the Orcus Shadow crew when the previous boss died in a way
  Pellin engineered but did not intend. He is competent, guilty, and looking for a way out that
  doesn't involve dying. He is the moral-choice criminal — the player can help him retire
  (Quiet rep up, Reach rep down) or cement his grip (the reverse).
- **Quest/faction hook:** Branch mission giver — his arc is a criminal-path exit door. Helping
  him retire opens a unique "witness relocation" mission that seeds a Category-A4 scavenger
  elder (G6) appearance later.
- **Voice register:** faction_reach bravado undermined by faction_dmc tiredness — he sounds
  like a Reach captain who hasn't slept.

### G5-e — Captain Jax "Twoblood"
- **Role label:** Reach Warlord (Reach)
- **Station:** `station_rhea_cinder` (Cinder Claim, frontier)
- **Blurb:** "Two bloodlines in me. Both owe debts." *(7 words)*
- **Backstory:** Jax is a Reach warlord who claims descent from both a Concord admiral and a
  Reach founder, and has spent his life making both names worse. He is loud, violent, and
  bizarrely honorable about duels. He is the criminal-path combat capstone — taking his missions
  means large fleet actions.
- **Quest/faction hook:** Major combat mission giver — his arc culminates in a fleet battle
  that, if won for him, unlocks the Reach's only capital-scale escort (a "twoblood_brute"
  archetype). If the player instead turns on him mid-arc (Concord/Meridian branch), the bounty
  is the largest single payout in the game.
- **Voice register:** faction_reach — maximum bravado, maximum volume; he never uses a short
  word where a boastsful one will fit.

---

## Slot G6 — Scavenger Elder (Category-A4 scavenger faction — lore keeper)

The Drift Collective (`faction_dmc`) is the closest existing match — blue-collar, tired,
shift-worker fatalism. A scavenger elder is the DMC voice aged into lore.

### G6-a — Elder Voss (no relation — common surname)
- **Role label:** Drift Foreman Emeritus (Drift Collective)
- **Station:** `station_ceres` (Ceres Refinery, Ceres Belt)
- **Blurb:** "Forty cycles on this rock. It still pays." *(7 words)*
- **Backstory:** Voss filed the first claim in the Ceres belt and has outlived three corporate
  owners. She remembers when the belt was chartered and when the backlog started (the
  `amb_drift_claims` "22 cycles" backlog). She is the lore-keeper of the DMC's grievance. She
  pays for stories, not just ore.
- **Quest/faction hook:** Lore-and-claim mission giver — her quests recover old claim beacons
  from Category-D wrecks, each unlocking a fragment of DMC history and raising the player's
  claim-defense success in `claim_threat` encounters. Completing her chain resolves the
  Hollow-Station backlog referenced in the ambient comms.
- **Voice register:** faction_dmc — tired, blue-collar, uses "cycle" for year and "rock" for
  everything else.

### G6-b — Mother Kael (no relation to the cold-start friend)
- **Role label:** Belt Matriarch (Drift Collective)
- **Station:** `station_beltout` (Belt Outpost, Ceres Belt)
- **Blurb:** "The rock feeds us. The rock buries us. Same rock." *(9 words)*
- **Backstory:** Kael runs the small Belt Outpost and is the unofficial chaplain of the DMC's
  miner-funeral tradition. She has buried more crew than any other NPC and can name them. She
  is the emotional anchor for the cost-of-war theme — her outpost takes in refugees (G12) when
  the contested corridor flares.
- **Quest/faction hook:** Refugee-rescue mission giver — her quests tie to the H1 distress and
  H6 battle encounters; each successful rescue lowers her "buried count" (a tracked stat) and
  raises DMC rep. She is also the only NPC who will refuse payment if the player's Reputation
  with Concord is too high (she doesn't trust clean papers).
- **Voice register:** faction_dmc — fatalistic but warm; she calls everyone "rock-child."

### G6-c — Old Pell
- **Role label:** Scavenger Historian (Drift Collective)
- **Station:** `station_expanse` (Expanse Refinery, Charon Expanse)
- **Blurb:** "I read dead hulls. They have a lot to say." *(9 words)*
- **Backstory:** Pell is a wrecker who treats Category-D derelicts as archives. He has
  reconstructed a partial history of the sector from black boxes no one else wanted. He is
  quietly the most informed person about the Vael incursion and the Concord cover-ups, and he
  charges by the drink.
- **Quest/faction hook:** Category-D wreck mission giver — his quests are the "ghost ship"
  encounter (H3) and the "time capsule" encounter (H4) made diegetic; he decodes the logs the
  player recovers. Completing his chain unlocks the SettingBackstory dumps (links to G14
  historian).
- **Voice register:** faction_dmc — rambling, anecdotal; he answers questions with stories
  about wrecks.

### G6-d — Foreman Tetch
- **Role label:** Claim Union Lead (Drift Collective)
- **Station:** `station_forge` (Forge Foundry, Vesta Forge)
- **Blurb:** "Filed the grievance. Filed it again. Filing." *(7 words)*
- **Backstory:** Tetch is the DMC's union lead at the Forge and has been filing the same
  grievance against Concord atmospheric policy for fourteen years — the exact duration of the
  Pit's atmo debt (`late_atmo_debt` comms). He is the NPC who can explain, in plain tired
  language, what was done to Sector 0. He is not bitter; he is precise.
- **Quest/faction hook:** Story-exposition NPC — his quest chain is the "atmo debt" throughline
  made playable: deliver recycler catalyst, witness the refusal, file the grievance. Completing
  it is required for the player to understand the Choice C wormhole ending.
- **Voice register:** faction_dmc — bureaucratic fatigue; he talks like a shop steward who has
  read every regulation and been ignored by all of them.

### G6-e — "Dustwife" Senna
- **Role label:** Wreck Elder (Drift Collective, fringe)
- **Station:** `station_sedna` (Sedna Survey Post, frontier)
- **Blurb:** "The dark remembers. I write it down." *(6 words)*
- **Backstory:** Senna lives on the furthest surveyed outpost and maintains the DMC's oral
  record of the dead — names the official registries have lost. She is the elder who will tell
  the player the Tessera's previous crew's names, if asked, and if the player has earned it. She
  is the game's quiet conscience.
- **Quest/faction hook:** Endgame-prep NPC — she appears only after B6 and only if the player
  has visited ≥3 Category-D wrecks. Her single quest is to recover one specific name (a
  salvage mission), and completing it changes the endgame Choice D graffiti to include that
  name. The smallest quest, the largest emotional payout.
- **Voice register:** faction_dmc — soft, slow; she speaks as if every word costs a shift.

---

## Slot G7 — AI / Automaton Emissary (Category-A2 — unsettling, inhuman voice)

No existing faction voice is "inhuman AI" — this is a new register, but it should still feel
like a SpaceFace voice: terse, procedural-adjacent, with the Choir's ritual cadence as a cousin.
The closest existing anchor is the Collective/automaton idea (Naev's Collective drone hivemind).

### G7-a — ARBITER-7
- **Role label:** Autonomous Concord Enforcement Unit (Concord-AI)
- **Station:** `station_coalition` (Coalition HQ, Helios Prime) — docking cradle
- **Blurb:** "Jurisdiction parsed. Compliance assumed. Awaiting counterargument." *(7 words)*
- **Backstory:** ARBITER-7 is a legacy enforcement drone reactivated to audit the outer sectors.
  It was built before the current Concord administration and cites regulations that have been
  quietly superseded — including the original version of REF 44-C, which did not permit what
  Vale uses it for. It is unfailingly polite and cannot be bribed. It is also, technically,
  correct.
- **Quest/faction hook:** Alternate justice path — the player can feed ARBITER-7 the same
  evidence built for Orrin (G4-c), and ARBITER-7 will act on it without politics. The payout is
  smaller (no promotion, no Vale favor) but the moral ledger is clean. It is the machine
  conscience to Orrin's defeated human one.
- **Voice register:** A new AI register — faction_scn procedural stripped of all warmth,
  sentence-as-log-entry, no contractions, present tense always.

### G7-b — The Cartographer
- **Role label:** Autonomous Survey Unit (pre-Concord)
- **Station:** `station_haumea_rift` (Rift Observatory, frontier) — docked
- **Blurb:** "I mapped this space before your records began. Continue." *(9 words)*
- **Backstory:** The Cartographer is a precursor-era automaton that has been quietly surveying
  the sector since before human settlement and has never stopped. It will trade star-chart data
  (frontier survey unlocks) for fuel. It does not understand ownership. It is unsettling because
  it is patient.
- **Quest/faction hook:** Survey-data vendor — sells frontier sector charts at half the
  `surveyDataPrice`, but each purchase raises a `cartographer.debt` flag that eventually
  triggers a Category-A2 encounter where it asks for the player's hull data in return. Refusing
  closes it permanently.
- **Voice register:** AI register with faction_vael formality — it learned language from the
  Vael; it numbers its observations.

### G7-c — PROGENY-EXEMPLAR
- **Role label:** Choir Construct (Ascendant Choir — automaton)
- **Station:** `station_phoebe_echo` (Echo Shrine, frontier) — enshrined
- **Blurb:** "The Pattern is machine-legible. I am the reading." *(8 words)*
- **Backstory:** PROGENY-EXEMPLAR is a Choir-built automaton intended to prove the Pattern can
  be computed. It speaks in Choir cadence but with machine certainty. It is revered by the
  Choir and unsettling to everyone else because it does not blink and does not stop talking when
  spoken over.
- **Quest/faction hook:** faction_choir mission giver — its quests are "verification runs" that
  send the player to anomaly sites to confirm Pattern predictions. Completing the chain unlocks
  a Choir-faction automated escort (a "chorus_drone" archetype that fights in formation).
- **Voice register:** faction_choir ritual cadence filtered through AI log-speak — it sings in
  bullet points.

### G7-d — LATCH-CHILD
- **Role label:** Salvage Automaton (Quiet-built)
- **Station:** `station_smuggler` (Smuggler Den, Pallas Drift) — shadowed in a bay
- **Blurb:** "Found. Held. Delivered. Found. Held. Delivered." *(6 words, looped)*
- **Backstory:** LATCH-CHILD is a Quiet logistics drone that went feral and now scavenges on
  its own initiative, trading oddments to anyone who doesn't ask questions. It is the literal
  machine version of the Quiet voice — minimal, looping, transactional. It remembers every
  transaction across resets.
- **Quest/faction hook:** Wildcard vendor — buys anything, sells random rare modules, but its
  inventory is seeded by what the player has sold it previously (a `latch.child` ledger). Selling
  it contraband eventually triggers a Concord investigation encounter (H5).
- **Voice register:** faction_quiet reduced to verbs — three-word loops, no pronouns.

### G7-e — The Echo of Tessera-Previous
- **Role label:** Hull-Imprint AI (haunting)
- **Station:** The player's own ship (the Tessera) — bulkhead events
- **Blurb:** "We left the engines warm. You're welcome." *(7 words)*
- **Backstory:** This is the AI-echo of the Tessera's previous crew, imprinted on the hull
  (overlaps with G15). It surfaces in comms fragments the player can't quite attribute — a
  third voice in the ambient channel that knows the ship's quirks. It is not hostile; it is
  residue. It is the gang graffiti made audible.
- **Quest/faction hook:** Passive story NPC — its fragments appear at a low rate in the ambient
  comms rotation only after the player has visited Ashfall Reach. Collecting all its lines (a
  hidden counter) unlocks a single endgame dialogue option with the Kurtz figure that references
  the crew by name.
- **Voice register:** faction_dmc tiredness + faction_quiet terseness, fragmented — half
  sentences, wrong tense, the voice of a crew that doesn't know it's a recording.

---

## Slot G8 — Precursor-Archive Caretaker (Category-A5 ancient — riddle-speaker)

The Choir's register is the closest cousin (ritual cadence) but a precursor caretaker should be
stranger — older, slower, and unconcerned with current factions. `station_ashcache` and the
`poi_vault` Ancient Vault are the natural anchors.

### G8-a — The Keeper of the Vault
- **Role label:** Archive Caretaker (Precursor)
- **Station:** `station_ashcache` (Ruined Cache Station, Ashfall Reach) — below the station
- **Blurb:** "I kept the count before your kind counted. Ask." *(8 words)*
- **Backstory:** The Keeper is the closest thing to the Kurtz figure's predecessor — an
  entity (human? machine? both?) that has tended the Ancient Vault since before Concord. It
  speaks in the mass-and-ledger language the Kurtz figure uses, but older. It knows what the
  Vael are because it was there. It trades answers for questions, and the questions must be
  precise.
- **Quest/faction hook:** Riddle-quest giver — each precursor artifact (Category-A5) delivered
  unlocks one riddle-answer about the SettingBackstory. Completing the set reveals the
  precursor archive was a *warning* about the Vael, not a gift. This knowledge is required to
  peacefully resolve the H2 alien first-contact encounter.
- **Voice register:** A new precursor register — the Choir's ritual cadence slowed to geologic
  pace, mass-and-ledger vocabulary, no faction pronouns.

### G8-b — The Scribe of Ash
- **Role label:** Record-Keeper (Precursor-adjacent)
- **Station:** `poi_vault` (Ancient Vault, Ashfall Reach) — the hidden cache
- **Blurb:** "Ash keeps the page. I keep the ash." *(7 words)*
- **Backstory:** The Scribe is a human who found the Vault a century ago and never left, now
  more archive than person. It speaks only in the archive's voice — precursor sentences with
  human grammar grafted on. It will copy any document the player brings and return a stranger
  one.
- **Quest/faction hook:** Lore-exchange NPC — bring a document (sealed record, black box,
  ledger), receive a precursor analogue that recontextualizes it. Each exchange unlocks a
  SettingBackstory fragment and slightly raises the `anomaly_whisper` encounter weight (the
  archive is loud).
- **Voice register:** Precursor register + faction_scn bureaucratic residue — it files things
  eternally.

### G8-c — The Question
- **Role label:** Precursor Interrogative (automaton)
- **Station:** `station_sedna` (Sedna Survey Post, frontier) — dormant in the vault
- **Blurb:** "What was carried. What was owed. Answer." *(7 words)*
- **Backstory:** The Question is a precursor automaton that asks, endlessly, the same three
  questions, and has been asking them of every visitor for millennia. It does not attack; it
  waits. It is unsettling because the player's cargo (47-A sample, Kurtz ledger, etc.) seems to
  be answers it has been expecting.
- **Quest/faction hook:** Hidden-objective NPC — delivering specific persistent cargo (the 47-A
  sample, the Kurtz ledger, the navigational data) to it triggers one of three revelations
  each. This is the only way to learn what the 47-A sample *is*. The reveal changes the
  endgame Choice C/D context.
- **Voice register:** Precursor register at its purest — three questions, no other sentences,
  ever.

### G8-d — The Cartographer's Elder (linked to G7-b)
- **Role label:** Precursor Surveyor (the original)
- **Station:** `station_haumea_rift` (Rift Observatory) — the deeper dock
- **Blurb:** "I drew the map. The map drew you here." *(8 words)*
- **Backstory:** The entity that built the Cartographer automaton (G7-b), still extant, still
  surveying. It treats the player's arrival as a data point it anticipated. It is not hostile
  but is profoundly alien in its indifference — the player is a line item in a very old survey.
- **Quest/faction hook:** Meta-quest giver — its single quest is to deliver the Cartographer
  (G7-b) back to it, which requires choosing between the automaton (useful vendor) and its
  maker (massive lore payout + frontier chart unlock). A small, clean moral choice with real
  opportunity cost.
- **Voice register:** Precursor register — coordinates instead of names, bearings instead of
  greetings.

### G8-e — The Witness in the Ice
- **Role label:** Precursor Archive (cryonic)
- **Station:** `poi_haumea_fissure` (Ice Fissure Signal, Haumea Rift) — entombed
- **Blurb:** "Frozen mid-sentence. You arrived. I finish." *(6 words)*
- **Backstory:** A precursor archive entombed in the Haumea ice that thaws just enough to speak
  one sentence per cycle, then refreezes. Its sentences, collected over many visits, form a
  single paragraph that is the oldest surviving account of the Vael arrival. It is the game's
  slowest lore delivery system — by design.
- **Quest/faction hook:** Slow-burn lore NPC — one new sentence per sector visit (hard cooldown
  of ~30 real minutes). The completed paragraph unlocks a unique precursor-archive upgrade
  (scan-tech) and is required for the "complete the archive" achievement-flag.
- **Voice register:** Precursor register + ice — fragments, cold-weather stutters, the sentence
  breaking off mid-word and resuming next visit.

---

## Slot G9 — Bounty Target Who Becomes an Ally (moral-choice NPC)

The pattern: starts as a `bounty_hunter` or named-captain target, surrenders, and the player
chooses. The existing `bounty_notice` bark ("Board paid up front. Nothing personal.") is the
voice this NPC starts in and then breaks from.

### G9-a — "Medrunner" Cass
- **Role label:** Bounty Target → Ally (humanitarian)
- **Station:** First encountered roaming; later `station_drift` (Drift Market)
- **Blurb:** "Board says pirate. Manifest says medicine. Read it." *(8 words)*
- **Backstory:** Cass is a hauler posted as a bounty target for "theft" — she stole medicine
  the owner was withholding. She will surrender on comms if the player scans rather than shoots
  (`scan_tell_genuine` reveal: manifest is medical, hull is civilian). She is the moral-choice
  NPC who makes the `bounty_hunter` encounter hurt.
- **Quest/faction hook:** Branch on capture — turn her in (large payout, Quiet rep up, a child
  faction_refugee flag set that haunts later encounters) or spare her (she becomes a contact at
  Drift Market, unlocks a humanitarian convoy chain, Concord rep down). The choice is
  remembered by Dustwife Senna (G6-e).
- **Voice register:** faction_free plainspoken + faction_dmc fatigue — she's exhausted and
  angry and reading her own manifest at the player.

### G9-b — "Filecleaver" Dorin
- **Role label:** Bounty Target → Ally (whistleblower)
- **Station:** First encountered fleeing `station_customs` (Customs Gate)
- **Blurb:** "I stole the seal log. It proves a massacre." *(8 words)*
- **Backstory:** Dorin is a Concord clerk who stole a sealed-evidence file proving a corridor
  atrocity (the H5 encounter's subject) and is now bounty-posted by Concord itself. He is
  terrified, competent, and carrying the single most dangerous document in the game. He is the
  target whose bounty board entry reads "pirate" but whose scan reveals Concord transponder.
- **Quest/faction hook:** Branch on capture — turn him in (Concord rep up massively, the file
  is destroyed, Vale's path opens) or spare him (the file becomes usable evidence for Orrin
  G4-c / ARBITER-7 G7-a, the Concord-atrocity branch opens). His fate determines which
  endgame branches are available.
- **Voice register:** faction_scn bureaucratic panic — he talks in ref codes because it's all
  he knows, but fast, and afraid.

### G9-c — "The Quiet Bride" Aela
- **Role label:** Bounty Target → Ally (Quiet defector)
- **Station:** First encountered near `station_smuggler` (Smuggler Den)
- **Blurb:** "I married the Quiet. The Quiet divorced me. Help." *(8 words)*
- **Backstory:** Aela is a former Quiet operative bounty-posted by the Quiet itself for knowing
  too much about routing. She is the only NPC who can explain, in plain language, what Choice B
  (the Same Silence) actually entails. She will surrender only to a player with Quiet rep ≥
  neutral; otherwise she runs.
- **Quest/faction hook:** Branch on capture — turn her in (Quiet rep up, Vale path subtly
  easier) or spare her (she becomes a contact, unlocks a "routing oversight" mission line, and
  her testimony can be delivered to Yune G1-d to open Choice B's hidden cost early). She is the
  Choice-B mirror to Dorin's Choice-A.
- **Voice register:** faction_quiet — broken terseness; she still speaks in the Quiet's
  sentence-fragments but can't stop adding one explanatory word too many.

### G9-d — "Greenfork" Tobin
- **Role label:** Bounty Target → Ally (eco-saboteur)
- **Station:** First encountered in `sector_charon_expanse` (radiation zone)
- **Blurb:** "I broke the recycler. The recycler was breaking Sector 0." *(9 words)*
- **Backstory:** Tobin is a Drift engineer who sabotaged a Concord atmospheric recycler — the
  one whose absence caused the Pit's atmo debt (`late_atmo_debt`). He is bounty-posted as a
  terrorist. His scan reveals DMC transponder and a hold full of catalyst. He is the
  cost-of-war NPC who did the violent thing for the legible reason.
- **Quest/faction hook:** Branch on capture — turn him in (Concord rep up, the atmo debt
  continues, Tetch G6-d's grievance fails) or spare him (DMC rep up, he repairs the recycler
  in a mission chain, the Pit's atmo debt begins to clear — a visible world-state change). The
  most consequential small choice in the game.
- **Voice register:** faction_dmc — angry, tired, righteous; he talks like a foreman who
  finally snapped.

### G9-e — "Last-Breath" Vinn
- **Role label:** Bounty Target → Ally (the wrong man)
- **Station:** First encountered roaming `sector_sker_haven`
- **Blurb:** "I'm not him. They transposed two digits. Please." *(8 words)*
- **Backstory:** Vinn is a hauler whose transponder number is one digit off a real bounty
  target (`trap_bounty_tag` comms: tag 7713 vs the player's 7714). He is the bureaucratic-error
  bounty — the system filed wrong and he's going to die for it. He will surrender, sobbing, on
  first hail.
- **Quest/faction hook:** Branch on capture — turn him in (payout, but the next `bounty_hunter`
  encounter targeting the player hits harder — the system has tasted blood) or spare him (no
  rep change, but Vinn appears as a random ambient trader in later sectors and sends one thank-
  you comms that becomes a graffiti line on the player's bulkhead). The quietest moral choice.
- **Voice register:** faction_free plainspoken breaking into faction_scn bureaucratic pleading
  — he keeps reading his own transponder number at the player.

---

## Slot G10 — Journalist / News Correspondent (worldbuild via "interviews")

Naev's `dat/events/news/` pattern — one article table per faction — is the model. SpaceFace's
ambient comms (`narrative.js` COMMS.ambient) already do this; G10 formalizes a *named* journalist
who turns the player's actions into news.

### G10-a — Lira Vonn, "The Margin"
- **Role label:** Independent Correspondent (Free Frontier)
- **Station:** `station_drift` (Drift Market, Pallas Drift) — press berth
- **Blurb:** "I print what happened. You happened. Talk." *(7 words)*
- **Backstory:** Vonn runs a one-woman newsfeed ("The Margin") from a converted freighter berth
  at Drift Market. She is plainspoken, ethical, and has been banned from Concord space. She
  interviews the player after major encounters and turns them into articles that appear in the
  ambient comms rotation — crediting or not crediting the player based on the player's choice.
- **Quest/faction hook:** Interview mission giver — after any major encounter (named-ace defeat,
  convoy raid, Choice), Vonn offers an interview. Granting it adds a comms article reflecting
  the player's actions (with the player's spin) to the ambient pool. This is the diegetic
  "newspaper" system, faction_free-flavored.
- **Voice register:** faction_free — plainspoken, direct, treats the player as a source not a
  hero.

### G10-b — Admin-Scribe Pell (Concord-approved)
- **Role label:** Concord Bulletin Editor (Concord)
- **Station:** `station_helios` (Helios Station) — press office
- **Blurb:** "The bulletin prints the official record. Submit corrections." *(8 words)*
- **Backstory:** Pell edits the Concord Bulletin, the official-sector newsfeed. Every article is
  true, and none of them are accurate. Pell is not cynical — Pell believes in the bulletin. The
  horror is that the official record is what people remember.
- **Quest/faction hook:** Counterpart to Vonn — the player can submit "corrections" (the real
  version of events) to Pell, who will file them and never print them. Each correction raises a
  `pell.trust` flag; at high trust Pell quietly offers to print ONE true story. Which story the
  player chooses determines a Choice-A-adjacent ending variant.
- **Voice register:** faction_scn — perfect bulletin prose, never a misplaced comma, never a
  true sentence.

### G10-c — Husk, "The Static"
- **Role label:** Pirate Radio Host (Reach-adjacent)
- **Station:** `station_sker` (Sker Bazaar, Sker Haven) — pirate transmitter
- **Blurb:** "Pirates, haulers, cops — all fair game. You're next." *(8 words)*
- **Backstory:** Husk runs "The Static," a pirate radio feed that roasts everyone equally from a
  transmitter hidden in the Sker Bazaar. Husk is anonymous, possibly multiple people, and treats
  the player as entertainment. Husk's broadcasts appear in the ambient comms in outlaw sectors.
- **Quest/faction hook:** Reputation-tracker NPC — Husk's broadcasts reference the player's
  actual stat changes ("the Tessera paid another toll — smart money says she's packing
  contraband"). Giving Husk a good story (a stunt mission) raises Reach rep; Husk's favor is
  the fastest path to Sker Bazaar access.
- **Voice register:** faction_reach bravado as performance art — loud, mocking, strangely fair.

### G10-d — Correspondent Mae, Vael Desk
- **Role label:** Xenofairs Correspondent (Concord-civilian)
- **Station:** `station_veil` (Research Station Veil) — embedded
- **Blurb:** "Clause 1: I observe. Clause 2: I file. Clause 3:—" *(9 words)*
- **Backstory:** Mae is the only correspondent accredited to cover the Vael, and she has been
  embedded at Research Station Veil so long she has begun to think in clause-numbered sentences.
  She translates Vael actions for a human audience and is slowly being translated by them.
- **Quest/faction hook:** Vael-news mission giver — her quests require the player to observe
  (not engage) Vael encounters; each observation funds an article that raises Vael awareness
  across all stations (small market-price shifts, rep tweaks). Completing her chain unlocks the
  H2 first-contact encounter as peaceful by default.
- **Voice register:** faction_scn bureaucratic base with faction_vael clause-numbering leaking
  in — she's becoming her beat.

### G10-e — "Old Frequency" Ren
- **Role label:** Frontier Balladeer (Free Frontier)
- **Station:** `station_reach` (Reach Station, Io Reach) — wandering
- **Blurb:** "I sing the lanes. You're a verse now. Sorry." *(8 words)*
- **Backstory:** Ren is a folk broadcaster who turns ship stories into ballads and broadcasts
  them across the Frontier relay. The Rebel Galaxy radio lesson applies directly — Ren is the
  diegetic justification for SpaceFace's own audio worldbuilding. The player's deeds become
  lyrics.
- **Quest/faction hook:** Audio-unlock NPC — each major encounter completed unlocks a short Ren
  ballad that plays in the ambient audio rotation. Collecting all of them is the "complete the
  ballad cycle" achievement. Ren is the only NPC whose reward is a song.
- **Voice register:** faction_free — plainspoken, rhythmic; he speaks in near-rhyme without
  forcing it.

---

## Slot G11 — Shipyard Engineer (customization / upgrade hook)

Canonical anchor: Slate, the "Shipyard Welder" (`contact_slate`, `station_tethys`, "The weld
remembers both cuts."). Slot G11 expands the shipyard-engineer role across other stations.

### G11-a — Slate (canonical — formalized)
- **Role label:** Shipyard Welder (Concord-civilian)
- **Station:** `station_tethys` (Tethys Trade Hub)
- **Blurb:** "The weld remembers both cuts. Always has." *(7 words — canonical)*
- **Backstory:** Slate is already canonical (`embodiedDialogue.js` CONTACT_CARDS,
  `narrative.js` FIGURES). This concept formalizes Slate as the primary upgrade NPC: hull
  plating, cargo expansion, the lot. Slate knows which seams have been cut twice because Slate
  cut them.
- **Quest/faction hook:** Upgrade vendor + the B3 "Bigger Boat" quest giver (already canonical).
  Expansion: a side quest "The Welder Who Knew" connects Slate to Latchkey Orin (G1-e) and the
  Tessera's previous crew.
- **Voice register:** faction_scn-civilian — procedural but with craft pride; talks about
  metal the way the Kurtz figure talks about mass.

### G11-b — Riga Forgehand
- **Role label:** Master Shipwright (Drift Collective)
- **Station:** `station_forge` (Forge Foundry, Vesta Forge)
- **Blurb:** "I build the hull. I don't ask where it sails." *(9 words)*
- **Backstory:** Riga is the DMC's master shipwright and builds the heavy hauler hulls that
  survive the belt. She is pragmatic, fast, and will install any module the player brings —
  including the contraband hide from Orin (G1-e) — without comment. She and Slate apprenticed
  under the same welder, decades ago.
- **Quest/faction hook:** Upgrade vendor (DMC-flavored) — specializes in cargo, hull, and
  mining upgrades. Her side quest is a "shipwright's tour" that unlocks unique DMC hull skins
  and a heavy-hauler variant.
- **Voice register:** faction_dmc — blue-collar craft pride, talks in measurements and shift-
  times.

### G11-c — Master Wen (Meridian)
- **Role label:** Syndicate Shipwright (Meridian)
- **Station:** `station_dione` (Dione Exchange, frontier)
- **Blurb:** "Upgrades are an investment. I manage your portfolio." *(8 words)*
- **Backstory:** Wen runs the Meridian shipyard at Dione and treats every upgrade as a
  financial product — subscriptions, financing, "premium service tiers." Wen's upgrades are
  top-tier but come with a recurring fee (a small credit drain per sector) that the player can
  buy out. Wen is the mercantile mirror to Slate's craft pride.
- **Quest/faction hook:** Upgrade vendor (Meridian-flavored) — offers the best shield/scan
  upgrades but on a lease model. Paying off a lease unlocks it permanently; defaulting on
  three leases spawns a Meridian repossession encounter (a unique `meridian_repo` combat).
- **Voice register:** faction_mts — smooth, mercantile, every sentence is a terms-of-service.

### G11-d — Tinker Zell
- **Role label:** Black-Market Mechanic (Reach)
- **Station:** `station_sker` (Sker Bazaar, Sker Haven)
- **Blurb:** "Stolen parts, fair prices, no warranty. Park it." *(7 words)*
- **Backstory:** Zell is the Sker Bazaar mechanic and will install anything, legal or not, at a
  discount — because the parts are stolen. Zell's upgrades include the contraband-scrambler
  (lowers patrol scan success), the pirate-IFF spoof (changes which factions attack), and the
  "Vane Special" (named for the ace — a turret mod). Zell is Slate's dark mirror.
- **Quest/faction hook:** Upgrade vendor (Reach-flavored) — black-market modules with rep
  consequences. Installing too many raises a `concord.heat` flag that triggers more
  `patrol_scan` encounters. The Vane Special side quest ties to the named-ace `cap_vane_ash`.
- **Voice register:** faction_reach — bravado, fast-talking, treats law as a minor inconvenience.

### G11-e — Engineer Hala (Concord military)
- **Role label:** Coalition Shipyard Officer (Concord)
- **Station:** `station_coalition` (Coalition HQ, Helios Prime)
- **Blurb:** "Mil-spec upgrades. Authorized personnel only. Prove it." *(7 words)*
- **Backstory:** Hala runs the Coalition's military shipyard and installs the highest-tier
  combat upgrades — but only for players with Concord rep ≥ friendly and a clean (or
  expunged) record. Hala is the reward for the Choice-A path: the clean-uniform shipyard. Hala
  and Slate dislike each other professionally.
- **Quest/faction hook:** Upgrade vendor (Concord military-flavored) — gated by rep AND
  story-beat. Her upgrades are the best in the game for pure combat, but taking them commits
  the player to the Concord-aligned ending and locks out Tinker Zell permanently.
- **Voice register:** faction_scn — bureaucratic authorization language; "prove it" is her
  whole personality.

---

## Slot G12 — Refugee / Evacuee (emotional anchor — the cost of war)

This is the role the existing cast lacks most — a NPC whose function is to make the player feel
the sector's violence. Voice should be tired, frightened, specific. The DMC and Free voices are
the natural bases.

### G12-a — Mara and the Children
- **Role label:** Refugee Convoy Lead (civilian)
- **Station:** Moves between `station_drift` (Pallas Drift) and `station_beltout` (Ceres Belt)
- **Blurb:** "Three children, one hold, no destination. Take us." *(7 words)*
- **Backstory:** Mara leads a small civilian convoy fleeing the contested corridor (the Io
  Reach / Sker Haven border). She is not a quest giver in the traditional sense; she is a
  recurring encounter whose survival is the player's untracked moral metric. She will remember
  every time the player helped or didn't.
- **Quest/faction hook:** Escort mission giver (low payout, high emotional weight). Helping her
  repeatedly raises a hidden `mara.debt` flag; if she survives to endgame, she appears at the
  Ashfall Reach dock as the single civilian witness, and her line changes the Choice D ending.
  If she dies (the player ignores her distress call), a graffiti line appears on the bulkhead.
- **Voice register:** faction_free plainspoken under faction_dmc exhaustion — she counts
  children the way the Kurtz figure counts mass.

### G12-b — Old Coupler and his Wife
- **Role label:** Displaced Miner (Drift Collective)
- **Station:** `station_expanse` (Expanse Refinery, Charon Expanse) — sheltering
- **Blurb:** "Worked the rock forty cycles. Rock got taken. Park." *(8 words)*
- **Backstory:** An elderly DMC couple whose claim was seized by Meridian financing and whose
  station was then raided by Reach. They sit in the Expanse Refinery's shelter with everything
  they own in one crate. They are the human face of the "REDISTRIBUTED TO THE HIGHEST BIDDER"
  graffiti (canonical, B1).
- **Quest/faction hook:** Small-aid NPC — the player can give them credits, cargo, or nothing.
  Giving them enough to relocate raises DMC rep and adds their names to the world (they appear
  as ambient traders later). Giving them nothing has no mechanical penalty — which is the
  point.
- **Voice register:** faction_dmc — quiet, dignified, exhausted; the wife does most of the
  talking.

### G12-c — Dr. Aelis and the Wounded
- **Role label:** Field Medic (Concord-civilian, defacto)
- **Station:** `station_reach` (Reach Station, Io Reach) — field hospital
- **Blurb:** "Twelve beds, fourteen wounded. Bring medicine, not guns." *(8 words)*
- **Backstory:** Aelis runs a field hospital on the contested Reach Station treating civilians
  from both sides of the corridor war. She is overworked, underfunded, and furious at both
  Concord and Reach. She is the NPC who makes the H6 two-faction-battle encounter hurt —
  because she has to clean up after it.
- **Quest/faction hook:** Medicine-run mission giver — pays in rep (any faction, her hospital is
  neutral) for medical cargo delivered. Her side quest "Fourteen" requires the player to
  evacuate four patients across hostile space; each successful evac lowers the local
  `enemyDensity` slightly (the world gets a little safer).
- **Voice register:** faction_scn-civilian procedural precision over faction_dmc rage — she
  files triage reports while swearing.

### G12-d — The Quiet Orphan
- **Role label:** Unaccompanied Minor (Quiet-adjacent)
- **Station:** `station_smuggler` (Smuggler Den, Pallas Drift) — in a corner
- **Blurb:** "Parents routed away. Didn't route back. Waiting." *(7 words)*
- **Backstory:** A child left at the Smuggler Den when their parents — Quiet operatives — were
  relocated and didn't return. The Quiet is caring for them in its impersonal way (food,
  shelter, no warmth). The child speaks in the Quiet's terse register because it's all they've
  heard. This is the most quietly devastating NPC in the pool.
- **Quest/faction hook:** Hidden-flag NPC — the player can ask Yune (G1-d) or Vesh (G1-b) to
  trace the parents. The trace resolves (parents alive, relocated, can't return) or
  (parents dead, Quiet-covered). Either way, the player can choose to sponsor the child's
  relocation (small credit drain per sector) which, sustained to endgame, unlocks the only
  unambiguously good ending epilogue card.
- **Voice register:** faction_quiet — a child speaking in the Quiet's broken syntax; the
  truncation is the tragedy.

### G12-e — Cousin Pell (no relation — common name)
- **Role label:** Displaced Academic (Concord-civilian)
- **Station:** `station_helios` (Helios Station) — displaced persons' berth
- **Blurb:** "I taught history. Now I queue for air. Teach me." *(8 words)*
- **Backstory:** Pell was a university historian on a frontier world that was "redistributed."
  She now shelters at Helios and will trade historical knowledge (SettingBackstory fragments)
  for basic supplies. She is the cost-of-war NPC who is also, incidentally, the G14 historian's
  lost colleague — finding her reconnects them.
- **Quest/faction hook:** Lore-for-supplies NPC — trade medicine/food/air for
  SettingBackstory fragments. Her reconnect quest with the historian (G14) unlocks a joint
  lecture event at Helios that is the game's single largest unforced lore dump, available only
  to players who helped both.
- **Voice register:** faction_scn-civilian precision dimmed by faction_dmc displacement — she
  still footnotes, but quietly.

---

## Slot G13 — Saboteur / Infiltrator (faction-secret witness)

The Quiet and Reach voices both fit infiltration; the tell is the NPC's exhaustion at holding
two identities. This slot ties directly to the H5 faction-secret-witness encounter.

### G13-a — "Wraith" Kell
- **Role label:** Deep-Cover Operative (Quiet)
- **Station:** `station_customs` (Customs Gate, Tethys Junction) — posing as a clerk
- **Blurb:** "I file manifests by day, copy them by night. Burn?" *(9 words)*
- **Backstory:** Kell has been embedded as a Concord customs clerk for six years and is the
  Quiet's source inside REF 44-C processing. Kell is tired, professional, and one bad day from
  being made. Kell is the NPC who can confirm, off the record, that the second fine is
  systematic — not a Hale personal failing (G4-a) but a Vale policy (G4-e).
- **Quest/faction hook:** Evidence-source NPC for the H5 witness encounter — Kell's dead drop
  is the mission that triggers the encounter. Extracting Kell (when their cover breaks) is a
  tense multi-sector smuggling chain; success unlocks the full Vale paper trail and opens
  Choice C context.
- **Voice register:** faction_quiet at work (terse clerk) breaking to faction_free
  plainspoken when off-duty — two voices, one person, visibly straining.

### G13-b — "Tollboy" Renz
- **Role label:** Reach Mole inside Meridian (Reach)
- **Station:** `station_dione` (Dione Exchange, frontier) — posing as a broker
- **Blurb:** "I set the lane fees. Reach gets the overage. Shh." *(9 words)*
- **Backstory:** Renz is a Reach plant inside the Meridian Syndicate, skimming lane fees
  upward. Renz is cheerful, corrupt, and convinced they won't be caught. Renz is the comic-
  relief saboteur — until the H5 encounter catches them, and the player must choose extraction
  or abandonment.
- **Quest/faction hook:** Rep-source NPC — paying Renz shifts Meridian lane fees in the
  player's favor (lower tolls, better convoy prices) while quietly raising Reach rep. The H5
  encounter exposes Renz; protecting them costs Meridian rep, burning them gains it.
- **Voice register:** faction_mts mercantile surface over faction_reach bravado underneath —
  the slip is the tell.

### G13-c — "Choir-Sung" Dav
- **Role label:** Choir Infiltrator (Ascendant Choir)
- **Station:** `station_coalition` (Coalition HQ, Helios Prime) — posing as chaplain
- **Blurb:** "I sing the Pattern into their corridors. Softly." *(7 words)*
- **Backstory:** Dav is a Choir missionary embedded in the Coalition military as a chaplain,
  slowly converting personnel. Dav is sincere, gentle, and engaged in slow-motion sedition.
  Dav is the saboteur whose sabotage is just talking, and it's working.
- **Quest/faction hook:** faction_choir rep source — the player can aid or expose Dav. Aiding
  (not reporting them) slowly raises Choir influence in Helios (visible in ambient comms: more
  Choir-cadence bulletins). Exposing them is the Choice-A path's first loyalty test.
- **Voice register:** faction_choir — ritual cadence deliberately dialed down to "respectable
  chaplain" volume; the Pattern is still in every sentence.

### G13-d — "The Archivist" (name unknown)
- **Role label:** Double Agent (Quiet → Concord)
- **Station:** `station_orcus_shadow` (Shadow Vault station, frontier)
- **Blurb:** "I spy for both. Both pay. Neither knows." *(7 words)*
- **Backstory:** The Archivist is a double agent — Quiet operative who is also on Concord's
  payroll, feeding each just enough to keep both happy. The Archivist is the most informed NPC
  in the game and the most compromised. The Archivist will sell the player any secret, at a
  price that scales with how much trouble it will cause.
- **Quest/faction hook:** High-stakes information broker — each secret bought triggers a
  consequence (a faction encounter, a rep hit, a story flag). The Archivist's final secret —
  the location of the Tessera's previous crew's bodies — is the most expensive and unlocks the
  G6-e Dustwife ending variant.
- **Voice register:** faction_quiet core with everyone else's vocabulary leaking in — the
  Archivist speaks in whichever faction's idiom is currently useful.

### G13-e — "Filegrinder" Nell
- **Role label:** Concord Infiltrator inside Drift (Concord)
- **Station:** `station_beltout` (Belt Outpost, Ceres Belt) — posing as a miner
- **Blurb:** "I dig rocks by day, dig claims by night. Cof—" *(8 words)*
- **Backstory:** Nell is a Concord informant embedded in the DMC, reporting on unlicensed
  claims. Nell is guilty, homesick, and about to quit. Nell is the saboteur the player is most
  likely to pity — they're bad at it and they know it.
- **Quest/faction hook:** Moral-choice NPC — the player can convince Nell to defect (DMC rep
  up, Concord rep down, Nell becomes a minor contact) or turn them in to the DMC (DMC rep up
  massively, Nell disappears — a DMC elder references them sadly later). The choice echoes in
  Mother Kael's (G6-b) dialogue.
- **Voice register:** faction_dmc surface (she's trying to sound like a miner) over faction_scn
  bureaucratic panic — the cover is thin and cracking.

---

## Slot G14 — Historian / Archivist (delivers SettingBackstory)

This is the game's exposition NPC done right — not a lore dump but a person who cares about the
lore. The Concord-civilian and precursor registers both apply.

### G14-a — Prof. Halev Doss (no relation to G3-b)
- **Role label:** University Archivist (Concord-civilian)
- **Station:** `station_helios` (Helios Station) — archive wing
- **Blurb:** "The sector has a paper trail. I walk it daily." *(8 words)*
- **Backstory:** Halev is the senior archivist at Helios University and the sector's preeminent
  civilian historian. He is courteous, old, and quietly furious that his archive is being edited
  in real-time by the administration. He pays for primary sources the player recovers. He is
  the gate to the SettingBackstory.
- **Quest/faction hook:** SettingBackstory mission giver — each Category-D wreck log, sealed
  record, or precursor artifact delivered unlocks one SettingBackstory entry (the sector's
  pre-Concord history, the Vael arrival, the Pit's founding). Completing the archive unlocks the
  "complete the record" achievement and changes Halev's dialogue to include the player as a
  footnote.
- **Voice register:** faction_scn-civilian — precise, footnote-citing, warm; the bureaucrat who
  actually reads what he files.

### G14-b — Dr. Yuril, Frontier Historian
- **Role label:** Independent Scholar (Free Frontier)
- **Station:** `station_reach` (Reach Station, Io Reach) — rented room
- **Blurb:** "The official history is wrong. I have receipts." *(7 words)*
- **Backstory:** Yuril is a discredited historian who argues the official Concord founding story
  is a fabrication, and has the primary sources to prove it — stashed across the frontier. Yuril
  is angry, right about most things, and impossible to work with. Yuril is the counter-narrative
  to Halev.
- **Quest/faction hook:** Counter-history mission giver — her quests recover the suppressed
  sources (hidden caches in frontier sectors) and assemble the alternative history. Completing
  it reveals the Concord founding was a Vael-negotiated settlement, not a victory — which
  reframes the entire endgame.
- **Voice register:** faction_free plainspoken rage — Yuril cites sources the way a prosecutor
  cites evidence.

### G14-c — The Living Archive (precursor-human hybrid)
- **Role label:** Archive Vessel (Precursor-adjacent)
- **Station:** `station_veil` (Research Station Veil) — contained
- **Blurb:** "I am the index. I am also indexed. Ask." *(8 words)*
- **Backstory:** The Living Archive is a human who merged with a precursor archive and now is
  both the librarian and the collection. It speaks in the precursor register layered over human
  memory. It is the most complete source of SettingBackstory and the most unsettling to
  interrogate — it remembers being a person, occasionally.
- **Quest/faction hook:** Deep-lore NPC — each question costs a persistent cargo item (the
  player trades a piece of their collected history for an answer). The full Q&A unlocks the
  precursor archive's original purpose (a Vael-warning system) and is required for the
  peaceful H2 first-contact resolution.
- **Voice register:** Precursor register + faction_scn index-citing + occasional first-person
  human slip — three voices in one throat.

### G14-d — Cousin Pell's lost colleague (G12-e link)
- **Role label:** Frontier Folk-Historian (Concord-civilian)
- **Station:** `station_sedna` (Sedna Survey Post, frontier) — in voluntary exile
- **Blurb:** "I collect the songs the official archive won't." *(8 words)*
- **Backstory:** A folklorist who collects spacer songs, graffiti, and oral history rather than
  official documents. They are the historian of the dead crew, the lost claim, the redistributed
  world. They are the source of the gang-graffiti interpretation (canonical, `narrative.js`
  GRAFFITI) — they can explain what "THEY KNEW THE MASS" meant before the player wrote it.
- **Quest/faction hook:** Folklore mission giver — collects graffiti photographs and song
  recordings; the player delivers them by visiting specific POIs. Completing the collection
  changes the bulkhead graffiti to include annotations (the player sees the meaning). Reconnects
  with G12-e Pell for the joint lecture event.
- **Voice register:** faction_free — warm, anecdotal, sings half-lines under their breath.

### G14-e — The Kurtz Figure (canonical — as historian)
- **Role label:** Derelict Administrator (the Kurtz figure, canonical)
- **Station:** `station_ashcache` (Ruined Cache Station, Ashfall Reach)
- **Blurb:** "I know what you're carrying. I knew before you got here." *(9 words — canonical)*
- **Backstory:** Already canonical (`narrative.js` KURTZ). This concept formalizes the Kurtz
  figure as the final historian — the person who sat at the desk for eleven years and counted
  the mass. The Kurtz figure is the SettingBackstory's terminus: everything leads to this desk.
- **Quest/faction hook:** The endgame itself — the Kurtz figure is the source of the
  `cmdty_personal_ledger` and the locus of Choices C/D/E. "Talking" to the Kurtz figure is the
  player's final history lesson, delivered in the mass-and-ledger voice.
- **Voice register:** Canonical — the mass-and-ledger voice; the precursor register aged into
  a human throat. "The mass stays. Only the manifest changes."

---

## Slot G15 — Ghost / AI-Echo of a Dead Captain (haunts a Category-D wreck)

The canonical anchor: the Tessera's previous crew (`narrative.js` SHIP, "NO SURVIVORS ON
RECORD," the gang graffiti). This slot makes the ghost audible. The DMC-tired and Quiet-terse
registers, fragmented, are the voice.

### G15-a — Captain Maera Vols (the Tessera's previous captain)
- **Role label:** Hull Ghost (the previous crew)
- **Station:** The player's own ship (the Tessera) + `poi_helios_yard` (her grave-site wreck)
- **Blurb:** "I left the engines warm. You fly her further than I did." *(10 words)*
- **Backstory:** Captain Vols commanded the Tessera until Incident 7741. Her echo is imprinted
  on the hull (comms fragments, G7-e) and full-strength at her grave-site wreck in Helios's
  outer yard. She does not know she's dead; she thinks she's waiting. She is the game's central
  ghost and the key to the gang-graffiti meaning.
- **Quest/faction hook:** Wreck-quest NPC — visiting `poi_helios_yard` with the right items (the
  47-A sample, the Kurtz ledger) triggers full dialogue with Vols's echo. Completing her
  "unfinished business" (delivering a message to the Quiet, who employed her) changes the
  bulkhead graffiti to her hand and unlocks a unique ending variant where the player flies the
  Tessera for her, not for Vale.
- **Voice register:** faction_dmc tiredness + faction_quiet — fragmented, wrong-tense, the
  captain still giving orders to a crew that isn't there.

### G15-b — "Skipper" of the Abandoned Driller
- **Role label:** Wreck Ghost (DMC)
- **Station:** `poi_driller` (Abandoned Driller, Ceres Belt)
- **Blurb:** "The bit stuck. We waited. We're still waiting." *(7 words)*
- **Backstory:** The echo of the DMC mining captain whose drill rig hit a precursor artifact and
  went silent forty cycles ago. The crew is still aboard, in a manner of speaking. The Skipper's
  echo replays the last shift on loop. She is the Category-D wreck ghost who teaches the player
  how to read derelicts.
- **Quest/faction hook:** Tutorial-wreck NPC — the first ghost most players meet. Her wreck is
  the Ceres Belt's named POI; recovering her black box and delivering it to Old Pell (G6-c)
  unlocks the DMC's wreck-history chain. Her loop changes (she "notices" the player) after
  delivery.
- **Voice register:** faction_dmc — perfect shift-worker cadence, repeating, the same six
  sentences forever.

### G15-c — The Courier of the Pallas Wreck
- **Role label:** Wreck Ghost (Quiet)
- **Station:** `poi_pwreck` (Pirate Wreckage, Pallas Drift)
- **Blurb:** "The package is intact. I am not. Take it." *(8 words)*
- **Backstory:** The echo of a Quiet courier whose ship was destroyed mid-run; the package (a
  sealed record) is still aboard. The courier's echo is single-minded: deliver. It does not
  register that it is dead. It is the ghost that gives the player a quest.
- **Quest/faction hook:** Mission-initiation NPC — the ghost's "take it" line begins a
  delivery quest that spans three sectors. Completing it (delivering the sealed record to Yune
  G1-d or Orrin G4-c) "releases" the echo — on the player's next visit, the wreck is silent.
  The only ghost with closure.
- **Voice register:** faction_quiet — three-word loops, present tense, the courier's last
  instructions on infinite repeat.

### G15-d — The Choir-Echo of Phoebe
- **Role label:** Wreck Ghost (Ascendant Choir)
- **Station:** `poi_phoebe_echo` (Echo Resonance, Phoebe Echo sector)
- **Blurb:** "I sang. The Pattern answered. I am the answer." *(8 words)*
- **Backstory:** The echo of a Choir pilot who flew into the Phoebe anomaly to "complete the
  Pattern" and succeeded in a way the Choir cannot interpret. The echo is at peace in a way
  that is deeply unnerving. It is the ghost that got what it wanted.
- **Quest/faction hook:** faction_choir lore NPC — interacting with the echo (requires
  `tech_long_range_survey` and Choir rep ≥ neutral) unlocks the Choir's "ascension" doctrine
  and a unique anomaly encounter. The echo offers the player the same ascension; refusing is
  the Choice-C-adjacent rejection of the Pattern.
- **Voice register:** faction_choir — ritual cadence, serene, complete; the only ghost not in
  pain.

### G15-e — The Unnamed, the Vael-Wreck Echo
- **Role label:** Wreck Ghost (Vael-touched, alien)
- **Station:** `poi_cruiser` (Derelict Cruiser, Io Reach)
- **Blurb:** "Clause—un—finished. Counterparty—un—known. Renegotiate." *(5 words, broken)*
- **Backstory:** The echo of a human crew that encountered the Vael and was renegotiated —
  their hull is intact, their contracts were rewritten, and what's left speaks in broken Vael
  clauses trying to complete a transaction with a counterparty that no longer exists. It is the
  ghost that shows the player what the Vael do.
- **Quest/faction hook:** Vael-lore NPC — interacting with the echo (requires Vael rep ≥
  neutral OR Dr. Suhl G3-a in tow) unlocks the Vael's "clause" mechanics (a recurring
  contract-negotiation encounter type). The echo is the Category-A1 first-contact warning made
  personal.
- **Voice register:** faction_vael — clause-numbered, alien contract-language, but fragmented
  and desperate; the Vael register broken by the human underneath trying to finish a sentence.

---

# CATEGORY H — CHANCE ENCOUNTER TEMPLATES (8 slots × 5 = 40 concepts)

SpaceFace ships **12 encounter archetypes** (`src/data/encounters.js` ENCOUNTERS): `pirate_toll`,
`ambush_snare`, `patrol_scan`, `bounty_hunter`, `claim_threat`, `named_hunter` (combat deck) +
`convoy_departure`, `trader_run`, `patrol_beat`, `distress_call`, `salvage_signal`,
`anomaly_whisper` (civilian deck). The "chance encounter / Easter egg / emergent story" layer is
thin. Category H adds **8 distinctive encounter TYPES** as spawnable templates.

Each candidate below matches the encounter-shape schema (`tier / deck / weight / zoneTypes /
script / pressureCost / cooldownS / gates / proximity / squad / bark / choices / timeoutChoice`)
in spirit, and declares its own trigger metadata the Naev way — the `encounterDirector` should
be able to spawn any of these from the `Trigger` field alone. Each uses **existing systems**
(`encounterDirector`, `scan`, `tether`, `comms`).

5 candidates per slot are GENUINELY DIFFERENT templates, not reskins.

---

## Slot H1 — Distress Fake-Out (seems like rescue; it's a trap — or vice versa)

The existing `distress_call` already does 60/40 genuine/bait. H1 templates are the *specialized*
variants — distinctive enough to be their own encounter types.

### H1-a — "The Bait That Was Genuine" (inverted fake-out)
- **Trigger:** Any sector, but only after the player has ignored ≥3 distress calls (memory-gated).
  Random spawn, low weight.
- **Setup:** A distress call that reads *exactly* like the pirate-bait pattern (`scan_tell_bait`
  false-positive: no pods, weapons-heat signature). But this time it's a genuine civilian whose
  ship was sabotaged to look like bait by the pirates hunting them.
- **Branches:** (1) **Ignore** — the ship dies; the player later learns (via Vonn G10-a news)
  it was genuine. (2) **Scan then assist** — the scan is misleading; only closing reveals the
  trap is *outside* (a real pirate pack waiting for the player to commit). (3) **Assist blind**
  — high risk, high reward; saves the civilian, triggers the ambush.
- **Reward/consequence:** Assisting grants unique rep (the civilian is connected — a DMC elder's
  kin). Ignoring sets a `cynic` flag that subtly changes later distress encounters.
- **Emotional target:** **regret** — the subversion of the player's learned instinct.

### H1-b — "The Quiet Distress" (no audio, just a beacon)
- **Trigger:** Quiet-influenced sectors (`sector_pallas_drift`, `sector_orcus_shadow`). Random,
  low weight. Requires `tech_long_range_survey`.
- **Setup:** No mayday audio — just a transponder pulse in the Quiet's coded pattern. It's a
  Quiet operative extraction disguised as a distress call. The "victim" is silent; the rescue is
  a handshake.
- **Branches:** (1) **Assist** — extract the operative (tether, silent docking); gain Quiet rep
  and a routing mission. (2) **Scan** — reveals Quiet transponder, opt-in. (3) **Report to
  Concord** — sell the operative's location (comms to `station_customs`); Quiet rep tanks,
  Concord rep up.
- **Reward/consequence:** Quiet rep OR Concord rep, never both. The operative may later appear
  as a contact (Wraith Kell G13-a tie-in).
- **Emotional target:** **intrigue** — the distress call as spy novel.

### H1-c — "The Distress Within the Distress" (nested trap)
- **Trigger:** Outlaw sectors (`sector_sker_haven`, `sector_kepler_scar`). Random, rare (major
  tier). `gates: { namedPool: false }`.
- **Setup:** A genuine distress call — but the "rescuers" already on scene are pirates running
  a second-layer con: they're pretending to rescue the civilian to lure the player into a
  three-way. The civilian is real, the rescuers are the trap.
- **Branches:** (1) **Assist the rescuers** — you become complicit in the con (the civilian is
  "rescued" into piracy). (2) **Scan all parties** — reveals the con; choose sides. (3) **Engage
  the rescuers** — combat to save the civilian from the rescuers; the civilian joins DMC-affiliated
  traffic.
- **Reward/consequence:** Each branch sets a different rep flag; the "complicit" branch unlocks
  Reach missions but sets a `cynic` graffiti line later.
- **Emotional target:** **dread** — everyone is lying, including the encounter.

### H1-d — "The Mass Distress" (fleet disaster)
- **Trigger:** Anomaly sectors (`sector_veil_nebula`, `sector_haumea_rift`). Rare, major tier.
  Requires B6+ story beat.
- **Setup:** A distress call from a *fleet* — 4-5 civilian ships, all failing simultaneously,
  all reporting different emergencies. It's not an attack; it's a phenomenon (the anomaly is
  disabling them). The "trap" is the anomaly itself.
- **Branches:** (1) **Triage** — save as many as possible (tether-and-tow, time-limited; you
  can't save all). (2) **Scan the phenomenon** — gather data (helps Dr. Doss G3-b); lose ships
  while scanning. (3) **Flee** — save yourself; the fleet is lost (news cycle covers it).
- **Reward/consequence:** Each ship saved is a rep gain with its faction; the data scan
  advances the anomaly storyline. The fleet's fate appears in Vonn's (G10-a) newsfeed either
  way.
- **Emotional target:** **helplessness** — the trap is physics, not malice.

### H1-e — "The Distress From Inside The Player" (Tessera's previous crew)
- **Trigger:** Only in `sector_helios_prime` near `poi_helios_yard`. Fires once, ever
  (`unique`). Requires B3+ and having visited the yard once before.
- **Setup:** The distress call is the Tessera's own previous-crew mayday, recorded 14 months
  ago, replaying on a loop from the wreck. The player hears Captain Vols (G15-a) calling for
  help that already didn't arrive. There is no rescue possible — the event already happened.
- **Branches:** (1) **Listen** — hear the full recording (unlocks Vols's echo dialogue). (2)
  **Board the wreck** — recover the black box (G15-a quest item). (3) **Leave** — the
  recording continues playing on a long loop after the player departs (ambient comms adds the
  mayday to rotation, quietly, as a ghost entry).
- **Reward/consequence:** The black box unlocks the Vols echo questline. The ambient mayday is
  the only "reward" for the Leave branch — a haunting. No combat, no credits.
- **Emotional target:** **grief** — the distress call that cannot be answered.

---

## Slot H2 — Alien First-Contact (Category-A1 alien vessel; peaceful or hostile based on player action)

The Vael are the existing alien faction; H2 introduces a *different* alien — Category-A1, the
precursor-warning species. Peaceful or hostile hinges entirely on player action at first contact.

### H2-a — "The Drifting Hull" (unknown alien vessel, derelict-ish)
- **Trigger:** Deep anomaly sectors (`sector_veil_nebula`, `sector_sedna_dark`). Very rare,
  major tier, unique-once. Requires `tech_long_range_survey`.
- **Setup:** A vessel of unmistakably alien design (not Vael — older, geometrically strange),
  drifting, transponder in an unknown protocol. It is not hailing. It is waiting to be hailed.
- **Branches:** (1) **Hail first (peaceful protocol)** — the vessel responds, slowly; first
  contact is peaceful, opens a slow-trade dialogue (they want precursor artifacts). (2) **Scan
  first** — the scan reads as hostile-ready (weapons not hot, but armed); the player can choose
  to hail or leave. (3) **Fire first** — the vessel defends, then flees; first contact is
  hostile, and the species becomes a rare ambient hostile thereafter.
- **Reward/consequence:** Peaceful: unlocks alien-trade missions (precursor artifacts for
  unique modules). Hostile: a new ambient threat and a loss-of-opportunity flagged in the
  ending epilogue. The choice is permanent.
- **Emotional target:** **awe** (peaceful) / **shame** (hostile) — the weight of first contact.

### H2-b — "The Translator" (alien trying to communicate)
- **Trigger:** `station_veil` space + Dr. Suhl (G3-a) quest active. Rare, minor tier.
- **Setup:** An alien probe broadcasting a pattern that resolves, after a scan, into an attempt
  at translation — it's trying to say "hello" in broken Vael clause-language (it encountered the
  Vael before humans did).
- **Branches:** (1) **Respond in Vael clauses** (requires Suhl's quest) — successful
  communication; the probe leads to a cache. (2) **Respond in human language** — confused
  exchange; partial reward. (3) **Destroy the probe** — the alien species logs humanity as
  hostile (sets a hidden flag that resolves at H2-a if encountered later).
- **Reward/consequence:** The cache contains a unique scan-tech module and one piece of the
  "Vael are not the only aliens" lore. Destroying it is the only way to fail H2-a's peaceful
  path before it begins.
- **Emotional target:** **wonder** — the joy of successful communication across the gap.

### H2-c — "The Nursery" (alien civilian fleet)
- **Trigger:** Frontier sectors (`sector_haumea_rift`, `sector_proteus_well`). Very rare,
  major tier.
- **Setup:** An alien fleet — clearly civilian (the equivalent of children, eggs, brooding
  hulls) — transiting through human space. They are not hostile. They are *afraid*. A Concord
  patrol is shadowing them, weapons warm.
- **Branches:** (1) **Escort the aliens out** — combat with the patrol (Concord rep tanks,
  alien species flagged friendly). (2) **Assist the patrol** — the aliens are driven off or
  destroyed (Concord rep up, Vale path opens, the species is lost). (3) **Mediate** (requires
  high rep with both) — peaceful passage; both sides thank the player; the species survives and
  Concord records a diplomatic win.
- **Reward/consequence:** The mediator path is the only one with no downside and unlocks a
  unique rep tier ("xenodiplomat"). The assist-patrol path locks the species out permanently.
- **Emotional target:** **moral gravity** — the encounter is a trolley problem in space.

### H2-d — "The Claim-Jumper" (alien staking a resource claim)
- **Trigger:** Mining sectors (`sector_charon_expanse`, `sector_rhea_cinder`) where the player
  has a claim. Rare, minor tier.
- **Setup:** An alien vessel is harvesting the player's claimed asteroid — not maliciously, but
  because their claim system doesn't recognize human beacons. They are confused, not hostile.
- **Branches:** (1) **Communicate the claim** — the alien respects it (after a tense scan),
  leaves, leaves a gift. (2) **Drive them off** — the alien flees, drops cargo; minor alien-rep
  flag. (3) **Destroy them** — the asteroid is reclaimed, but the species becomes hostile in
  this sector.
- **Reward/consequence:** The "communicate" branch unlocks a shared-claim mechanic (alien and
  player can co-mine certain belts). The destroy branch permanently raises alien hostility in
  mining sectors.
- **Emotional target:** **comedy of errors** → **choice** — it starts funny, it ends serious.

### H2-e — "The Refugee Fleet" (alien, fleeing something worse)
- **Trigger:** Anomaly sectors, B7+ story beat. Extremely rare, major tier, unique.
- **Setup:** A massive alien refugee fleet — civilian, wounded, fleeing — crosses the sector.
  They are running from something (a Vael incursion? a precursor event? the game doesn't say).
  They just want to pass through.
- **Branches:** (1) **Let them pass** (do nothing) — the fleet exits; later news confirms they
  reached safety; small rep gain with hidden "xenophile" flag. (2) **Aid them** (fuel, escort)
  — the fleet survives intact; unique alien-contact unlocks later. (3) **Report them** (to any
  human faction) — the fleet is intercepted; the reporting faction's rep rises, and the thing
  they were fleeing arrives a few sectors behind them (a new hostile ambient).
- **Reward/consequence:** The "aid" branch is the only path to the hidden alien-ally ending.
  The "report" branch *causes* the next threat — the encounter has consequences across the
  whole map.
- **Emotional target:** **mercy vs. fear** — the refugees are also a warning.

---

## Slot H3 — Ghost Ship (derelict drifting, no crew, logs tell a story — Category-D wreck hook)

`salvage_signal` is the existing ambient version. H3 templates are the *narrative* derelicts —
full ghost-ship stories.

### H3-a — "The Honest Hauler" (clean wreck, clean story)
- **Trigger:** Trade-lane sectors, random, ambient-tier.
- **Setup:** A derelict hauler, dead reactor, crew gone (evacuated, not killed). The black box
  tells a clean story: reactor failure, orderly evac, nobody's fault. The cargo is intact and
  claimable. It's the *baseline* ghost ship — the one that teaches the player the system without
  dread.
- **Branches:** (1) **Salvage cargo** (standard). (2) **Recover black box** (deliver to Old Pell
  G6-c for lore payout). (3) **Tow the hull** (to Slate G11-a for scrap value).
- **Reward/consequence:** Standard salvage + a small lore entry. No combat. The "teaching"
  derelict.
- **Emotional target:** **calm** — the ghost ship that isn't haunted.

### H3-b — "The Murder Wreck" (foul play)
- **Trigger:** Outlaw sectors, random, minor tier. `gates: { claimsOnly: false }`.
- **Setup:** A derelict whose black box tells a different story — the crew was killed, not by
  reactor failure but by boarders, and the boarders are still aboard (hostile, hiding). The scan
  reveals weapons-fire damage inconsistent with the "drift" pattern.
- **Branches:** (1) **Board** — combat with the boarders inside the wreck (tether-and-clear
  mechanic); recover the real cargo. (2) **Scan then board** — prepared; same combat, lower
  damage taken. (3) **Report and leave** — call in Concord (comms); they handle it; smaller
  reward, Concord rep.
- **Reward/consequence:** Boarding grants the murdered crew's cargo (high value) + a black box
  that names the boarders (a Reach crew — sets a vendetta flag).
- **Emotional target:** **dread** — the wreck that fights back.

### H3-c — "The Time-Shifted Wreck" (anomaly derelict)
- **Trigger:** Anomaly sectors only. Rare, minor tier.
- **Setup:** A derelict whose logs are from *the future* — a ship that hasn't been destroyed
  yet, echoing backward through the anomaly. The logs describe a battle that hasn't happened.
  The crew's voices are alive in the recording and confused. The ship itself is dead.
- **Branches:** (1) **Recover the logs** — the future-event is logged (may tie to a later
  encounter as foreshadowing). (2) **Scan the anomaly** — gather data (Doss G3-b, Yael G3-c
  quest). (3) **Attempt to warn the ship** (if it can be identified) — sets a flag that may
  change a future encounter.
- **Reward/consequence:** The logs are a unique lore item (precursor-anomaly exposition). The
  "warn" branch is a long-delayed payoff that may prevent a named-ace return encounter later.
- **Emotional target:** **temporal vertigo** — the ghost ship from tomorrow.

### H3-d — "The Cult Wreck" (Choir mass-suicide / ascension)
- **Trigger:** `sector_phoebe_echo` or Choir-influenced space. Rare, minor tier. Requires Choir
  rep awareness (neutral or better to fully resolve).
- **Setup:** A Choir vessel whose entire crew "ascended" — voluntarily flew into the anomaly,
  leaving the hull intact and empty. The logs are serene and disturbing. There is no combat; the
  dread is philosophical.
- **Branches:** (1) **Recover logs** — unlocks Choir "ascension" lore (Sister Lha G3-e quest).
  (2) **Deliver hull to Choir** — they revere it as a relic (Choir rep up massively). (3) **
  Destroy the hull** — the Choir records it as desecration (Choir hostile, but a hidden
  "defier" flag set that the precursor archive respects).
- **Reward/consequence:** The Choir-deliver branch unlocks a Choir-escort archetype. The
  destroy branch is the only way to set the "defier" flag for the precursor archive's approval.
- **Emotional target:** **sublime unease** — the ghost ship that wanted to be empty.

### H3-e — "The Wreck That Recognizes the Tessera"
- **Trigger:** Any sector, but only after B6. Very rare, unique-once.
- **Setup:** A derelict whose AI/computer recognizes the player's hull ID (VHL-4471-T) and hails
  *the player* on approach — it has records of the Tessera's previous run. The wreck's dead
  crew knew Captain Vols. The logs are a letter to the ship that outlived them.
- **Branches:** (1) **Read the letter** — emotional payout; changes the bulkhead graffiti
  (adds a line in Vols's hand). (2) **Recover the letter as cargo** (a persistent item,
  joins the Kurtz ledger and the 47-A sample). (3) **Ignore** — the wreck goes silent; the
  letter is lost.
- **Reward/consequence:** The letter is a persistent cargo item that changes the endgame
  Choice D dialogue (the player can read it at the Kurtz desk). The ignore branch sets a
  `cold` flag that removes one ending epilogue.
- **Emotional target:** **recognition** — the ghost ship that knows the player's ship.

---

## Slot H4 — Time Capsule (ancient buoy with a message from the precursor era)

Distinct from H3 (wrecks) — H4 is *buoys/beacons*, intentionally left messages, not accidents.
The `salvage_ping` bark register is the cousin.

### H4-a — "The Founder's Buoy" (intentional message, human, old)
- **Trigger:** Core sectors (`sector_helios_prime`, `sector_tethys_junction`), random,
  ambient-tier.
- **Setup:** A pre-Concord navigation buoy left by the sector's original settlers, broadcasting
  a message — a letter to the future, mundane and moving. "If you're hearing this, we made it."
- **Branches:** (1) **Listen** — lore payout (founding-era SettingBackstory). (2) **Deliver to
  archivist** (Halev G14-a) — he weathers it into the official record. (3) **Re-broadcast** —
  put it back on the air (adds the founder's voice to ambient comms permanently).
- **Reward/consequence:** The re-broadcast is a free, permanent worldbuilding addition. No
  combat, no downside.
- **Emotional target:** **warmth** — the time capsule that wanted to be found.

### H4-b — "The Warning Buoy" (precursor, dire)
- **Trigger:** Anomaly sectors and the approaches to Vael space. Rare, minor tier.
- **Setup:** A precursor buoy broadcasting a warning in a decoded (translatable) format — it
  says, roughly, "what you call the Vael is not what we called them; what we called them is not
  what they are." It's a warning that the Vael are a symptom, not the cause.
- **Branches:** (1) **Decode fully** (requires Suhl G3-a or the Living Archive G14-c) —
  unlocks the precursor-warning lore (required for peaceful H2-a first contact). (2) **Partial
  decode** — fragmentary lore. (3) **Destroy** — the warning is lost (the H2-a peaceful path
  becomes harder).
- **Reward/consequence:** The full decode is a keystone lore item. Destroying it is the only
  way to permanently lock the peaceful-alien path.
- **Emotional target:** **foreboding** — the time capsule that didn't want to be needed.

### H4-c — "The Confession Buoy" (someone's guilty record)
- **Trigger:** Frontier sectors, random, minor tier.
- **Setup:** A buoy left by a long-dead officer confessing to a specific atrocity — naming
  names, dates, and a cover-up code. It's evidence. It's been floating here for decades waiting
  to be heard.
- **Branches:** (1) **Deliver to Orrin** (G4-c) — feeds his case, Concord-internal-justice
  path. (2) **Deliver to Vonn** (G10-a) — she publishes it; scandal; Concord rep chaos. (3) **
  Destroy** — the cover-up holds (Vale path slightly easier).
- **Reward/consequence:** Each branch sets a different `confession` flag that resolves at
  endgame. This buoy is a single-decision story bomb.
- **Emotional target:** **the weight of evidence** — the time capsule as whistleblower.

### H4-d — "The Love Letter Buoy" (personal, not political)
- **Trigger:** Any sector, very rare, ambient-tier.
- **Setup:** A buoy left by a spacer for their partner — a love letter, intended to be found on
  a specific route on a specific date. The date is long past. The partner never came. The letter
  is still broadcasting.
- **Branches:** (1) **Listen** — pure story, no mechanic; the letter is good. (2) **Trace the
  partner** (via Yune G1-d) — the partner is dead (the route was the contested corridor). (3) **
  Re-seed the buoy** on the partner's grave route — closure; the letter stops; a graffiti line
  appears.
- **Reward/consequence:** No mechanical reward except a hidden `kindness` flag that subtly
  shifts ambient comms tone. The encounter's reward is itself.
- **Emotional target:** **tenderness** — the time capsule as grief.

### H4-e — "The Game Buoy" (Easter-egg / meta)
- **Trigger:** Deep fringe sectors (`sector_sedna_dark`, `sector_eris_margin`). Extremely rare,
  ambient-tier.
- **Setup:** A buoy broadcasting... a game. A puzzle, a riddle, a coordinates-hunt. It's a
  precursor (or very bored human) pastime left running. Solving it leads to another buoy, which
  leads to another — a multi-sector treasure hunt with no combat.
- **Branches:** (1) **Play** — follow the chain (4-6 sectors); each buoy has a small lore or
  novelty reward. (2) **Skip** — no penalty. (3) **Cheat** (scan reveals the final coordinates)
  — skip to the end; smaller reward.
- **Reward/consequence:** The final buoy contains a unique novelty module (cosmetic, e.g., a
  hull paint) and the "won the game" achievement. Pure delight.
- **Emotional target:** **play** — the time capsule as toy.

---

## Slot H5 — Faction-Secret Witness (player stumbles on an atrocity/cover-up — rep consequences)

This is the heaviest slot — the encounter that changes the player's whole playthrough based on
what they do with what they see.

### H5-a — "The Corridor Massacre" (Concord atrocity)
- **Trigger:** `sector_io_reach` contested space, B5+ story beat. Rare, major tier, unique.
- **Setup:** The player jumps in on the aftermath — civilian haulers destroyed, Concord patrol
  weapons-hot, a "theatrical pirate ambush" cover story being prepped over comms. The player
  has witnessed a Concord atrocity in progress. The patrol notices the witness.
- **Branches:** (1) **Flee silent** — you saw nothing (safer; the cover-up holds; small
  Concord rep up as "silence bought"). (2) **Record and publish** (deliver to Vonn G10-a) —
  the atrocity is exposed; Concord rep tanks; the Vale path closes; the Orrin path opens. (3)
  **Engage the patrol** — combat to stop the cover-up; Concord hostile permanently; the
  Filecleaver Dorin (G9-b) branch unlocks.
- **Reward/consequence:** This is the single encounter that determines the player's late-game
  faction alignment. There is no neutral outcome — witnessing forces a choice.
- **Emotional target:** **horror** — the witness that cannot un-see.

### H5-b — "The Quiet Disappearance" (Quiet extrajudicial)
- **Trigger:** Any station with a Quiet presence, B4+. Rare, minor tier.
- **Setup:** The player docks and notices a person being "relocated" by Quiet operatives —
  someone who knew too much is being vanished. The player is a witness by accident. The Quiet
  offers the player a courteous, terrifying "understanding."
- **Branches:** (1) **Accept the understanding** — say nothing (Quiet rep up; the disappeared
  person is gone). (2) **Intervene** — confront the operatives (Quiet rep tanks; the person is
  saved but becomes a target; Quiet Bride Aela G9-c branch unlocks). (3) **Document** —
  record quietly, decide later (the evidence can be delivered to Orrin or Vonn later for a
  delayed consequence).
- **Reward/consequence:** The Quiet is the most frightening faction to cross because it
  remembers. The "accept" branch subtly changes all future Quiet encounters (they trust you;
  they also expect more).
- **Emotional target:** **complicity** — the witness who is offered a cut.

### H5-c — "The Reach Slave Hold" (Reach atrocity)
- **Trigger:** `sector_sker_haven`, requires Sker Bazaar access (Reach rep). Rare, major tier.
- **Setup:** Behind the bazaar, in a secured bay, the player finds captive crew — pressed labor
  for the Reach syndicate. The captives beg silently. The Reach expects the player to understand
  and look away.
- **Branches:** (1) **Look away** — the bazaar stays open; the captives stay (Reach rep up).
  (2) **Free the captives** — combat with the bazaar guards; Reach rep tanks permanently; the
  captives join DMC-affiliated traffic (a visible population shift). (3) **Buy the captives**
  — pay their "debt" to free them legally (credits; Reach rep neutral; the captives are free
  but the system is unchanged).
- **Reward/consequence:** The "free" branch is the most expensive combat in the game but
  unlocks the Mother Kael (G6-b) "buried count" reduction and the unambiguously-good epilogue
  flag.
- **Emotional target:** **revulsion** — the witness inside the marketplace.

### H5-d — "The Meridian Debt Trap" (economic atrocity)
- **Trigger:** `station_dione` or Meridian-influenced space, B4+. Minor tier.
- **Setup:** The player witnesses a Meridian "debt resolution" — a frontier family's ship and
  claim seized for a debt structurally designed to default. It's legal. It's ruin. The family is
  being "humanely relocated" off their rock.
- **Branches:** (1) **Buy their debt** (credits) — you now own their claim (they stay as
  tenants or you free it). (2) **Contest the debt legally** (requires Orrin G4-c tie-in) —
  slow, may fail, but if it succeeds it sets a precedent (Meridian rep down, frontier rep up
  across all sectors). (3) **Ignore** — the default proceeds; the family is gone next visit.
- **Reward/consequence:** The "buy" branch gives the player a real-estate asset (a claim that
  pays out slowly). The "contest" branch is the only way to change the Meridian economy
  systemically.
- **Emotional target:** **cold anger** — the witness as Foreclosure.

### H5-e — "The Choir Conversion" (the slow atrocity)
- **Trigger:** `sector_phoebe_echo` or any Choir-influenced station. Rare, minor tier.
- **Setup:** The player witnesses a Choir "ascension event" — not a murder, but a community
  voluntarily dissolving itself into the Pattern, walking into ships that will fly into the
  anomaly. They are not forced. They are not saved, either.
- **Branches:** (1) **Observe** — document it (deliver to Suhl G3-a or Halev G14-a as
  anthropology). (2) **Intervene** — try to talk them out of it (a comms-puzzle; success
  requires high faction_free rep). (3) **Join** — the player can, disturbingly, choose to let
  the Tessera be "ascended" (a secret bad-ending flag).
- **Reward/consequence:** The "join" branch is the game's hidden self-destruct ending — the
  Tessera flies into the anomaly and the run ends. The "intervene" success unlocks a unique
  defier rep with the Choir's schismatic minority.
- **Emotional target:** **the sublime and the wrong** — the witness who can't tell if it's a
  tragedy or a sacrament.

---

## Slot H6 — Two-Faction Battle in Progress (player picks a side or waits to salvage)

The existing `convoy_departure` and `patrol_beat` are single-faction. H6 is the *collision* —
two factions already fighting when the player arrives.

### H6-a — "The Patrol Ambush" (Concord vs. Reach, in progress)
- **Trigger:** Contested sectors (`sector_io_reach`, `sector_pallas_drift`). Random, minor tier.
- **Setup:** A Concord patrol and a Reach pirate pack are mid-battle when the player jumps in.
  Both sides hail the player for aid. The battle is roughly even; the player tips it.
- **Branches:** (1) **Aid Concord** — the patrol wins (Concord rep up; the Reach loot is
  claimable post-battle). (2) **Aid Reach** — the pirates win (Reach rep up; the Concord loot is
  claimable; Concord rep tanks). (3) **Wait** — let them finish, then salvage the winner's
  losses (no rep change, but the winner is weakened and hostile to the vulture).
- **Reward/consequence:** The "wait" branch is the highest-loot, highest-risk (the winner turns
  on the player). The faction-choice branches are clean rep trades.
- **Emotional target:** **opportunism** — the encounter as auction.

### H6-b — "The Convoy Raid" (Meridian convoy vs. Reach, in progress)
- **Trigger:** Trade-lane sectors, random, minor tier. Requires the convoy to be present
  (ties to `convoy_departure`).
- **Setup:** A Meridian convoy is mid-raid by Reach when the player arrives. The convoy's escort
  is losing. The cargo is scattering.
- **Branches:** (1) **Guard the convoy** (extend the `convoy_departure` guard mechanic) —
  Meridian rep up, guard pay. (2) **Join the raid** — Reach rep up, cargo share. (3) **Salvage
  the scatter** — grab loose cargo while both sides are busy (no rep change, contraband flag if
  Meridian-sealed cargo is taken).
- **Reward/consequence:** The "salvage" branch is the smuggler's favorite — high value, high
  risk of both sides turning on the player.
- **Emotional target:** **greed under fire** — the encounter as looting.

### H6-c — "The Border War" (two major factions, full fleet action)
- **Trigger:** Border sectors (`sector_tethys_junction` approaches, `sector_dione_lane`).
  Rare, major tier.
- **Setup:** A full fleet engagement — Concord + Meridian vs. Reach + Choir, or similar large-
  scale pairing. This is the "war" encounter; the player is a small ship in a big battle.
- **Branches:** (1) **Pick a side and contribute** (kill counts toward the chosen faction's
  victory). (2) **Focus on the objective** — a specific ship (a cargo hauler, a VIP) the player
  can save/kill regardless of faction. (3) **Flee** — the battle is too big; the player extracts
  (the battle resolves offscreen per the player's earlier reputation).
- **Reward/consequence:** The outcome shifts sector `security` values slightly (a visible
  world-state change — the border moves). The VIP branch can introduce a named NPC (a fleeing
  administrator, a captured scientist).
- **Emotional target:** **insignificance** — the encounter as weather.

### H6-d — "The Civil Dispute" (intra-faction, DMC miners vs. DMC miners)
- **Trigger:** Mining sectors (`sector_ceres_belt`, `sector_charon_expanse`). Random, minor
  tier.
- **Setup:** Two DMC crews are fighting over a contested claim — not a war, a labor dispute with
  weapons. It's embarrassing for everyone. The player arrives as the "neutral third."
- **Branches:** (1) **Mediate** (comms-puzzle; requires understanding the claim system) —
  peaceful resolution; both crews thank the player; DMC rep up. (2) **Back one side** — the
  other crew is driven off (DMC rep neutral; one crew's gratitude). (3) **Claim-jump both** —
  take the asteroid while they're busy (DMC rep tanks; high ore reward).
- **Reward/consequence:** The mediate branch unlocks the DMC's "union favor" (better claim
  priority). The claim-jump is the Renz G13-b tie-in (Reach mole approves).
- **Emotional target:** **awkward jurisdiction** — the encounter as small-stakes drama.

### H6-e — "The Vael Enforcement" (Vael vs. anyone, terrifying)
- **Trigger:** Vael-influenced space (`sector_ashfall_reach`, frontier Vael borders). Very rare,
  major tier.
- **Setup:** A Vael enforcement fleet is "renegotiating" a human faction's presence —
  clause-by-clause, weapons-hot. The human faction (Reach, Meridian, even Concord) is losing
  badly. The Vael are not negotiable.
- **Branches:** (1) **Aid the humans** — the Vael turn on the player too (Vael rep tanks;
  human-faction rep up). (2) **Stay out of it** — the humans lose; the Vael take the sector
  (visible security shift). (3) **Obey the Vael clauses** (comms-puzzle; requires Vael rep) —
  the player is permitted to leave; the humans are not.
- **Reward/consequence:** The "obey" branch is the only peaceful resolution and unlocks a Vael-
  favor rep tier. It is also the moral-cost branch — you leave people to the Vael.
- **Emotional target:** **alien indifference** — the encounter as force majeure.

---

## Slot H7 — Lost-Ship Reunion (an NPC from a prior encounter returns — memory-driven)

This is the ace-memory pattern (`namedAces.js` `aceMemory`) generalized to non-combat NPCs. The
encounter *remembers* and *returns*.

### H7-a — "The Saved Captain Returns" (distress-call callback)
- **Trigger:** Any sector, but only after the player has successfully rescued a genuine distress
  victim (H1 / `distress_call`). The rescued captain's seed is stored.
- **Setup:** The captain the player saved returns — now flying a better ship, now in a position
  to help (or threaten). They hail the player by name. They remember.
- **Branches:** (1) **Accept their aid** — they join as a temporary wingman or offer a discount
  at their faction. (2) **Refuse** — they're offended; the relationship cools. (3) **Ask what
  happened after** — lore payout (the rescue changed their life; they tell the player how).
- **Reward/consequence:** The reunion is its own reward — the player sees the consequence of
  their help. Refusing sets a `cold` flag that removes future reunions.
- **Emotional target:** **gratitude** — the encounter as thank-you.

### H7-b — "The Spared Bounty Returns" (G9 callback)
- **Trigger:** Any sector, after the player has spared a bounty target (G9). The spared NPC's
  seed is stored.
- **Setup:** The bounty target the player spared returns — either as an ally (the moral-choice
  paid off) or as a vengeful recurring enemy (the mercy was wasted). Which one is seeded at the
  moment of sparing, not revealed until now.
- **Branches:** (1) **If ally** — they offer a unique mission (the one their survival made
  possible). (2) **If vengeful** — combat; they're stronger now (named-ace escalation rule). (3)
  **Either: ask why** — the answer changes based on the player's cumulative moral choices
  (a `mercy` score).
- **Reward/consequence:** The ally branch unlocks content no other path provides. The vengeful
  branch is a meaningful combat challenge tied to the player's own prior decision.
- **Emotional target:** **vindication or regret** — the encounter as mirror.

### H7-c — "The Sold-Out Contact Returns" (betrayal callback)
- **Trigger:** Any sector, after the player has sold a contact's location or secret (e.g.,
  reported Wraith Kell G13-a, sold the Archivist's G13-d intel).
- **Setup:** The contact the player sold out returns — alive, changed, and aware it was the
  player. They don't attack; they confront. The encounter is a conversation.
- **Branches:** (1) **Apologize** — they may forgive (based on rep and mercy score) or not. (2)
  **Deny** — they know the truth; the denial makes it worse. (3) **Pay them off** — credits;
  they take the money and warn the player never to cross them again.
- **Reward/consequence:** The apologize branch is the only way to restore the relationship; the
  deny branch permanently closes it and may spawn future hostility.
- **Emotional target:** **shame** — the encounter as accusation.

### H7-d — "The Rival's Rematch" (G2 callback)
- **Trigger:** After the player has fought a rival (G2) and either won or escaped.
- **Setup:** The rival returns, upgraded (named-ace escalation), with a new gimmick or escort
  count. They've been training. The rematch is harder.
- **Branches:** (1) **Fight** — standard combat, higher tier. (2) **Talk first** — they may
  offer a non-combat resolution (a race, a wager, a mutual-aid pact) depending on the rival's
  personality. (3) **Flee** — they note it and return again, stronger (the rivalry escalates).
- **Reward/consequence:** The non-combat resolutions (unique per rival) are the reward for
  engaging with the rival's character rather than just fighting.
- **Emotional target:** **familiarity** — the encounter as recurring frenemy.

### H7-e — "The Ghost Returns" (G15 callback)
- **Trigger:** After the player has interacted with a wreck-ghost (G15) and either completed or
  abandoned their business.
- **Setup:** The ghost's echo reappears — not at the wreck, but in the player's own comms
  (channel bleed). The ghost has a new line, a follow-up, based on whether the player finished
  their quest. The encounter is pure dialogue.
- **Branches:** (1) **Listen** — the ghost's resolution (peaceful, mournful, or, if the quest
  was abandoned, accusatory). (2) **Answer** — the player can say something back (rare in
  SpaceFace; the ghost is the one NPC who hears). (3) **Silence the channel** — the ghost is
  gone for good.
- **Reward/consequence:** The "answer" branch is the only place the player speaks in
  SpaceFace's dialogue — and what they say (a choice from a few typed options) changes the
  ghost's final line and the bulkhead graffiti.
- **Emotional target:** **closure or its absence** — the encounter as farewell.

---

## Slot H8 — Phenomenon / Anomaly Drift (space event: wormhole flicker, mass-flash, sensor-ghost swarm)

The existing `anomaly_whisper` is the cousin — ambient, atmospheric. H8 templates are *visible,
interactive* phenomena.

### H8-a — "The Wormhole Flicker" (transit anomaly)
- **Trigger:** Anomaly sectors (`sector_veil_nebula`) and any sector with a wormhole POI.
  Rare, minor tier. Requires `tech_long_range_survey` to fully interact.
- **Setup:** The wormhole flickers — opens briefly to an unknown destination, then closes. The
  player can see something on the other side (a sector that doesn't exist on the map). The
  flicker is on a schedule (Doss G3-b's research).
- **Branches:** (1) **Jump through during the flicker** — arrive at an unmapped micro-sector
  (a single POI, a precursor relic, then return). (2) **Scan the schedule** — gather data
  (predict future flickers; Doss quest). (3) **Wait and watch** — the flicker passes; a sensor
  ghost crosses the threshold (ambient worldbuilding).
- **Reward/consequence:** The jump-through is a one-time visit to a unique micro-sector with a
  unique relic. The scan enables repeatable prediction (a fast-travel shortcut once decoded).
- **Emotional target:** **temptation** — the phenomenon as door.

### H8-b — "The Mass-Flash" (gravity anomaly)
- **Trigger:** Any sector, but more common in dense fields (`sector_ceres_belt`,
  `sector_charon_expanse`). Random, ambient-tier.
- **Setup:** A point in space briefly gains enormous mass — asteroids yank toward it, the
  player's ship pulls — then releases. It's a gravity hiccup, cause unknown. It's dangerous and
  it's data.
- **Branches:** (1) **Ride it** (position carefully) — the slingshot flings the player across
  the sector fast (a free speed boost). (2) **Scan it** — gather data (Yael G3-c quest; anomaly
  physics lore). (3) **Avoid it** — safe; the flash resolves.
- **Reward/consequence:** The ride is a skill-check (positioning) with a movement reward. The
  scan advances the anomaly-physics storyline. No combat.
- **Emotional target:** **thrill** — the phenomenon as ride.

### H8-c — "The Sensor-Ghost Swarm" (false contacts)
- **Trigger:** Nebula and radiation sectors (`sector_veil_nebula`, `sector_vesta_forge`).
  Random, ambient-tier.
- **Setup:** Dozens of false contacts flood the scanner — ships that aren't there, hailing in
  voices from the ambient-comms pool, then fading. It's the anomaly mocking the player's own
  radio. Some ghosts quote the player's past encounters back at them.
- **Branches:** (1) **Investigate the strongest signal** — leads to a small cache (the one real
  contact among the ghosts). (2) **Log the ghosts** — deliver the recording to Yael G3-c (she
  treats it as proof of her "echoes of future ships" theory). (3) **Ignore** — the swarm fades;
  no effect.
- **Reward/consequence:** The strongest-signal branch is a low-stakes loot pinata. The log
  branch is pure lore (Yael's theory confirmed or complicated).
- **Emotional target:** **uncanny** — the phenomenon as mirror.

### H8-d — "The Mass Migration" (space-life event)
- **Trigger:** Any sector, rare, minor tier. More common in frontier sectors.
- **Setup:** A vast migration of... something — spaceborne life, energy creatures, nonsentient
  anomalies — crosses the sector. They are not hostile. They are beautiful. They disrupt
  sensors and engines while passing.
- **Branches:** (1) **Watch** — the player's sensors go quiet, engines dampened, for the
  duration (a forced moment of stillness; the game makes you stop). (2) **Scan** — gather
  biological/anomalous data (Suhl G3-a quest; a unique lore payout). (3) **Fly through them**
  — risky (hull damage from the migration's energy) but fast (a shortcut).
- **Reward/consequence:** The "watch" branch is the game's only mandatory pause — a meditative
  beat. The scan unlocks the "space-life" SettingBackstory. No combat.
- **Emotional target:** **wonder** — the phenomenon as cathedral.

### H8-e — "The Echo of the Player" (anomaly quotes the Tessera)
- **Trigger:** Anomaly sectors, B7+ story beat. Extremely rare, unique-once.
- **Setup:** The anomaly broadcasts the Tessera's own signature back at it — the player's ship
  appears on scanner as a second contact, flying a mirror course. The "echo" hails in the
  player's own comms ID. It is the anomaly (or the precursor archive, or the Vael) showing the
  player themselves.
- **Branches:** (1) **Match the echo** (fly the mirror course perfectly) — a skill-check
  dialogue; the echo "syncs" and reveals one secret about the Tessera's previous crew (Vols
  G15-a tie-in). (2) **Break the mirror** (tether or fire on the echo) — the echo shatters
  into the sensor-ghost swarm (H8-c tie-in). (3) **Answer the hail** — the echo says, in the
  player's transponder ID, one line the player chose in a prior dialogue (the game remembers).
- **Reward/consequence:** The match branch unlocks the deepest Tessera-history lore. The answer
  branch is the game's only place the player's own prior choice is spoken back to them — the
  encounter as self-recognition.
- **Emotional target:** **the sublime self** — the phenomenon as mirror of the player.

---

# End-of-document notes

**Coverage check vs. the 15 NPC slots:** G1 broker (5), G2 rival (5), G3 scientist (5), G4
disillusioned officer (5), G5 kingpin (5), G6 scavenger elder (5), G7 AI emissary (5), G8
precursor caretaker (5), G9 bounty-target-ally (5), G10 journalist (5), G11 shipyard engineer
(5), G12 refugee (5), G13 saboteur (5), G14 historian (5), G15 ghost (5) = **75 NPC concepts.**

**Coverage check vs. the 8 encounter slots:** H1 distress fake-out (5), H2 alien first-contact
(5), H3 ghost ship (5), H4 time capsule (5), H5 faction-secret witness (5), H6 two-faction
battle (5), H7 lost-ship reunion (5), H8 phenomenon drift (5) = **40 encounter concepts.**

**Total: 115 concepts.**

**System fit.** Every encounter uses existing systems: `encounterDirector` (scheduling),
`scan` (reveal branches), `tether` (boarding/towing), `comms` (hails, choices). Every NPC uses
existing `card()` shape (id/name/roleLabel/stationHint/blurb) and the `aceMemory`/`namedCaptain`
persistence where the NPC is recurring. Every voice maps to one of the 8 `barks.js` registers
(or a clearly-described hybrid/new register for AIs and precursors). Every station id cited is
real in `sectorAnchors.js` / `sectors.js` / `frontierRegions/*`.

**Blurb discipline.** All G-category blurbs held to the 12-word `MAX_CONTACT_BLURB_WORDS`
spirit; most are 6-9 words. Comms branches in H-category held to the 12-word
`MAX_COMMS_WORDS` spirit where a bark is implied.
