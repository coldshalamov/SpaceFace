# Story weak-point re-diff — five iterations

**Date:** 2026-07-16  
**Mode:** diagnosis only (no canon patches applied here)  
**Inputs:** live spine docs + `src/data/missions.js` / `narrative.js` / `embodiedMissions.js` / `endingDefs.js` + prior package  
**Companion:** [`LITERARY-DEEPENING-GOAL-RESULT.md`](./LITERARY-DEEPENING-GOAL-RESULT.md), [`EXPANSION_PORTFOLIO.md`](./EXPANSION_PORTFOLIO.md)

This is **not** a claim that the story is finished in play. It re-diffs the *designed and partially wired* spine for weak points, five times, each pass narrowing or re-ranking.

---

## Pass 1 — Fresh inventory (what is weak, where)

Sweep of contradictions, thin beats, and embodiment gaps against live files.

### 1A. Canon-vs-canon fractures (implementer traps)

| ID | Weakness | Evidence | Why it matters |
|---|---|---|---|
| **W01** | **B0 is three different jobs** | Overlay: “mine 10u Veldspar” (`STORY-SPINE-NARRATIVE-OVERLAY.md` B0). Chapters: alloy run **12.4t** (`chapter-00-cold-start.md`, `chapter-01-CANONICAL.md`). Live objectives: “sample the discrepancy, then dock” (`missions.js` `STORY_BEATS` B0). Embodiment: `mining:yield` → `dock:docked` (`embodiedMissions.js` B0). | Player-facing “first story” is ambiguous. Mass thesis (12.4t) may never meet the verb the player does. |
| **W02** | **Ending count drift** | Overlay B7: “**The four choices** …” and “three available contracts” (`STORY-SPINE-NARRATIVE-OVERLAY.md:133`). ENDGAME + `endingDefs.js`: **five** (A–E). Choice E missing from Overlay sentence. | Implementers ship incomplete endgame; E is the thesis ending. |
| **W03** | **HUD phase table disagrees** | Overlay: Phase 2 at **B5**, Phase 3 at **B7**; B6 still Phase 2. `narrative.js` BEAT_CONTENT: B4 phase **2**, B6 phase **3**. `chapter-06` claims Phase 3 begins at B6. | Complicity “phases” can’t be felt if sources disagree. |
| **W04** | **REG vs REF 44-C** | Live UI/data prefers **REF** (`narrative.js` `REF_44C`). Economy/Hale samples often **REG** (`ATMOSPHERIC-ECONOMY.md`). Chapter-00 mixes both. | Same code, two labels → player never learns the cross-link. |
| **W05** | **chapter-01 filename collision** | `chapter-01-CANONICAL.md` = **B0** HUD script; `chapter-01-honest-work.md` = **B1**. | Wrong file edit = wrong beat. |

### 1B. Design-strong, play-thin (literary peaks with soft landings)

| ID | Weakness | Design home | Live wire signal |
|---|---|---|---|
| **W06** | Elroy moral bruise is easy to miss forever | Overlay B2; chapter-02 | `hudLie: civilian_tag_flicker` + `storyTarget.registry` exist; ordinary-route proof still open (M5 PARTIAL) |
| **W07** | VALE HOLDINGS salvage is hint-only | Overlay B5; `narrative.js` B5 hint | No proof of ship-gen registry field in mission pipeline from this pass |
| **W08** | Callum reunion optional & thin in embodiment | STORY-STRUCTURE B5; chapter-05b FUTURE | B5 contact is Callum but physicalContact is **chain_count only** — booth dialog not required |
| **W09** | B7 is `observeOnly` gate | ENDGAME full set-piece | `embodiedMissions.js` B7: `observeOnly: true`, empty steps, netWorth/rep gate — Kurtz desk not a physical sequence in embodiment data |
| **W10** | Thread B objects soft | STORY-STRUCTURE 3.1kg + coords | `narrative.js` defines `cmdty_unclassified_composite` 3.1kg; full cargo lifecycle / undecoded coords UX not proven as spine requirement |
| **W11** | Eight crooks = graffiti cameos | NPCs-CANONICAL private struts | No required player verbs for daughter number / second ledger / unclaimed ticket |
| **W12** | Beneficiary every cycle is prose | ATMOSPHERIC-ECONOMY MTS short | Player may never name who profits year 9 |

### 1C. Mid-spine thinness (interest trough)

| ID | Weakness | Notes |
|---|---|---|
| **W13** | B3–B4 are upgrade/menu beats | Ship buy + faction pick; moral content mostly optional labels (VARIANCE ADJUSTMENT, V. Director) |
| **W14** | B5 chain is generic “N missions” | BRANCH_CHAIN counts exist; per-faction *story texture* thin vs Callum optional peak |
| **W15** | Early choice poverty | First irreversible *story* choice effectively B4; B0–B3 mostly onboarding verbs |
| **W16** | Hint lines second-write | e.g. B6 hint “This was always the case” (`narrative.js`) — author elbow in live data |

### Pass 1 exit

**Raw weak set:** W01–W16. Strongest literary ideas are intact in the bible; fractures and thin mid-spine threaten the *felt* story.

---

## Pass 2 — Rank by player harm (not bible elegance)

Re-score: **P0** = breaks thesis in ordinary play · **P1** = thesis only for attentive players · **P2** = doc/implementer pain · **P3** = polish.

| Rank | IDs | Harm model |
|---|---|---|
| **P0** | W01, W02, W06, W09 | First hour mass story may not match verbs; endings incomplete if Overlay followed; Elroy bruise may never land; B7 may feel like a credit gate not a recognition scene |
| **P1** | W03, W04, W07, W08, W10, W12, W14 | Attentive players lose cross-links (phase, 44-C, Vale Holdings, Callum, beneficiary, chain texture) |
| **P2** | W05, W11, W13, W15 | Agent/author confusion; ensemble stays functions; mid-game “space career” without filings |
| **P3** | W16 | Second-writer residue in hints — cheap to cut, high voice ROI |

### Pass 2 new finding

**W17 — Dual success criteria for “story works”**  
Program M5 wants ordinary B0–B7 routes. Literary thesis wants *paperwork legibility*. A green adapter run can satisfy neither. Weakness is **acceptance definition**, not only content.

### Pass 2 exit

Prioritize **unify B0 + endings count + Elroy reliability + B7 physical staging** before any +30% side content.

---

## Pass 3 — Seam analysis (threads, arithmetic, endings)

### 3A. Thread A / Thread B

| Seam | Status | Weakness |
|---|---|---|
| Shared REF 44-C | Designed strong | Undermined by REG/REF (W04) |
| Thread B skippable | Correct design | If skipped, Thread A must still bruise — depends on W06/W12 |
| Thread B hijack risk | Low in design | High if future work centers Vethari over air economy |
| Le Carré operation layer | Optional B7 re-read | Weak if Marsh/Brandt only in sheets; strong if ledger page exists in play |

**W18 — Thread A needs one mandatory delayed gut-punch**  
If Callum and investigation terminals stay optional, Elroy flicker **or** medicine graffiti **or** Kurtz Elroy row must be near-unmissable. Currently “most players don’t connect until B6/B7” is a feature that becomes a failure if B7 is observe-only.

### 3B. Arithmetic (weight / air)

| Claim | Prose status | Play status | Weakness |
|---|---|---|---|
| 12.4t = lawful grid VALE-ALA-47A | Fixed in ATMOSPHERIC-ECONOMY | May never appear on contract body | Player never sees “lawful murder” |
| 0.4t moisture skim | Fixed as separate | Not required side content | Skim elegance invisible |
| Wrong grid shelved Helios | Designed (smell ticket, HELIOS_NOT_NEEDED graffiti in narrative B0) | Landmark optional | Punchline of economy may never fire |
| MTS short | Prose | Unproven board/news | Year-9 beneficiary weak |

**W19 — “Lawful big crime” is still a design note until B0 full contract shows it**

### 3C. Endings

| Ending | Design | Weakness |
|---|---|---|
| A–E packages | `endingDefs.js` | Ordinary reach unproven |
| Overlay omits E | W02 | E is “most deserved” ending in ENDGAME prose |
| Post-ending graffiti | Designed per choice | Mutation of *earlier* sectors thin |
| Choice C loop | Locked in ENDGAME | Overlay timing note good; must not regress to reactor death (AGY history only) |

**W20 — Endings change identity labels more than world temperature**  
If post-ending sandbox feels identical, literary “filing position” fails.

### Pass 3 exit

Seam weak points: **W17–W20** added. Core fracture remains **B0 mass job** + **B7 gate without desk**.

---

## Pass 4 — Literary devices (where craft is neglected in *play*)

| Device | Bible | Play weak point |
|---|---|---|
| Symbolism (mass) | Strong | W01 — symbol not tied to first verb |
| Symbolism (air/temp) | Strong | Climate often not UI; Ashfall=Pit recognition may be text-only |
| Foreshadow | Dense plants | Many plants never fire as inspectable objects |
| Dramatic irony | Elroy | W06 — 0.5s may be unreadable; no guaranteed secondary residue same session |
| Withholding | Lida/coords | Correct; risk is coords never found because B7 thin |
| Doubles | Elroy/Kurtz/Vale | Kurtz desk weak (W09); Vale only as strings |
| Register split | Strong house law | Hints sometimes second-write (W16) |
| Ensemble irony | Struts written | W11 — private plans not playable |
| Delayed recontextualization | le Carré structure | Needs at least one forced re-read object by B7 |

**W21 — Foreshadow without payoff objects**  
`HELIOS_NOT_NEEDED` graffiti is planted in `narrative.js` B0; payoff at Ashfall/wrong-grid must be a *findable* ticket or Bay 7, not only Kurtz monologue (Kurtz barely monologues).

**W22 — Character growth = knowledge without new verbs**  
Wren’s arc is “know more.” After B4, few filings change *available endings’ ease*. Mid-game feels like career, not tightening noose.

### Pass 4 exit

Device holes are mostly **embodiment of existing plants**, not missing lore. Do not add chapters; **close plant→payoff loops**.

---

## Pass 5 — Consolidated diff, cut noise, priority plan

### 5A. What is *not* a weak point (do not “fix”)

- Dual-thread architecture  
- Faceless Vale / honest Hale  
- Callum venue dialog (when present)  
- Five-ending philosophy (A–E)  
- Lida unanswered / 0.01t coords  
- Elroy as moral bruise (concept)  
- Paperwork thesis  
- Protected peak lines  

### 5B. Consolidated weak-point list (after 5 passes)

| Priority | ID | One-line diagnosis | Fix type |
|---|---|---|---|
| **P0** | W01 | B0 job triple-booked | **Sew** — one player-facing job; 12.4t in paperwork |
| **P0** | W02 | Overlay four endings | **Sew** — five A–E including E |
| **P0** | W06 | Elroy missable forever | **Embody** — flicker + same-session residue |
| **P0** | W09 | B7 observe-only | **Embody** — sector enter + desk + ledger verb |
| **P0** | W17 | “Story works” undefined | **Accept** — ordinary route + one paperwork tell |
| **P1** | W03 | Phase table drift | **Sew** — single phase table in Overlay + narrative.js |
| **P1** | W04 | REG/REF | **Sew** — one player-facing form |
| **P1** | W07 | Vale Holdings hint-only | **Embody** — salvage registry field |
| **P1** | W08 | Callum not required | **Keep optional**; strengthen Thread A if skipped |
| **P1** | W10 | Thread B soft objects | **Embody** — 3.1kg always; coords on ledger take |
| **P1** | W12 | Beneficiary invisible | **Embody** — news/board/token residue |
| **P1** | W14 | B5 chain generic | **Densify** — one story anomaly per branch |
| **P1** | W18 | Need one mandatory gut-punch | **Design law** — medicine wall or ledger row guaranteed |
| **P1** | W19 | Lawful crime invisible | **Embody** — auth line VALE-ALA-47A on B0 |
| **P1** | W20 | Endings don’t mutate world | **Embody** — airlock string tables A–E |
| **P1** | W21 | Plant without object payoff | **Embody** — Bay 7 / ticket Y3-C2 |
| **P1** | W22 | Knowledge without verbs | **Light filings** — 2–3 mid-spine irreversible papers |
| **P2** | W05 | Filename collision | **Doc** — index only |
| **P2** | W11 | Crook struts unplayed | **Optional sides** (portfolio U14–U18) |
| **P2** | W13/W15 | Mid-spine menu | **Densify labels + one filing each** |
| **P3** | W16 | Hint second-writer | **Cut** phrases |

### 5C. BEFORE → AFTER (felt spine if P0–P1 closed)

| Beat | BEFORE (felt risk) | AFTER (target) |
|---|---|---|
| B0 | Mine tutorial; mass story may not match | Sample/haul **discrepancy**; full contract shows mass + VALE/44-C; STABLE LOAD sticks |
| B1 | Rename easy to ignore | Destination graffiti + silent category change visible in history |
| B2 | Pirate kill | Kill + flicker and/or medicine wall; optional sealed query |
| B3 | Buy ship | VARIANCE ADJUSTMENT + Vale note header optional |
| B4 | Pick faction | Admin field once forced on confirm |
| B5 | Generic chain | One VALE HOLDINGS salvage + optional Callum |
| B6 | Deploy drone | Remittance secondary log; own-hand graffiti; 47-A settlement |
| B7 | Credit gate | Ashfall climate recognition; Kurtz desk; ledger; five endings; post-text |

### 5D. What *not* to do in the next iteration of work

1. Do not add new factions or trauma layers.  
2. Do not make Callum mandatory before P0 closes.  
3. Do not expand B8+ Wren thread until B0–B7 ordinary route is honest.  
4. Do not “fix” peaks by explaining them.  
5. Do not measure success by adapter greens alone.

### 5E. Ordered fix stack (implementation-ready, still not implemented here)

1. **Sew pack (hours, not weeks):** W02 Overlay five endings; W03 phase table; W04 REF default; W16 hint cuts; W05 index note.  
2. **B0 single job (P0):** Align Overlay + STORY_BEATS + embodiment + chapter mass paperwork.  
3. **Elroy reliability (P0):** Prove flicker path or same-dock medicine graffiti always.  
4. **B7 physical (P0):** Replace pure observeOnly with enter Ashfall → desk → ledger → disposition.  
5. **Paperwork objects (P1):** Auth line, Vale Holdings salvage, remittance note, Bay 7 ticket.  
6. **World residue (P1):** Ending airlock mutations; light beneficiary signal.  
7. **Only then** optional Callum 05b + crook side residues + portfolio densifiers.

### 5F. Self-critique of *this* five-pass doc

| Risk | Response |
|---|---|
| Restating the big literary package | This pass adds **live line-level** fractures (B0 triple job, phase mismatch narrative.js vs Overlay, B7 observeOnly) |
| Inflating weak points | Explicit non-weak list; P3 separated |
| Demanding full Thread B | Thread B stays optional; Thread A mandatory bruise required instead |
| Trying too hard | No new themes; close loops |

---

## Beat heat map (after Pass 5)

| Beat | Structural | Literary design | Embodiment | Overall weak? |
|---|---|---|---|---|
| B0 | Fractured job definitions | Excellent mass thesis | Partial mine→dock | **Yes — P0** |
| B1 | OK | Strong rename | Mission exists | Mild |
| B2 | OK | Excellent if landed | Richest embodiment | **Yes if flicker fails** |
| B3 | Thin choice | Good optional labels | Ship purchase only | Mid |
| B4 | First real branch | Strong one-admin idea | Branch intro exists | Mild–mid |
| B5 | Generic chain | Callum peak optional | Chain only | **Yes — P1** |
| B6 | OK | Strong complicity | Asset deploy exists | Mild (hints) |
| B7 | Gate vs scene | Excellent endings bible | **observeOnly** | **Yes — P0** |

---

## One-page verdict

The story’s **ideas** are not the weak point. The weak point is a **split spine**:

1. **Documents disagree** on B0, phases, and ending count.  
2. **Play may complete verbs** without completing the **mass / Elroy / recognition** moral circuit.  
3. **B7** is designed as the double-meeting and currently data-shaped as a **wealth/rep gate**.  
4. **Mid-game** is a career plateau unless VALE HOLDINGS / admin fields / remittances become objects.  
5. **+30% content** remains correctly *secondary* until P0 sews and embodies.

**Iteration rule for the next five engineering sessions:**  
Close W01 → W02 → W06 → W09 before any new story unit that does not serve those four.

---

## Evidence index (live paths)

- `docs/worldbuilding/story/STORY-SPINE-NARRATIVE-OVERLAY.md` — B0 Veldspar; B7 four choices; phases  
- `docs/worldbuilding/story/chapter-00-cold-start.md` — 12.4t alloy  
- `docs/worldbuilding/story/ENDGAME-B7-REDESIGN.md` — five endings  
- `src/data/missions.js` — STORY_BEATS objectives  
- `src/data/narrative.js` — BEAT_CONTENT phases/hints/hudLies; 3.1kg composite  
- `src/story/campaign47a/embodiedMissions.js` — B0 mine/dock; B5 chain; B7 observeOnly  
- `src/story/endings/endingDefs.js` — A–E  
- `docs/worldbuilding/story/ATMOSPHERIC-ECONOMY.md` — lawful 12.4t + MTS short  
