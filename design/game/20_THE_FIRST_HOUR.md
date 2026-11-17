# 20 — The first hour, designed end to end

**Status: DRAFT** — timings are design targets until the measured demo route (`scripts/fleet/looks/demo-route.mjs`) and RECON-G10 replace them; each row gains "exists today (owner)" and "observable" columns before packets are cut. Authority for the demo (owner, 2026-11-12: "someone needs to think about how we create the optimal game
experience … from the first loading screen to every UI and the game"). Where 10/16/19 and this disagree on the first hour,
this wins. Owner of the plan: the lead. Every beat below is judged on screen through `scripts/fleet/looks/demo-route.mjs`.

## Owner correction — 2026-11-17: prepare the ship before launch

The owner's playtest rejects the TITLE-01 default-first PLAY screen and the repeated replacement of
working menus with smaller, less understandable prototypes. **Swarm opens on ship and equipment
selection.** The selected ship is the visual focus; its role, fitted weapons and powers, available
slots, and the effect of a proposed change are visible. A useful recommended build may already be
selected, but it is shown and accepted by the player before launch.

The journey is **Hangar: ship and starting kit → Arena and difficulty → Armory: fit equipment → Deploy**.
These may be sections of one coherent hangar or a short sequence. Before creating the run, the player
can return to an earlier setup choice without losing the selected hull or kit. The opening armory
uses the canonical run and purchase owners, shows the selected ship, and requires an explicit Deploy
action before combat. Escape and controller Cancel never deploy, even after repeated presses or with
no credits left. Returning to setup must explain whether it discards run-only purchases.
Challenges, records, seeds and advanced rules
have their own optional section; they are not equipment and must not occupy the purchase list.
Preparation must explain which equipment is free, which purchases spend this run's credits, what
is fitted now, and what is changed or bought between rounds.

This ruling supersedes TITLE-01's one-button default launch, its quiet *Customise* detour, and any
interpretation of the first-throw target that removes ship selection. It also supersedes the old
TITLE-01 row in `design/program/fleet/QUEUE.md` wherever that row has not yet been reconciled. The
acceptance bar in doc 18 still requires a prompt, satisfying opening; measure Swarm's forced
launch/loading/tutorial time separately from the time the player chooses to spend fitting a ship.

Preserve the existing art, useful navigation and working interactions while improving the layout.
A request to simplify does not authorize removing preparation, hiding player controls, or replacing
a developed interface with text links. The evidence and regression mechanisms are recorded in
[`docs/reviews/2026-11-17-menu-ux-regression.md`](../../docs/reviews/2026-11-17-menu-ux-regression.md).

## The five rules of attention

1. **One focal point per moment.** At any second the player's eye has one obvious place to go — the brightest, most
   saturated, most moving thing on screen is the thing that matters. Everything else recedes (dimmer, smaller, still).
2. **One guidance voice, two owners (EC-G09: twelve systems can tell the player what to do today).** *What is next* is
   said by **one line only — the objective tracker**. *The verb* is said by **one world tag only — the aim tag on the thing
   under the cursor** (`#hud .sf-aimtag`, today "LINE TARGET"): `RMB · LATCH`, `CLICK · THROW`, `E · DOCK`. The onboarding panel,
   tutorial voice, act popups, first-use hints, comms nudges and the control bar defer to these two — at most one of them
   speaks at a time, and never while a verb tag is up. **On-screen text budget in a fight: ≤ 3 lines** besides the HUD
   instruments, priority: danger alert > verb tag > objective line > callout > receipts.
   **The world teaches, not panels.** A prompt sits on the object it is about (world-anchored chip: `RMB · LATCH` on the rock),
   appears when the action is possible, and leaves the moment it is done. No modal tutorial slides, no wall of keys.
3. **The HUD earns its place.** Calm flight shows only what you need this minute: speed, hull, the one objective line, the
   radar. Instruments arrive when their verb arrives (tow strain when you tow; power rail when you own a power). Combat
   brings combat readouts; peace takes them away.
4. **Every first success lands.** The first latch, first throw, first kill, first dock each get a beat: a camera kick or
   ease, one sound, one short word in the centre lane (`LATCHED`, `THROWN`, `CRUSHED`) — once, then quieter on repeats.
5. **A prompt first throw after launch.** Target thirty seconds from confirming launch to the first throw; report
   forced loading/tutorial time and voluntary preparation time separately. A preset makes preparation easy without
   hiding the selected ship or bypassing the player's equipment decisions. Keep unnecessary prompts out of the route.

## Controls: one verb at a time

The core set stays small and is introduced in this order, each by a situation:
| Verb | Keys (mouse+keyboard) | Pad | Touch | Taught when |
|---|---|---|---|---|
| Fly / aim | W A S D · mouse | left stick · right stick | drag anywhere | 0:00 — the ship is already moving toward the marked rock |
| The Line (latch / cut) | RMB tap | RB | TETHER key | 0:10 — the rock is in range; chip on the rock |
| Throw | release / RMB tap while swinging | RB | flick while latched | 0:20 — the derelict is in the swing's path |
| Boost | Space | LB | push past the ring | 0:40 — the raid; distance to close |
| Fire | LMB hold | RT | GUN key | 1:00 — the raider; but the throw is the better answer |
| Powers 1–5 | 1–5 · Q wheel | d-pad · hold Y | POWERS edge | minute 15+, one per situation (doc 10 D6) |
| Dock | E | A | DOCK key | at Helios |
Esc/Start is always Pause. Every key is rebindable (Settings → Controls); the Help screen shows the live bindings.
**Accessibility floor:** text ≥ 12 px at 1280×720; reduced motion and reduced flash honoured by every new beat; colour never
the only signal (shape + word); subtitles for every voiced line; hold-to-toggle options for held verbs.

## Storyboard — first launch to the first door

| Time | Screen | The eye goes to | The player does | Must NOT be on screen |
|---|---|---|---|---|
| 0:00 | **Loading** (~7 s) | the SPACEFACE mark and a single moving progress line | waits | percent jitter, tech words ("initializing systems") |
|      | | below it, one rotating **controls card** (WASD · mouse · RMB Line · Space) drawn as the game's own key art | reads it while waiting | — |
| 0:07 | **First-run question** (once per install) | one card: *Play* (shipped settings) — quality/motion folded in | clicks Play | multiple stacked config prompts |
| 0:09 | **Title** | **ADVENTURE and SWARM** are clear primary destinations over the existing hero scene; each whole visible control responds to hover, focus and activation | picks a mode | dead space inside a control; developer entries; text pretending to be a button |
|      | | Continue / New Game, Load, Settings and Help remain easy to find; Quit appears where supported; secondary modes retain clear labels | resumes or opens another action | removing useful navigation just to reduce the button count |

**Swarm door** (doc 12; prepare a ship the player wants to fly):

The setup rows below follow player decisions, not a countdown. Relative combat targets begin after
confirming launch; do not hurry the player out of ship selection to satisfy an elapsed-time number.

| Moment | Screen | Eye | Does | Must NOT |
|---|---|---|---|---|
| Entry | Ship and loadout | large preview of the selected ship beside readable ship choices, role, fitted equipment and empty slots | picks a hull or keeps the visible recommended fit; compares equipment | a generic PLAY splash; a tiny Customize escape hatch; unexplained repeated silhouettes |
| Preparation | Arena and difficulty | arena preview labelled **Arena**; difficulty with a plain description of enemy numbers, starting credits and rewards | chooses run settings; optionally opens clearly described practice/challenge settings | unexplained Stake, Pressure, Training ON/OFF; seeds or internal IDs in the basic setup |
| Equipment | Opening armory | the chosen ship, current hardpoints, weapons, powers, supplies, clear prices and remaining run credits | keeps the starter fit or buys and equips changes | challenges mixed into purchases; showing one fit while buying for another; spending Adventure credits |
| Ready | Review and deploy | selected ship, fitted equipment, arena, difficulty and remaining run budget; one clear **Deploy** action | accepts the displayed build and begins combat | launching a different ship/fit; hidden mandatory purchases; decorative equipment that is not fitted |
| First seconds in flight | Round 1 drops in | the chosen ship at centre; the opening enemies and **one chip on the nearest valid target: `RMB · LATCH`** | flies and latches | radio, open-world notices, pad tag soup |
| First swing | Combat | the Line taut, the pack behind; chip: `SWING · RMB TO THROW` | throws into the pack | — |
| First chain | Combat | centre lane: `PILE-UP ×3` big, once; a short camera punch | sees the result | three other callouts at once |
| Round end | Armory (between rounds) | current ship and equipment, affordable upgrades and clear prices; `Launch round 2` the obvious primary | buys, replaces, or keeps the fit and launches | challenges mixed into purchases; clipped cards or prices; losing the current fit |
| Death | Run Over | what killed you, one line of why, **Retry this build** and **Change loadout** | retries knowingly or revises the fit | silently resetting the chosen ship or equipment |

**Adventure door** (doc 16 B0 "Cold Start", doc 10 D6 — the ten beats):
| Time | Beat | Eye | Does | Teaching |
|---|---|---|---|---|
| 0:10 | New Game: name + ship (defaults fine) → **LAUNCH** | the LAUNCH key | launches | — |
| 0:12 | 1 · spawn: the 47-A rock marked, one caption of premise | the marked rock, bright against the field; the ship already drifting toward it | flies (WASD) | caption fades after 4 s |
| 0:30 | 3 · latch, reel, cut | chip on the rock `RMB · LATCH`; then the tow strain arc on the ship | latches, reels | `LATCHED` beat |
| 0:45 | 4 · swing the rock through the derelict | the derelict lit as a target; chip `SWING THROUGH IT` | throws | `SMASHED` beat; debris |
| 1:30 | 5 · the raid | the raider's red ring; the rock field behind it | flings the raider into a rock (the throw again — not a gun drill) | `CRUSHED` beat |
| 3:00 | 6 · claimed salvage — take it or leave it | the salvage pod and its owner's tag | chooses | the first choice with a consequence |
| 4:00 | 7 · mine the sample | the seam glow | mines | — |
| 5:00 | 8 · **the Skim, as a scene** | the black-line ship dropping in; its line takes your tow; the escorts die on screen | watches, reacts | no text wall — it happens in front of you |
| 6:30 | 9 · Kessler's line, with a face | a portrait window, one line | — | — |
| 8:00 | 10 · dock at Helios into Lamps-Up | the station lamps coming up; `E · DOCK` chip | docks | first station visit: one recommended job (Orla's lamp), the alloy run lit |
| 15–40 | powers, extra verbs, drills | one per ~90 s, by situation | — | never all at once |

## Screen standards (every screen in the first hour)

- Fits and reads at 1280×720, 1366×650, 1280×620 and the phone sizes; nothing clipped; one primary action, lit.
- Text on a plate whenever it sits over the world; ≤ 3 notices at once; identical notices merge; no open-world chatter in
  an arena.
- Each screen answers in one glance: *where am I, what can I do, what should I do next.*
- A control's visible boundary is its hit target, with visible hover, focus, selected, disabled and pressed states.
  Native buttons support pointer, Enter and Space; ordinary control text does not become a selection when double-clicked.
  Text entry, share codes, diagnostic receipts and other deliberately copyable fields retain selection.
- Functional wording explains the decision before flavor text. Difficulty describes its effects; practice explains
  its gameplay and scoring changes. Internal IDs, seeds, implementation notes and agent instructions stay out of basic setup.
- Before launch, changing hull changes the actual preview and the runtime hull; changing a fit changes both the preview's
  equipment indication and the runtime loadout. Compare two genuinely different hulls, not two names for the same model.
- Revisions retain a screenshot baseline and exercise the ordinary title-to-run route. Test the image, description and
  padded interior of a control with real pointer input; a scripted DOM `click()` does not prove the hit target works.

## Performance stance (owner 2026-11-12: lean to performance)
Every beat above is built from what exists — camera eases, chips, plates, existing VFX and sounds — no new heavy systems.
The look pass (LOOK-04) makes the existing picture read (bodies over the sky, bloom only on emission); the demo tier keeps a
fixed internal resolution. A beat that costs frames is cut, not shipped.

## How this is built and checked
Packets per strip (title + loading; Swarm door; Adventure beats 1–5; beats 6–10; first station visit), each judged by the
demo route: forced seconds-to-first-throw, voluntary setup time, frames, every screen PNG, every on-screen string.
Preserve the accepted visual hierarchy and functional outcomes across revisions; a changed implementation name is not
itself a reason to replace the screen or relax a behavior check. The owner's ten-minute card is the final word.
