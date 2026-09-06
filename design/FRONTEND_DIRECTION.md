<!-- LIFETIME: DURABLE -->
# The Frontend Direction — the A-list plan

**Owner ruling, 2026-09-05, verbatim:**

> "I'm not sure I support the decision to build everything on existing design authority, less
> design-oriented agents wrote all of that and the frontend is stubbornly cheap, I think there have
> been essentially poisoned frontend instructions that will keep reverting the frontend back to
> cheap if you rely on them as an authority."

> "Think of the timeline: I tell an agent to make the game, it makes a cheap frontend, I then employ
> you to fix it, you then read its notes and consider them to be an authority, capping the frontend
> quality at the same level of cheapness because the less-smart agent came first."

> "If I wanted an optimally clean and sleek A-list bold and expressive frontend that exceeds most
> games we need a plan for that."

**Standing of this file.** It sits in the *user direction* tier of the authority chain
(`AGENTS.md` §4), directly under `design/VISION.md`. **On anything aesthetic — type, colour, tone,
composition, imagery, motion, sound, what "polished" means — this file outranks every document in
`design/frontend/`, every per-screen spec, every packet's "to the grammar" clause, and every review
in `design/frontend/reviews/`.** Those files remain valid for two things only: engineering facts
(what code exists, what is reachable, which seams are shared) and the measurable floor in §3.

Prose written by an agent — including this prose — is never the final authority on taste. **The
authority is a set of rendered frames the owner approved**, produced by the procedure in §2 and
kept at `design/frontend/direction/approved/`. Until those exist, no surface work may start (§8,
`PQ-187`).

---

## 0. The answer in one paragraph

SpaceFace's frontend is cheap because its design law was written by agents and it prescribes a
neutral admin dashboard — charcoal panels, hairline borders, one blue, display type capped at
28 px, "80 % neutral at rest", and "polished is a column of greens". Any agent that obeys that law
regenerates the same look, no matter how skilled. The way out is not better prose from another
agent; it is to **put three genuinely different, fully rendered directions in front of the owner,
lock the one they pick as the authority, build a kit from it, migrate every surface onto the kit
with an owner checkpoint at the end of each phase, and prove the result blind against the best
games' actual screens.** The measurable engineering floor (12 px, four data states, memory,
localisation, three widths, budgets, regression frames) stays, because it is measurable — not
because the old documents said so.

---

## 1. Why the frontend keeps reverting to cheap

Three mechanisms, all verified in the tree on 2026-09-05.

**1.1 The law prescribes the cheapness.** `design/frontend/INSTRUMENT_GRAMMAR.md` §4 defines the
identity as "a modern, restrained, near-neutral dark UI: flat translucent dark panels, 1px hairline
edges, calm off-white type, and ONE interaction accent." That is the recipe for a SaaS settings
page. §3 caps every display element at 28 px, so nothing on any screen can be a hero. §4's
"80 % rule" forbids a screen from having a mood. §2 says screens may differ "never by styling".
§12 defines done as a column of check results. Each rule is individually defensible and together
they guarantee a competent, generic result. Today's repair pass (commits `e86f4be8`–`81253f60`)
made every screen obey that law consistently. **It was hygiene, not direction.** Two faces and one
blue were the old grammar's choices, and the direction pick in §5 may reverse them.

**1.2 The authority loop.** The first agent built a cheap frontend and wrote notes. Every later
agent read the notes as law and built to them. Owner rejections (neon, glass, tracked caps,
Saira) were applied as *bans*, and the replacement identity was again written by an agent. The
owner has only ever been asked to say no; never shown three real options and asked to choose.

**1.3 Taste was outsourced to checks.** `PQ-180`'s matrix, `check:visual-regression`, and the
fifteen A-list standards measure whether a screen falls over. They cannot measure whether it is
beautiful, and a program whose definition of done is "matrix green" will ship screens that pass
and look like nothing. The matrix is a floor tool. It is kept as one (§3) and demoted from gate to
prerequisite.

---

## 2. The mechanism that breaks the loop

1. **The sheet is the authority; the first live frames confirm it.** *(Revised 2026-09-06, §13.)*
   The direction is fixed by `design/frontend/direction/DIRECTION_SHEET.md` — a picture in plain
   words of every screen plus the rules — and, once the title is live, by its captures committed
   under `design/frontend/direction/approved/` as the reference frames.
2. **Nobody picks between options.** *(Revised 2026-09-06.)* The owner declined to choose between
   stylesheets and delegated the decision; the sheet decides. Enforced in the queue: every surface
   packet depends on `PQ-187.03` (the title live on the kit), so `program-dispatch --next` cannot
   hand out surface work before the direction is visible in the game.
3. **Every leaf ends with a hash-bound visual review against the sheet.** *(Revised 2026-09-06.)*
   A memoryless reviewer sees the capture and the sheet and answers the sheet's §9 checklist; the
   integrator closes. The owner's veto is exercised by looking at the game, never on a form.
4. **The proof is blind and comparative.** A memoryless vision reviewer sees a SpaceFace frame
   beside a reference game's frame of the same screen type and picks the more polished one (§11).
5. **Agents are told what not to reach for**, by name (§9), because "bold" in an agent's hands
   becomes glow within one commit.

---

## 3. Floor and ceiling

**The floor — kept, because each item is measurable.** Not because the old documents said so.

| Floor item | Why it stays |
|---|---|
| No text below 12 px computed | legibility is measurable |
| Every pane declares EMPTY / LOADING / ERROR / DENIED with a verb | a correct-but-blank screen reads as broken |
| Every screen restores what the player last chose, per save | absence is measurable and infuriating |
| Every label survives +40 % string length; no concatenated sentences | the game is localised |
| Every surface holds at 1280 / 1920 / 2560, and clamps to a safe box on ultrawide | measurable |
| Legible under `forced-colors` and complete under reduced motion | accessibility |
| Keyboard and gamepad reach everything | accessibility |
| ≤ 2 ms UI frame cost, ≤ 1,500 DOM nodes per surface, no per-frame allocation | performance |
| Reference frames committed and diffed on change | regressions are otherwise invisible |
| No first-person visor, cockpit arc, helmet or pilot-portrait motif | standing owner ruling |
| No neon halos, no glassmorphism blur stacks, no gradient button fills | owner rejection, 2026-08 |

**The ceiling-cappers — voided by this file.** Any packet, spec or review that cites one of these
is wrong on that point.

| Voided rule | Where it lived | Why it capped quality |
|---|---|---|
| Display type capped at 28 px; two faces only; "no screen may introduce a third" | grammar §3 | nothing can be a hero; the game cannot own a voice |
| "One interaction accent", "80 % neutral at rest" | grammar §4 | a screen cannot have a mood or a temperature |
| "Flat translucent dark panels, 1px hairline edges, calm off-white type" as *the identity* | grammar §4 | that is a dashboard, not a game |
| "Screens differ by centerpiece and verb, never by styling" | grammar §2, README | correct about centerpieces, wrong that styling may not carry meaning |
| "Polished is a column of greens" / matrix green as the gate | `PQ-180`, §18 | taste cannot be a check; the matrix is a prerequisite |
| Every "to the grammar" done-when in `PQ-162`, `PQ-168`, `PQ-181`, `PQ-182`, `PQ-185` | the packets | they would rebuild the dashboard with more care |
| "Consolidate the stylesheets first" (this author, earlier on 2026-09-05) | conversation | do not clean a stylesheet you are about to replace; build the kit fresh, migrate, delete |

The grammar's motion contract (motion bound to a named state variable, three verbs, nothing
infinite), its technique list (direct manipulation, labels pinned to 3D, earned reveal, sound on
every state change), and its reuse table are **good engineering and stay** — they constrain *how*
things move, not what the game looks like.

---

## 4. What "bold and expressive" means here

Owner taste data, in order: the neon cyan console was rejected; "refined readable shadcn-like
surfaces" were requested and delivered; that result is now judged cheap; the warm "field equipment
at dusk" direction for Asteroid Works was liked; "gray, bleak, vibe-coded, harsh fonts" was
rejected; first-person cockpit motifs are permanently rejected. So: **bold is not loud, and sleek
is not neutral.**

Boldness comes from five sources, and only these:

1. **Scale contrast.** One thing on the screen is enormous — a title, a number, the ship, a crest —
   and the rest is small and exact. Destiny, Control and Persona all live here. A 28 px cap makes
   this impossible; the new type scale runs to 96–160 px on hero surfaces.
2. **A display face with a point of view**, paired with a quiet text face and a tabular numeral
   face. The display face is chosen from rendered comps, not from a name.
3. **Composition.** Asymmetric, edge-anchored, full-bleed layouts with deliberate emptiness; never
   a centred card in a dark field. The world and the ship are *in* the layout, not behind it.
4. **The game's own imagery.** The player's actual hull render with its scars, the sector's sky,
   faction crests, station art, the wreck you just made. Hades and Destiny put the world in the
   menu; SpaceFace already renders its hull in a hangar rig and never uses it as a picture.
5. **Choreographed motion with sound.** Screens cut and slide like editing, type arrives, numbers
   count, every action has a sound — each motion still bound to a named state variable, still
   under 180 ms, still authored for reduced motion. The game currently ships zero recorded audio;
   a UI sound palette is part of the bar, not an extra.

Colour is used **at screen scale as mood and state** — the whole shell warms when docked, the
Footprint goes cold and red when you are wanted, the Crucible door has its own temperature — not
as chrome on widgets. What boldness never means: halos, gradients on buttons, glass, tracked-out
caps, decorative brackets, flavour stamps, or any cockpit.

---

## 5. The three candidate directions for Phase 0

> **Superseded 2026-09-06 (§13).** No comps were built. The owner declined to choose between the
> cards and delegated the decision; B was chosen and is now specified by the sheet, which outranks
> the prose below. A and C are history, kept for the record.

Each is rendered on the same three screens — **the title, the station market, THE SHIP** — as real
HTML at 1920×1080 in `_uilab.html`, and reviewed by the owner side by side. The three must differ on
the axes that matter: display face and scale, base temperature, composition, how much of the
world's imagery is in the menus, motion and sound. Candidate faces are named so the comps can be
built; **the owner's pick was to be the decision** — superseded: the owner declined to pick and
delegated it (§13); B is decided.

### A · Editorial Industrial — the frontier's own print

The frontend as the printed matter of a heavy-industry frontier: manifests, hull plates, survey
sheets. Big condensed display type set tight and enormous (`Big Shoulders Display` Black or
`Archivo` Expanded Black), a warm paper-on-graphite palette (bone type on deep warm grey, one
signal orange-red, one utility yellow), rules and hairlines used like a broadsheet, asymmetric
columns hung from the top edge. The ship render is the photograph on the page; the station market
is a price sheet with a giant commodity name; the title is a masthead. Motion: hard cuts and
slides, type that stamps in. Sound: paper, relays, heavy switches. **Risk:** can drift toward
"military stencil" — the comps must prove warmth.

### B · Cinematic Minimal — the world is the interface

Destiny and Control's discipline: almost nothing on screen, and what is there is huge. A wide
grotesque with real character at display size (`Archivo Black`, `Syne` ExtraBold or `Unbounded`),
a thin, quiet text face, tabular numerals. The sector sky and the hull fill the frame; the UI is a
few large words, one signal colour, and a cursor-led focus that moves the whole composition. The
title is the ship against the sky with one word; the market is three enormous prices and a
sentence; THE SHIP is the hull at full bleed with labels pinned to it. Motion: slow-fast easing,
everything anchored to the object. Sound: low, tonal, few. **Risk:** density surfaces (station
ledger, contracts) need a second, denser register; the comps must include one dense pane.

### C · Warm Instrument — field equipment at dusk, everywhere

The direction the owner already liked for Asteroid Works, extended to the whole game. Warm
materials — worn amber, oxblood, brass-on-slate — with a characterful humanist display face
(`Bricolage Grotesque` or `Fraunces` for a serif with nerve; both already vendored or trivially
so), chunky confident labels, illustrated faction crests and hull art, tactile controls that read as
built objects. The title is a lit hangar; the market is a physical price board; THE SHIP is a
workshop with the hull on the stand. Motion: mechanical settle, needles, detents. Sound: latches,
relays, the workshop. **Risk:** the most work to make sleek; the comps must prove it can be quiet.

Each comp ships with: the three frames at 1920×1080, the same three at 1280×720, one dense pane,
one empty state, one hover/focus state, reduced-motion behaviour noted, and a ten-second capture
of the title→market transition with placeholder sound. The comps are compared **against each
other and against the reference board**, not against the current build.

---

## 6. The reference board

Ten games whose interfaces are unarguably A-list, chosen to bracket the space. The owner reacts to
each with love / like / hate and one line; the reactions steer which comps get built and how.

| Game | Look at | Why it is on the board |
|---|---|---|
| **Persona 5** | pause menu, results screen | type as the hero; asymmetric cut-outs; one loud colour; motion on everything |
| **NieR: Automata** | system menu, map | stark, sleek, editorial, monochrome; a sound on every action; proof that restraint can be bold |
| **Destiny 2** | character screen, director map | hierarchy through scale; the world as the backdrop; cursor-led composition |
| **Control** | mission board, collectibles | editorial type at giant size on photographic backgrounds; almost no chrome |
| **Hades** | boon pick, mirror, run summary | warm, handmade, chunky, confident; the run told as a story |
| **Hardspace: Shipbreaker** | hab terminal, work order | warm industrial, tactile, functional; nearest tonal match to "field equipment" |
| **Death Stranding** | delivery results, cargo | ritual and big numerals; density with hierarchy |
| **Alan Wake 2** | case board, inventory | photographic, editorial, layered paper; bold without glow |
| **Highfleet** | the whole thing | the boldest genre-adjacent UI in existence; stencil type, warm CRT, physical controls — a diegetic take the owner may hate, but it sets the ceiling for *expressive* |
| **Into the Breach** | everything | the board is the game; nothing on screen that is not information |

Two genre baselines the result must beat, not admire: **Everspace 2** (competent, generic space
menus — the current build's nearest neighbour) and **Starsector** (dense, functional, dated). If a
blind reviewer cannot tell SpaceFace from Everspace 2, the plan has failed.

---

## 7. The signature moments

An A-list frontend is remembered by a dozen moments, not by its settings page. Each is built as a
composition with a transition and a sound, captured as a ten-second clip, and signed off by the
owner individually.

| # | Moment | What it must do |
|---|---|---|
| 1 | **Cold open and title** | the ship and the sky, the name, one verb; version visible; the menu arrives, it is not just there |
| 2 | **New game** | three starters as three ways to play, each a picture and a sentence, not a form |
| 3 | **First undock** | the shell peels away and the HUD arrives element by element as systems come online |
| 4 | **Docking** | arriving somewhere: the berth, your hull, the people, one line of local news; the shell warms |
| 5 | **Undocking** | the reverse, fast; the world is waiting |
| 6 | **Going wanted** | the Footprint and the HUD change temperature; you know before you read |
| 7 | **Death and game over** | what killed you, the telegraph you missed, what you keep; a still, not a form |
| 8 | **Crucible results** | the run as a story: the moments, the tricks, the best chain, the build code; retry in one press |
| 9 | **First upgrade / unlock** | an earned reveal: a socket fills, the hull changes, the verb is named |
| 10 | **Load** | saves as portraits — hull, scars, titles, rap sheet — not a list of timestamps |
| 11 | **Pause** | the world held, not hidden; the shell over the frozen game |
| 12 | **Photo mode** | the HUD gone, the camera free, one capture |
| 13 | **Every screen open and close** | one transition system, cut-like, under 180 ms, with sound; never a uniform fade |

---

## 8. The program

Phases are sequential where they share the kit; surface phases can run in parallel by mutex once
the kit exists. **Every leaf ends with a hash-bound visual review against the sheet** *(revised 2026-09-06: the owner's veto is exercised in the game, not on a contact sheet)*. Packet IDs are real and
dispatchable; `PQ-187` and `PQ-188` are new, the rest are existing packets re-gated on the direction
lock.

| Phase | Packet · leaf | Delivers | Evidence |
|---|---|---|---|
| **0 · Direction** | `PQ-187.00` reference board · `.01` the decision and the sheet | *(revised 2026-09-06)* the board; `DIRECTION_SHEET.md` — decided, §13 | done |
| **1 · The kit, then the title live** | `PQ-187.02` the kit · `.03` the title on the kit, on the default route — the gate for every surface packet | tokens, the type scale to hero size, the display/text/numeral faces, colour-as-mood rules, the transition system, the UI sound palette, and every component rendered on one kit page in the lab; old stylesheets are not cleaned — screens migrate onto the kit and their old CSS is deleted as they move | the kit page |
| **2 · Shell and signature moments** | `PQ-181` (revised: signature moments 1, 2, 7, 10, 11, 12, 13) | title, new game, load portraits, pause, game over, settings, credits, statistics, photo mode, the transition system live | contact sheet + the seven clips |
| **3 · The flight HUD** | `PQ-188.00` (moments 3, 6) | the HUD to the direction: hero-scale where it matters, the arrival choreography, temperature on wanted | contact sheet at three widths |
| **4 · The station as a place** | `PQ-162` (revised: moments 4, 5) | seven screens on the kit; docking and undocking as arrival and departure | contact sheet + two clips |
| **5 · The four instruments** | `PQ-188.01` THE SHIP · `.02` FOOTPRINT + RANGE · `PQ-168` THE CHART | built to the old grammar; rebuilt on the kit with their centerpieces kept (orbit, trace, fly, push) | contact sheet |
| **6 · Crucible and the Works** | `PQ-182` (moment 8), `PQ-185` | the Crucible door, draft, refit, results; Asteroid Works accepted under its own warm law, reconciled with the direction | contact sheet + the results clip |
| **7 · One system, fast** | `PQ-183`, `PQ-184` | every name a link, the watch list, global find; budgets met; the legacy hub gone; dead CSS and dead fonts deleted last | the numbers |
| **8 · Proof** | `PQ-187.04` | the blind side-by-side, the owner's thirteen sign-offs, the regression baseline reshot on the new look, a ninety-second reel | **the reel** |

The floor is re-measured after every phase by the existing matrix and regression frames. **The
current reference baseline (`PQ-180.03`, in flight today) is a floor tool for the current look and
will be reshot after Phase 2.** That lane is not blocked by this plan.

---

## 9. How agents get this wrong — the cheapness generators

An integrator rejects a unit that matches any line.

- **Reaching for glow to be bold.** Boldness is scale, face, composition, imagery, motion (§4).
  A halo, a gradient fill, a glass panel or a tracked-out label is an automatic reject.
- **Building the comps as mock-ups.** Phase 0 comps are real HTML in the lab at real size with real
  data; an image made elsewhere proves nothing about the build.
- **Making the three directions three tints of the same layout.** They must differ on face, scale,
  temperature, composition and imagery, or the owner is not being offered a choice.
- **Writing a new direction sheet from prose.** The sheet describes the approved frames; frames
  outrank it. When they disagree, the frames win and the sheet is corrected.
- **Citing the grammar's identity sections, the per-screen specs, or a review as a reason to
  keep something.** They are voided on aesthetics (§3).
- **Centring a card in a dark field.** The default composition is edge-anchored and asymmetric.
- **A settings-page voice on a hero surface.** The title, load, death and results screens are
  compositions, not lists.
- **Consolidating the old CSS before the kit exists.** Build fresh; migrate; delete.
- **Calling a phase done on a green matrix.** Done is the capture matching the sheet under a hash-bound visual review *(revised 2026-09-06)*.
- **Any first-person motif.** Permanent.
- **Shipping motion with no state variable, or longer than 180 ms, or without a reduced-motion
  authoring.** The motion contract is floor.

---

## 10. What happens to the existing documents and packets

- `design/frontend/README.md` and `INSTRUMENT_GRAMMAR.md` carry a banner: superseded on
  aesthetics by this file; kept for engineering facts and the floor. §3 and §4 of the grammar are
  replaced by `DIRECTION_SHEET.md` once Phase 0 locks.
- `SCREENS_A`–`E` remain the record of each screen's centerpiece and manipulation verb (orbit,
  push, trace, fly, bore), which survive. Their type, colour and surface prescriptions do not.
- `PQ-162`, `PQ-168`, `PQ-181`, `PQ-182`, `PQ-185` gain a dependency on `PQ-187.03` and a note
  that their taste gate is the visual review against the sheet *(revised 2026-09-06)*; `PQ-183` and `PQ-184` are unchanged in scope
  and run after migration.
- `PQ-180`'s matrix and `check:visual-regression` stay as floor instruments. Their "green" is a
  prerequisite for an owner review, never a substitute for one.
- `CANONICAL_BUILD_MAP.md` §18 and `AGENTS.md` route every frontend request here first.

---

## 11. Proof — what "exceeds most games" means, measurably

1. **Blind side-by-side.** For each of eight screen types (title, load, pause, results, map, ship,
   market, HUD), a memoryless vision reviewer sees the SpaceFace frame beside the reference board's
   frame of the same type, unlabeled, and answers "which is the more polished, more distinctive
   interface?" Target: **SpaceFace chosen in ≥ 50 % of pairings across the board, and in 100 % of
   pairings against the two genre baselines.**
2. **The owner's thirteen.** Every signature moment in §7 has a clip the owner signed off.
3. **The floor is green** across the matrix at three widths, pseudo-localised, forced-colours,
   reduced-motion, inside the budgets, with the regression baseline reshot on the new look.
4. **The reel.** Ninety seconds of the frontend alone, cut to the game's own UI sound, that a
   stranger would mistake for a shipped title's trailer.

---

## 12. The first question for the owner

Phase 0 starts with the reference board. The one answer that most improves the comps: **which
of the ten games in §6 do you love, which do you hate, and why in a line each?** Add any game not
on the board whose interface you admire. That answer is recorded verbatim at the top of
`design/frontend/direction/REFERENCE_BOARD.md` and the three comps are built against it.

**Answered 2026-09-06.** The owner declined to review a board or stylesheets and delegated the
decision (§13). The board was curated by an agent (`PQ-187.00`); no comps were built; the question
is closed.

---

## 13. The decision — 2026-09-06

### 13.1 What the owner said

The owner was shown the three directions of §5 as rendered cards and answered (verbatim, recorded in
[`receipts/PQ-187-01-REPORT.md`](./program/roadmap/receipts/PQ-187-01-REPORT.md)):

> I'm not going to go over these endless stylesheets with short descriptions of styles that don't
> really tell me at all what the eventual result is going to be like and then bottleneck the
> development at the stage of me just having to choose one at random … none of them look like
> games, it's just a title … I guess I like cinematic minimal, but I have no clue what that would
> turn out in the game itself … You'll just have to decide what the game being described in the
> docs would look best like, and make it into a series of frontend tasks we could tackle

That answer replaces §2.2, §2.3, §5's comparison round and §12. The owner does not pick between
stylesheets, cards or comps, and no phase waits on an owner yes. The owner's veto stays open at
every unit and is exercised the only way that works for a non-designer: by looking at the game.

### 13.2 The decision

**Cinematic Minimal, tuned for SpaceFace — the world is the interface.** Decided by the agent under
the delegation above, leaning where the owner leaned. The authority is now
[`design/frontend/direction/DIRECTION_SHEET.md`](./frontend/direction/DIRECTION_SHEET.md): a
picture in plain words of every screen (what fills the frame, what the one huge thing is, where the
words hang, what colour the frame goes), then the rules underneath — faces, the scale, colour and
temperature, composition, the dense register, motion, sound, the review checklist, what survives,
what retires, the never-list. The sheet outranks §5's prose for B, which was a candidate
description and is now history.

Why this direction, for this game specifically:

1. **The game's best asset is its world render** — the hangar-rig hull, the deep-field sky, the
   station with traffic, the chart drawn as a star system. Editorial Industrial and Warm Instrument
   put a skin between the player and that picture. Cinematic Minimal makes the picture the
   interface.
2. **The owner's standing rulings already describe it:** refined readable surfaces everywhere, no
   cyan wireframe, no monospace as a look, no cramped panels, no cockpit or visor framing, quiet
   instruments on the HUD. Direction A's risk is military stencil; direction C's risk is workshop
   clutter. Direction B's risk is emptiness, and emptiness is fixed by the rule that the world is
   in every shot.
3. **It is the direction that does not require gutting the game.** The bones stay — the screen
   manager, the three-anchor HUD, the station OS and its six instruments, the instruments' verbs,
   the icons and crests, the hull render. What changes is the skin: type, scale, the removal of
   boxes, the world behind every screen, temperature, motion, sound. Each screen sheds its old CSS
   as it migrates; nothing is rewritten wholesale.
4. **Its faces are already vendored.** Instrument Sans (with tabular figures, verified) and
   Bricolage Grotesque are in `styles/fonts/` today from the Asteroid Works law the owner accepted;
   the kit vendors the variable Bricolage and the game has one typographic voice.
5. **It survives the density test** because the sheet designs the dense register explicitly (§6
   of the sheet): the market is three enormous numbers, a sentence and a half-width table.

### 13.3 The mechanism, revised

- **The sheet is the authority.** A frame is right when it matches the sheet's picture for that
  screen and its rules. The reviewer is memoryless, sees only the capture and the sheet, and
  answers the sheet's §9 checklist; the review is hash-bound to the capture.
- **The integrator closes leaves**, never a human pick. A unit that cannot proceed without someone
  choosing between options is a defect in the unit.
- **The title goes live first** (`PQ-187.03`) so the direction is seen in the actual game after one
  unit. If the owner vetoes it there, the words are recorded verbatim, the sheet's title picture
  and the unit are revised, and no surface packet starts until the revised title is live.
- **The proof stays blind and comparative** (§11). The thirteen signature moments are captured as
  clips and reviewed against the sheet; the owner watches the reel instead of signing forms.

### 13.4 The task series

The ordered list, each line saying what the owner will see in the game when it lands, is
`CANONICAL_BUILD_MAP.md` §20.14. In brief: the kit → the title live (the veto point) → the shell →
the flight HUD → the station → THE SHIP, THE FOOTPRINT and THE RANGE → the chart → the Crucible →
Asteroid Works reconciled → the reading screens → one system, fast → the proof. After the title is
live, the surface tasks run in parallel under their own packets.
