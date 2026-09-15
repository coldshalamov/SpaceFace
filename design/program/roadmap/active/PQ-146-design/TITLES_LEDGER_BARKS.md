# SpaceFace PQ-146 — Titles, ledger and barks

**Design revision:** 1.0 · 14 September 2026  
**Status:** Proposed narrative, witness and persistence contract.  
**Principle:** The Crucible scores the performance. Adventure remembers the incident.

## 1. Adventure's presentation contract

There are **no flight score popups, numeric style multipliers, floating trick labels, reputation progress bars or credit awards for stunts**. Physical impact feedback remains. The pilot can later read a specific ledger incident; qualified NPCs may react through the ordinary radio/bark channel; titles appear in the ship's ledger, dossier and appropriate dialogue.

A compact radio transcript is dialogue, not a score notification. It should still obey the player's transcript setting and the normal warning priorities. Title acquisition does not require a modal screen. The ship's record can become extraordinary without its cockpit becoming a slot machine.

Three statuses keep the world honest:

| Status | What is known | Where it appears |
|---|---|---|
| **Black-box verified** | The player's recorder has the complete causal chain | Private ledger; no public title claim or omniscient NPC bark |
| **Witnessed** | An external observer actually saw the attributable manipulation and payoff | Ledger witness section; immediate local reaction; title may become known locally |
| **Reported** | A qualified observer or station actually transmitted/received the report | Faction/port dossier and downstream NPC recognition within that information network |

The taxonomy's “no trick without consequence” rule applies to all three. A witness cannot turn a speculative event into a physical truth. A private true event does not imply that every bartender in the system has heard of it.

## 2. What counts as witnessing

### 2.1 Observer classes and range

These are proposed sensor/visual witness ranges, in world units, not camera pixels. The observer's identity and current sensor functionality matter.

| Observer | Maximum direct observation range | Can create an immediate spoken reaction? | Can spread reputation? |
|---|---:|---|---|
| Civilian, hauler, miner, courier, survivor | 180 WU | Yes, if alive and communications function | Only after an actual report transmission |
| Pirate/hostile pilot | 220 WU | Yes, including alarm or anger | Its own faction after transmission; not universal acclaim |
| Patrol or rescue craft | 300 WU | Yes | Its organization after a delivered report |
| Staffed station sensor / dispatcher | 450 WU | Yes, through an identified dispatcher | Its port/network after the observation is recorded |
| Unstaffed black box / unattended camera | 300 WU | No fabricated live speaker | Only after data are actually recovered or relayed |
| Player's own ship, deployed player camera or self-owned drone | Its legitimate sensor range | No NPC endorsement | Private proof only; self-witness is not independent reputation |

A dead victim cannot endorse its own destruction afterward. A distress transmission sent before death can preserve the parts it really observed. A surviving target can be a witness, but hostility affects its wording, not the observed facts.

### 2.2 Required observation coverage

For a **Bolas kill**, a witness must identify the player as the loaded-constraint actor, observe the release/trajectory transfer, and observe the struck victim's destruction. Observations may occur at different moments within the **8.0 s causal episode**; simultaneous visibility of the whole history is unnecessary. Each pivotal moving stage needs at least **0.10 s** of unobstructed observation across actual physics samples. A single fleeting light flash is not a witness.

Solid terrain, hulls and station geometry occlude observation. Lines themselves, decorative particles and visual bloom do not. Smoke/jamming affects sensing only where the underlying world already treats it as sensor-blocking. Do not turn a graphics-quality setting into a reputation advantage. An observer hidden behind an asteroid cannot see through it because the camera can.

If an observer sees only the final collision, it may bark about that collision without crediting the player, naming Bolas or awarding a player title. A root and an unexplained distant explosion are not a complete witnessed chain.

For long chains, combine at most **eight independent witnesses' explicitly transmitted segment reports** into a public incident. Shared body/root identities must join the segments. Without a delivered join, use only the complete portion an individual actually knows. A bark may say “You threw one into two more” only if its speaker has observation/report coverage for all three consequences. Otherwise it says “You threw that ship into its wingman.” No omniscient Collateral ×N callout.

### 2.3 Public acquisition versus later recognition

A title can be acquired as **locally witnessed** immediately after its qualifying observation, allowing the witness to use it in the same conversation/session. It becomes known to other NPCs only after a delivered report reaches their information network. Records store which network knows what and when.

Later encounter recognition requires the NPC to have legitimate player/ship identity plus knowledge of the title's cited incident. Recognition does not require another trick. Changing paint does not erase known transponder identity; changing ships does not automatically carry a ship-specific title to an unrelated hull. Each title states whether it belongs to the **pilot**, **ship**, or both; the initial set defaults to the pilot performing the incident in the recorded ship.

## 3. Titles people might actually use

These are nicknames that sound plausible over a radio, not achievements recited as marketing copy. One first witnessed accomplishment should receive an immediate human response; mastery titles can then depend on repetition across genuinely separate incidents. An “incident” here is a unique settled physical episode, not every hit or ledger row.

| Title | Physical qualification; all qualifying incidents externally witnessed | Scope | First-use or recognition bark |
|---|---|---|---|
| **Knotmaker** | One Bolas kill | Pilot + incident ship | “Knotmaker. You tied that fight off nicely.” |
| **Wrecker** | Two Wrecking Ball material payoffs against distinct hostiles in distinct incidents | Pilot | “Give Wrecker room. That's not spare cargo.” |
| **Linebreaker** | One Clothesline kill with proved line interception and follow-on collision | Pilot | “Linebreaker put a rope where his exit used to be.” |
| **Chain Artist** | One Collateral ×3 or greater hostile consequence chain | Pilot | “Chain Artist. One mistake, three wrecks.” |
| **Close Shave** | Three qualified Near-miss escapes against distinct threat episodes; at least two encounters | Pilot | “Close Shave's still flying. Somehow.” |
| **Tow Terror** | Two Tow-kills in distinct incidents | Pilot | “Don't let Tow Terror get a line on you.” |
| **Rock Tutor** | Three Rock Discovery material payoffs, distinct victim lives, at least two incidents | Pilot | “Rock Tutor's giving another lesson.” |
| **Well Digger** | One Well Golf kill with proved entry and exit | Pilot | “Well Digger used the gravity. Watch the far side.” |
| **Graverigger** | One Dead Man's Mass kill; post-death manipulation confirmed | Pilot | “Graverigger just put that wreck back to work.” |
| **Razorhand** | Two consequence-linked razor releases in distinct incidents; at least one combat payoff | Pilot | “Razorhand. I saw when you cut it.” |
| **Banker** | Two Bank Job kills with different actual bank corridors | Pilot | “Banker's here. Cover's not a guarantee.” |
| **Return Address** | One Return to Sender kill of the original attacker | Pilot | “Return Address. It came back with your name on it.” |
| **Blast Rider** | One Kickstart with a verified escape or momentum-spending combat payoff | Pilot + incident ship | “Blast Rider rode the blast clear.” |
| **Needle** | One Needle Thread escape, with both moving boundaries and pursuit witnessed | Pilot | “Needle went through that. Don't ask me how.” |
| **Second Thought** | One One-Two kill; the second intervention changed the eventual target corridor | Pilot | “Second Thought changed its mind halfway there.” |
| **Slingwright** | One Slingshot Golf kill with full rope–field–impact observation coverage | Pilot | “Slingwright. Rope, well, wreck. I saw the whole thing.” |

Titles are **not power buffs, damage bonuses, universal reputation boosts or kill-pay modifiers**. They affect recognition, dialogue and contextual social expectations. A hauler might fear a famous physics ace who damages convoys. A pirate might admire the same skill that a patrol records as reckless endangerment.

A first witnessed act that has not yet met a multi-incident title threshold still gets a truthful situational bark. No visible “1/3 title progress” counter is needed in flight; the ledger may show “two witnessed incidents” if the player opens its history.

### 3.1 Selection and overuse

Use at most one nickname in a single bark. Prefer a title relevant to the present incident, then the NPC's own witnessed incident, then a title its network knows. A speaker uses a title no more than once per encounter and repeats the same exact line no more than once in three encounters.

Select wording deterministically from the settled incident, observer identity and dialogue-history position. Wording cannot alter gameplay state or consume unseeded simulation randomness. The most extravagant title is not always the most human thing to say.

## 4. Bark bank: tone follows the speaker's stake

| Situation | Ally / rescuer | Civilian / worker | Hostile / law |
|---|---|---|---|
| Bolas | “You threw him into his own wingman.” | “That was a ship. You threw a ship.” | “Break the line! Don't bunch up!” |
| Wrecking Ball | “Keep the heavy end moving.” | “That's our ballast. Was our ballast.” | “Stay outside the swing.” |
| Clothesline | “You closed his escape lane.” | “Watch the cable. Watch the cable!” | “Line across the corridor. Go wide.” |
| Collateral | “Three contacts. One throw.” | “Now the loading lane's gone.” | “Spread out. You're feeding the chain.” |
| Close Shave | “Clear. Barely.” | “I thought you were gone.” | “Missed. Reacquire.” |
| Tow-kill | “Dragged him all the way in.” | “Please don't tow that past us.” | “Cut the tether before the wall!” |
| Rock Discovery | “The rock won.” | “That lane was marked.” | “Terrain strike. Ship disabled.” |
| Well Golf | “The well carried it around.” | “It's coming out the other side.” | “Don't sit on the exit tangent.” |
| Dead Man's Mass | “That wreck still had one job left.” | “We're charging twice for that tow.” | “Debris is being used as a weapon.” |
| Razor Release | “Perfect cut.” | “You let go just in time.” | “Released body inbound.” |
| Bank Job | “Nice bank. He thought he had cover.” | “Shots are coming around the block.” | “Change cover. That angle's compromised.” |
| Return to Sender | “That one was theirs.” | “Did that just turn around?” | “Own ordnance returning!” |
| Kickstart | “You used the blast to leave.” | “That's one way to clear the dock.” | “Blast-propelled departure. Track the exit.” |
| Needle Thread | “You fit. That's the important part.” | “There wasn't a gap a second ago.” | “Don't follow that line.” |
| One-Two | “You corrected it in flight.” | “It was going the other way.” | “Second impulse. New trajectory.” |
| Slingshot Golf | “You handed it from rope to gravity.” | “The well threw it back out.” | “Track the whole path, not the release.” |

Only speak numbers or ownership claims the witness knows. A frightened worker does not congratulate the destruction of their own workplace. The small dry joke belongs after the event, not on top of an incoming missile warning.

### 4.1 Same-session bark delivery

After a qualifying witnessed payoff, make one situational/title bark eligible within **0.5 simulation seconds**. Prefer the witnessing speaker. If it cannot speak, a dispatcher may relay only a genuinely delivered report.

Urgent player-danger/law instructions outrank style commentary. Use the first natural radio opening of at least **1.2 s**, with a target start within **10 s** of the event. If pressure prevents that, keep a first-discovery bark pending for the next safe/aftermath opening, at most **60 active simulation seconds**; ordinary repeated commentary expires after 12 s. The specific proof scenario includes a safe opening, so witnessed Bolas must actually receive its bark in that session—not just enter a queue.

Global stunt commentary cap: **one bark per 8 s**, at most **three per rolling 60 s**, and one queued bark per incident. A queue has at most **eight incidents**, favoring first witnessed discoveries and consequential law/aftermath, not score magnitude. With voice muted, ordinary radio transcript may carry the same text; with both channels disabled, record “suppressed by player setting,” not “heard.” User suppression must never remove the ledger or title.

## 5. Ledger: specific enough to reconstruct the incident

### 5.1 Entry template

**[Local date/time] · [site / sector] · [player ship at incident]**  
**[Primary trick] [optional consequence modifier] — [plain outcome].**  
**Chain:** [actor and tool] → [body and transformation] → [intermediate contact/field] → [victim and physical result].  
**Observed:** [witness names/roles], [direct / relayed / black-box only], [coverage summary].  
**Aftermath:** [only actually recorded cargo, rescue, law or property consequences].  
**Identity:** [stable incident identifier]; [evidence/rules revision]; [reported-network status].

No style points or invented legal conclusions appear in the prose. Preserve proper names as incident-time snapshots so a later rename does not rewrite history. A “kill” requires canonical death; otherwise say “disabled,” “damaged,” or “knocked off course,” matching the actual receipt.

### 5.2 Reusable lines

| Trick | Ledger sentence template |
|---|---|
| Bolas | “Swung [payload ship] on a loaded Massline and released it into [victim]; [confirmed outcome].” |
| Wrecking Ball | “Kept [object] on the line and swung it through [victim]; [confirmed outcome].” |
| Clothesline | “Moved a taut line across [victim]'s route; the interception sent it into [surface/body].” |
| Collateral | “The same chain caused material outcomes on [N named/identified bodies]; [known outcomes].” |
| Close Shave | “Redirected around [identified attack/body] at [clearance] and escaped [identified pursuit].” |
| Tow-kill | “Towed [victim] into [surface] while the line remained loaded; the impact destroyed the ship.” |
| Rock Discovery | “Redirected [victim] into [terrain]; impact at [normalized closing speed] caused [outcome].” |
| Well Golf | “Sent [payload] through [field]; its curved exit struck [victim/surface].” |
| Dead Man's Mass | “Repositioned the wreck of [former ship] after its destruction and used it against [victim].” |
| Razor Release | “The consequential release of [payload] was recorded as razor; its trajectory led to [outcome].” |
| Bank Job | “Established a bank from [surface] into [victim] behind [cover]; the direct line did not reach it.” |
| Return to Sender | “Redirected [attacker]'s [ordnance] back into that attacker; [confirmed outcome].” |
| Kickstart | “Used [charge]'s impulse to accelerate out of [threat], retaining the gained speed through [escape/payoff].” |
| Needle Thread | “Corrected through the closing gap between [A] and [B] and escaped [pursuit].” |
| One-Two | “Redirected [payload] twice; the second intervention changed its path into [terminal target].” |
| Slingshot Golf | “Released [payload] from a loaded swing into [well]; the curved exit caused [terminal outcome].” |

Modifiers extend one incident entry rather than filling the 240-entry ledger with aliases.

### 5.3 Complete witnessed example

**Local cycle 188.42 · Refinery approach · ship: Wayward**  
**Bolas · Collateral ×2 — one pirate destroyed, one disabled.**  
**Chain:** Wayward loaded a Massline on pirate Aster-6 → swung and released Aster-6 → Aster-6 struck pirate Hound-2 → Hound-2 was destroyed; Aster-6 lost helm for 1.4 s and 32% hull.  
**Observed:** hauler captain Mara Venn, direct source/release/impact coverage.  
**Aftermath:** Mara transmitted the incident to Refinery Control. Patrol response is recorded separately when it actually occurs.  
**Recognition:** “Knotmaker,” locally witnessed and reported to Refinery Control.

These names are illustrative fiction, not claims about current NPC content. If the actual tape shows only one material terminal, the modifier is omitted. The observer cannot report the exact disabling percentage in speech unless its sensors legitimately provide it; black-box technical detail can coexist with a simpler witness statement.

## 6. Rap sheet / port dossier

This is an incident dossier, not a secret achievement score. A faction can distinguish skill, danger and evidence.

| Field | Display rule |
|---|---|
| Subject | Known pilot identity and incident ship/transponder |
| Local names | Up to three relevant titles the viewing organization actually knows |
| Incident | Date/site and stable incident identity |
| Physical account | One-sentence primary trick and verified causal chain |
| Harm | Actual deaths, injuries/disablement, property loss; unknown values remain unknown |
| Evidence | Direct witness / delivered sensor report / recovered black box; named sources and coverage |
| Law reference | Existing incident/warrant/case identity, or “No case recorded” |
| Disposition | The actual authoritative state: reported, under review, restitution agreed, cleared, etc. |

Example dossier wording: **“Known locally as Knotmaker. Used a tethered pirate as an impact weapon at the refinery approach. One hostile ship destroyed; industrial property harm not established. Witness: M. Venn. Report delivered to Refinery Control.”**

A trick tag cannot itself declare murder, establish property ownership, set WANTED, pardon the pilot, change faction opinion numerically, or mint an insurance bill. Those require the underlying world incident. The dossier cites that incident rather than creating a second version of the law.

## 7. Save shape and round-trip guarantees

This is a semantic data contract, not a language-specific schema or file implementation plan.

| Record | Required content | Bound |
|---|---|---|
| Stunt incident | Incident ID; mode; simulation epoch/tick; primary ID and factual modifiers; source/payload/victim-life IDs; stable root and terminal references; consequence facts; event-time names/site; evidence revision; black-box/witnessed/reported status | Shares the existing **240-entry total ledger**, not an additional 240 rows |
| Causal digest | Root actor; ordered critical transformations; actual root/transfer/terminal ticks; bounded normalized mass/ΔV/closing-speed facts; terminal identities; truncation flag | At most 32 causal nodes and eight detailed terminal bodies per incident |
| Witness digest | Up to eight observers; affiliation at event; source/transfer/payoff coverage; observation ranges/LOS verdicts; actual report destinations/ticks | Eight per incident; no saved live object pointers |
| Title record | Stable title ID; pilot/ship scope; acquisition tick; qualifying incident references; capped progress across distinct incidents; local/report-network knowledge | 16 titles initially; capacity at most 32 |
| Bark state | Incident/speaker/line identity; eligible/queued/delivered/suppressed status; delivery tick; expiry; audience/network | At most eight queued incidents |
| Deduplication state | Settled canonical incident/death identities, monotone settlement watermark plus bounded out-of-order exceptions; victim budget use where an encounter remains active | Persist independently of visible ledger eviction |
| Unsettled observation | Active causal roots, relevant physical witness coverage, pending terminal/amendment deadline and episode identity | At most 32 pending episodes; no full world copy |
| Record metadata | Save format revision, physics/scoring revision, campaign identity, simulation-time base, monotone event sequence | One bounded header |

**New saved narrative/provenance payload target: at most 512 KiB** beyond the world's already-authoritative physical state. The existing ledger's 240 total entries remain the visible retention cap. A title's minimal acquisition evidence survives eviction of its long prose entry; store a compact retained citation rather than pointing to a missing row. Pinned exports are separate user artifacts, not unbounded automatic save growth.

### 7.1 Exactly once means exactly once for durable state

One settled incident updates its ledger account, title progress and witnessed status as one logical settlement. Replaying an alias or loading a save must not create another incident, title increment, cash award or reputation notification. A later Collateral amendment changes the existing incident, not its acquisition count. Unknown/missing parent identities leave the record unverified; a migration never upgrades uncertainty into fame.

A pending physical setup saved before impact can still resolve after load if its underlying bodies and provenance restore consistently. A save taken after settlement restores a settled entry. A save taken after bark delivery does not replay that bark; an eligible undelivered bark may play once on resumed gameplay if still contextually valid.

There is a practical side-effect boundary: an audio sample and a durable save are not an atomic operation. Across an abrupt process crash during sound playback, prefer **at-most-once bark delivery** to repeating dialogue on every load. Durable ledger/title state remains exactly once; do not claim impossible exactly-once audible playback across arbitrary crashes. Normal save/restore round-trips must preserve delivered/undelivered status deterministically.

### 7.2 Boundary cases to preserve

| Save point / event | Required restored behavior |
|---|---|
| After observed release, before collision | Restore the pending episode; no premature title; settle only if the future contact really happens |
| After canonical death, before all aliases arrive | One victim death and one incident; aliases change neither count nor title progress |
| After title acquisition, before safe bark slot | Title remains; one eligible queued reaction may use it |
| After bark delivered | No bark replay; title and incident survive |
| After long entry evicted | Title acquisition retains compact cited evidence; old replayed IDs cannot re-award it |
| Actor/victim renamed or unloaded | Incident-time names and identities remain intelligible |
| Crucible run ends | No Arena Credits, numerical style, Crucible witnesses or temporary enemies leak into Adventure |
| Witness dies without transmitting | Private/local observed facts remain where actually known; no unexplained faction-wide rumor |

## 8. Minimum narrative acceptance

In one Adventure session, perform a **physically proved Bolas kill** with a qualified living witness and a safe radio opening. The expected sequence is: settled Bolas incident → one ledger line with source/release/impact → local Knotmaker acquisition → one actual witness bark → report propagation only if transmitted. Saving and restoring before and after each boundary must preserve the same event identity and final ledger/title counts.

No capture or runtime validation was performed for this design deliverable. The above is a precise acceptance contract, not a report that these effects already occurred.
