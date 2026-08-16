<!-- LIFETIME: DURABLE -->
# What To Build Next

**Status:** sequenced job list for continued frontend work, written after the Phase 0 / Phase 1
implementation review. Companion to [`A_LIST_GAPS.md`](./A_LIST_GAPS.md) (standards) and
[`ADDITIONS.md`](./ADDITIONS.md) (features). This file answers *"what next, in what order, and what
does each one cost."*

---

## 1. What actually inhibits the player's best experience

Established by measurement across the audit, not by opinion. Ranked by how much each one costs the
player.

| # | The inhibitor | Evidence |
|---|---|---|
| 1 | **The simulation is invisible.** The game runs a huge world the player cannot see. | 183 KB of NPC careers, 350 KB of traffic, 124 KB of encounter direction, 78 KB of law, 73 KB of claims — `state.npcJobs` and `state.traffic` are read by **0 UI files**; `player.bounty` appears in **0** UI files. |
| 2 | **You cannot read your own ship.** | `getDerivedStats` returns ~35 fields; the ship screen shows **6**. Every module advertises a power draw against a capacity that is never displayed. Condition is absent. |
| 3 | **Nothing explains a rule.** | `help.js` is four blocks of keybindings; `codex.js` is 8 story-gated narrative tabs; onboarding speaks one 6-second line that cannot be recalled. |
| 4 | **The world does not remember what you did.** | `heat` is a decaying scalar; faction rep is a scalar overwrite; both are emitted with a `reason` and then discarded. No crime log, no standing history. |
| 5 | **The interesting powers are unreachable.** | Start = 5,000 cr; cheapest of 29 tech nodes = 6,000. The Massline's top tier sits behind a 2,500,000 cr capital-ship node. |
| 6 | **The HUD hides what the player can already do.** | Keys `4`–`8` fire five physics powers today; `clearingCone` and `skimCollector` have **zero** references anywhere in `src/ui/`. |
| 7 | **Screens forget everything.** | The map persists no layer toggle, commodity, zoom or tab — every open is a fresh open. |
| 8 | **Correct-but-blank reads as broken.** | Fixed once by hand on THE SHIP (an empty bay for 12 s on a cold open). There is still no shared empty/loading/error/denied policy, so the next screen will repeat it. |
| 9 | **The UI would break in translation.** | A live localization system and a pseudo-loc harness exist; no spec accounted for +40 % string growth until `A_LIST_GAPS.md` #1. |
| 10 | **One breakpoint.** | No ultrawide, 4K or handheld strategy. |

**The through-line: this is a surfacing problem, not a content problem.** Nearly every item is
"the game already computes this and never shows it." That is why frontend work has outsized leverage
here — and why several fixes are assembly rather than invention.

---

## 2. The jobs

Each job names the A-list pattern it borrows, what the player gets, and what it costs to build.

### Short term — days each, highest leverage

**J1 · The Power Rail.**
*Pattern:* the MMO/looter action bar (WoW, Destiny) — permanent, numbered, and it fills as you grow.
*Player gets:* "I can see what I can do, and I can see it growing." The single most direct answer to
*"I can't look at the HUD and see the big game."*
*Cost:* a HUD component plus the `hud:slotClaim` contract — **four in-flight prompts already grab
digit keys in the capture phase**, one of them all nine, so the Rail must render a claim it cannot
revoke. Icons: 16 prompt files are already written; generate, then author to 24×24 stroke SVG.
*Prerequisite:* none. Spec is complete in `SCREENS_A_FLIGHT.md`.

**J2 · Ship bands 2–3: handling and power.**
*Pattern:* Elite Dangerous' outfitting comparison and Warframe's ghost-preview on hover.
*Player gets:* the answer to *"why does my ship fly like this"*, and a power budget with a capacity
to draw against.
*Cost:* **mostly assembly** — `panels/handlingProfile.js` and `panels/massDelta.js` are finished
renderers sitting behind a dead import chain. Mount them, add the beam encoding (dash velocity ∝
headroom, reversing on overdraw).
*Prerequisite:* none. This is the natural continuation of build step 1.

**J3 · The four states, as a shared primitive.**
*Pattern:* the skeleton/empty-state discipline every shipped consumer app has.
*Player gets:* never a blank screen that is technically correct.
*Cost:* one shared component plus an audit pass. I fixed one instance by hand this session; the
point is to make it structural so the next screen inherits it.
*Prerequisite:* none — and doing it **before** J5–J7 avoids repeating the fix per screen.

**J4 · Screen state memory.**
*Pattern:* universal; invisible when present, infuriating when absent.
*Player gets:* the map, ship and station open where they left them.
*Cost:* small — a per-screen state bag in the save, restored on show. Exclude anything dangerous to
restore (a pending destructive confirm).

### Medium term — weeks each

**J5 · Everything is a link.**
*Pattern:* EVE Online's "Show Info" and Destiny's inspect — every noun is a door.
*Player gets:* twelve menus stop being twelve menus. Read a contract naming a company → click →
their standing, doctrine, territory, your history → click a sector → the chart opens there.
*Cost:* one entity resolver (id → label + dossier + route), one drawer, and a tagging pass.
**Do this early** — the resolver is shared with the watch list and global find, and retrofitting tags
into finished screens costs several times more than emitting them as you build.

**J6 · THE FOOTPRINT.**
*Pattern:* Red Dead 2's wanted system plus Crusader Kings' "why does this person hate me" causal
chain.
*Player gets:* the world visibly remembers. A hostile patrol becomes traceable back to the collision
that caused it.
*Cost:* an append-only ledger that **only listens to events already emitted** — `law:incidentReceipt`,
`faction:repChanged{reason}`, `faction:repSpillover{srcFaction}` all carry what is needed. Plus a
three-pane screen and a save key with a declared cap.

**J7 · THE RANGE.**
*Pattern:* Titanfall 2's gauntlet, Hitman's training, Deep Rock's tutorial bays — teaching by doing.
*Player gets:* learns the physics toolkit by flying it, and can come back to the lesson.
*Cost:* reuse the `screens/drill.js` pattern (an existing 3,154-line playable pausing screen). Three
drills first, not thirty: Massline swing, mass-vs-turn slalom, energy-budget hold.

### Long term — months each

**J8 · THE CHART as a dispatch console.**
*Pattern:* X4's map, Total War's campaign layer, Death Stranding's route planning.
*Player gets:* answers *"where should I take this cargo, and is that route survivable?"* in seconds,
and can act on the answer without leaving the map.
*Cost:* surgical edits to a 10,109-line file — **never a rewrite**. Replace adjacency-as-trade-lanes
with an economic pressure model (the pure functions already exist), feed the risk estimator that
currently returns `0`, add the traffic layer from the existing pure `trafficRoleMixForSector`, draw
live conflict zones, and make holdings inspectable.

**J9 · Loadout presets and build identity.**
*Pattern:* Destiny loadouts, Monster Hunter equipment sets.
*Player gets:* *"different kinds of gameplay"* becomes real, because switching is cheap enough to
experiment with. Each preset is labelled by playstyle — *"Tow & Swing"* — never by stats.
*Cost:* save schema, a preset rail in the ship's apron, and capability-sentence labelling.
*Prerequisite:* J2, so a preset can show what it changes about how the ship flies.

**J10 · Visual regression in CI.**
*Pattern:* standard practice at every A-list studio — reference frames diffed automatically.
*Player gets:* nothing silently regresses.
*Cost:* extend the two probes already in `scripts/` into a capture matrix — default /
reduced-motion / `forced-colors` / pseudo-localized, at 2560×1080 / 1920×1080 / 1280×720 — and diff
against committed references.
*Why it matters here:* this session alone produced three cases where a green check coexisted with a
visibly broken screen. **Until frames are diffed, "a green check is not proof" stays permanently
true.**

---

## 3. Ordering

```
J3 ─┐                      (do the shared primitives before the screens that need them)
J4 ─┼─► J1 ──► J2 ──► J9
J5 ─┘        └─► J6 ──► J8
             └─► J7
                          J10 runs alongside everything from J1 onward
```

**The two scheduling rules that matter:**
1. **J3, J4 and J5 are properties, not features.** Every screen built after them inherits them free;
   every screen built before them needs revisiting.
2. **J10 should start as soon as J1 lands**, because its value is proportional to how many screens
   exist to protect.
