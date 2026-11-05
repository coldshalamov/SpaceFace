<!-- LIFETIME: ACTIVE_PROGRAM -->
# Swarm Demo Cut — make Crucible Swarm a classic, demo-ready mode

**Owner direction, 2026-11-05.** Swarm is the mode to perfect: its fun is the most obvious, and
anything that makes it more fun pays back into Adventure. The owner will demo it soon by **playing
it live on his laptop while people watch**. This program is **look and feel only**. Performance is
owned by separate work already running (Codex); every plan here obeys one guardrail instead:
*add no per-frame cost, and prove it with a before/after on the laptop when a change touches the
frame.*

This folder is the job source for the work. It sits beside the Finish Program lane boards; it does
not replace them. Lane 2 owns Crucible/Swarm code paths — these plans name exact files, and the
controller assigns them like any board item. Read this README in full before taking any plan.

| File | What it is |
|---|---|
| this README | the diagnosis, the taste bar, the design every plan implements |
| [`PLANS.md`](./PLANS.md) | ten agent-ready plans with exact files, tests, and screenshot checks |

---

## 1. The diagnosis (played 2026-11-05: title → Crucible → Quick Play → round 1)

The physics toy is genuinely special — the golden Line yanking a ship into rocks, a rock field
shattering, debris scattering. The Run Over screen is excellent. The menus look professional.

What an audience would see go wrong, in the order they meet it:

1. **Six gates before the first shot.** Splash → motion-effects ask → "First light" accessibility
   prompt → Encounter tab (4 modes × 4 stakes × 7 arenas) → Ship & Kit (10+ starter builds) → an
   81-item Armory opening on a "wager". Classic arcade modes are one button to the fight.
2. **The between-round shop is a catalog.** 107 items in a price-sorted scrolling list ("Harbor
   Brake Set S", "Shield Liner S", "Third-Owner Patch Kit"). The genre's loved moment — pick one of
   three exciting things — exists in code (`src/data/swarmDraft.js`, ~30 verb cards) but the screen
   shows the catalog.
3. **The screen talks about things that are not the fight.** Adventure chatter runs during Swarm —
   *"SKIFF-RECTO: The courier reaches its shelf. A page changes hands."*, *"Cargo recovery notice:
   bounty after the spill"* (`barkDirector.js` and `faction_archive.js` have no Swarm gate). A
   jargon stack sits on the left: "WINDOW CLOSED", "LINE RELEASED 16T — MESSY", "CLEAN SNAG 93",
   "IMPACT LOGGED — 504", "MASS 48672 · WON'T BUDGE". An enemy detail card repeats "Wasp · FIGHTER ·
   LIGHT · HOSTILE · SENT AFTER YOU · CLOSE · DETAIL". "SCORE 0" sat beside a rising credit count.
4. **Credit for things the player did not do.** With the ship at rest, before any input, the chain
   climbed to 9 and the game announced "PILE-UP ×2": Brood bodies dying on rocks feed the player's
   chain (`swarmChain._onBroodKills` takes every receipt regardless of cause).
5. **Enemies are specks and the last one hides.** The Brood (100+ bodies on wave 1) were not
   noticeable at the gameplay camera. The last Wasp of round 1 idled ~340 units off-screen; the
   player has to hunt it. The repo's automated player hit the same wall ("never leaves round 1 in
   300 s", `REPORT_CARD.md`).
6. **The arena is not the one advertised.** The menu shows Ricochet Foundry as a red-lit enclosed
   industrial room. The fight happens in open Helios space beside a large flat painted Saturn.
7. **One bomb flash whited out ~40% of the screen.** The camera also pushed in during the Line move
   and stayed in.

**Root cause.** The next Swarm work on the Lane 2 board is all *new systems* (14 Line heads,
provenance tiers, Circuit route map, Grudge Ledger, Trick Book, Strategic Chaos). Adding is easy to
verify, so agents add. "Classic" comes from a few things done perfectly. These plans are mostly
**removal, gating, re-presentation and tuning of what already exists**, with at most three new
things.

## 2. The taste bar (every plan is judged against this)

**What classic means here:** readable from across the room. The screen fills with a swarm; one
clear move causes a huge physical pile-up; the game celebrates it once, loudly, then gets out of
the way.

**References and what each teaches** (study the named quality, never copy art, names or UI):

- **Vampire Survivors** — a screen that fills with enemies; the joy of mowing a crowd.
- **Katamari Damacy** — the snowball: the more you grab and fling, the bigger the chaos you can make.
- **Geometry Wars** — legibility at density: every enemy is a bright, distinct, glowing shape.
- **Nova Drift** — momentum flight plus pick-one-of-three upgrades that change how you play.
- **Hades** — the between-round choice is a highlight, not a chore.

**Never** (a plan that does any of these is not done):

- Never show Adventure chatter, lore, news, landmark, codex, faction or contract text during a
  Swarm round.
- Never show a word or number a spectator cannot understand (no tonnage, mass, "SNAG", "MESSY",
  "WINDOW", "LOGGED", internal ids, percentages of things they cannot see).
- Never credit, count or celebrate something the player did not cause.
- Never let a flash or overlay cover more than ~15% of the screen or hold more than ~0.2 s, in any
  motion setting.
- Never add a system, currency, item tier or menu beyond the three "new things" named below.
- Never add per-frame cost without a laptop before/after; never raise the *full ship* concurrency.
  The swarm grows through the cheap Brood population only.
- Never put the fix in a dev flag, test route or lab screen. It must be on the ordinary route:
  title → Swarm.

**On-screen budget during a round:**

- Persistent: one big chain number + round progress bar (top center); hull/shield ring (bottom
  left); power bar as six icons with key numbers and cooldown fill — no words (bottom); radar
  (bottom right). Nothing else persistent.
- Transient callouts: top center only, **at most 3 visible**, **at most 3 words each**, plain
  English: "DOUBLE KILL", "THROWN!", "PILE-UP!", "BOSS INCOMING", "RIP ITS RUDDER".
- Boss name card and round title are the only larger text, each under 2.5 s.

**Proof every plan supplies:** (a) the plan's focused tests green; (b) before/after screenshots at
the gameplay camera on the ordinary route, opened and judged line by line against this section;
(c) one short Swarm round played start to finish on the laptop with the Browser pane *visible*
(a hidden pane throttles to ~1 fps and stalls loading at 87.8% — that is the pane, not the game).

## 3. The design

### 3.1 The demo route — one press to the fight (Plan 3)
The title gets a **SWARM** button. One press starts a Swarm run with a good default build and
arena, fighting in under 15 s warm. Splash, motion and "First light" prompts appear once per
machine, never again. The full Encounter / Ship & Kit / Armory flow stays reachable from CRUCIBLE,
off the demo path.

### 3.2 A round (Plan 5)
0–5 s round title; enemies arrive in visible groups from marked edges; mid-round the Brood fills
the screen with ships mixed in; when **3 or fewer** remain they get edge pointers and are pulled
toward the player — no hunting. Target **60–90 s** of pressure, then the shop. Waves 1–5 are
hand-tuned as the demo arc.

### 3.3 The fight screen (Plans 1, 2, 4, 7)
Colour language: player cyan/gold; each Brood family one saturated glowing colour, ~1.5× larger,
bright death pop; full ships hot red-orange rim plus a role mark; anything Line-throwable gets a
faint white outline in Line range. Camera: the Swarm framing shows the swarm around the player;
pushes in under 0.5 s only for big moments, then returns. Credit: a kill is the player's if their
shot, bomb or power did it, or a body they threw/shoved/towed did it within 3 s. Payoff ladder:
kill → small pop + click; multi-kill → bigger burst, higher pitch; **pile-up** (≥5 deaths from one
player cause within 1 s) → 0.15 s hit-stop, shake, "PILE-UP!" sting — the money shot.

### 3.4 Between rounds — "Pick one" (Plan 6)
Three large cards from the existing verb pool: icon, one-word name, one plain sentence, a looping
preview (an animated schematic is fine). Picking auto-fits the card. Reroll and Repair beside them.
"Browse all" opens the old armory. Target ~10 s.

### 3.5 Combo cards — new thing #1 (Plan 9)
Owning two specific verbs unlocks one named evolution card, built only from existing modules and
effects. Start with 3–4.

### 3.6 The wave-5 boss — new thing #2 (Plan 8)
On the demo route the Iron Maw (existing physics boss) arrives at wave 5 (ladder keeps wave 10).
2 s name card and camera push; Brood thin; glowing weak plates; 3-word act callouts; on death it
breaks into big chunks that stay as throwable debris; a victory version of the Run Over screen with
"Run it again" one press away.

### 3.7 New thing #3 — reserved (Plan 10)
Spent only after the full rehearsal shows the biggest remaining gap.

## 4. Note for the performance work (owned elsewhere)

The demo is the route in §3.1 → waves 1–5 → the Iron Maw, played live on the owner's laptop. The
measurement that matters to the demo is frame interval through that run, especially at the wave-5
boss and during pile-ups. Plan 4 may raise the Brood population only when that measurement holds.

## 5. Order

1. Plans 1 and 2 (quiet screen, fair credit) — cheap, remove the most unprofessional moments.
2. Plans 3, 4, 5 (getting in; seeing and reading the fight).
3. Plans 6, 7 (the fun loop).
4. Plans 8, 9 (the showpiece).
5. Plan 10 (rehearsal) last.

Plans touching disjoint files may run in parallel. Each plan lists its allowed paths. Before
editing, run `git status --short` and read `design/program/NOW.md`; preserve concurrent work.
