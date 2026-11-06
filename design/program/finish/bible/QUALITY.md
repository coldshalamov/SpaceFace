<!-- LIFETIME: ACTIVE_PROGRAM -->
# QUALITY — what a 1, a 3 and a 5 look like

Every visible or playable claim is scored by an **independent reviewer** (a different agent from the
builder) on the rubrics below that apply. **Done = ≥ 4 on every applicable rubric.** A 4 means "a
stranger would call this professional"; a 5 means "a stranger would show it to a friend".

## The review procedure (every rubric)

1. The builder supplies: what changed (one paragraph), the captures (stills and/or a 10–60 s clip on
   the ordinary route, Browser pane **visible**, gameplay camera unless the rubric says otherwise), and
   which rubrics apply.
2. The reviewer opens every capture. Before scoring, the reviewer writes 2–3 lines on how a named
   reference game handles the same thing (from what they know — no videos needed), so the bar is
   concrete.
3. The reviewer scores each rubric 1–5 with **one sentence of evidence per score**, and names the
   single most important fix.
4. Below 4 anywhere → the builder fixes → new captures → re-review (a fresh reviewer when possible).
5. Scores and evidence go in the commit body or the campaign's STATUS file.

Reviewers: **score what you see, not what the code claims.** If a capture doesn't show it, it's a 1.

---

## R1 — Flight feel

| Score | What it looks like |
|---|---|
| 1 | Input lag you can feel; the ship drifts when you want it to stop or stops when you want it to drift; turning is mushy or twitchy; speed is invisible. |
| 3 | Responds and steers reliably; momentum exists; but boost, brake and turn feel like numbers changing rather than a machine working. Speed reads only from the dial. |
| 5 | Every input answers within a frame; you feel mass in every turn (the hull leans, the engines flare, the camera trails a touch); boosting kicks, braking bites; speed reads from streaks, parallax, sound pitch and camera — you never look at the dial. A small ship feels nimble and a heavy ship feels like a freight train, and both feel *good*. |

Reference anchors: *Nova Drift* (momentum that's fun), *F-Zero* (speed you feel), *Burnout* (weight
on impact), *Freelancer* (the mouse-flight comfort).

## R2 — Combat feel (hits, kills, impacts)

| Score | What it looks like |
|---|---|
| 1 | Shots hit with no response; kills are a model vanishing; you can't tell if you're doing damage. |
| 3 | Hits flash, kills explode, damage numbers or bars move; but it feels generic — every hit and kill looks and sounds alike. |
| 5 | Every hit answers instantly with a directional spark, a tick of push, a sound matched to the weapon; light enemies pop on the kill frame, heavy ones break apart with weight; multi-kills escalate; the big one gets a brief slow-motion; you can feel which weapon you're using with your eyes closed. |

Anchors: *DOOM (2016)* (every hit answers), *Vampire Survivors* (mowing joy), *Geometry Wars*
(explosions as energy), *Burnout* takedowns.

## R3 — Reactions (the world responds)

| Score | What it looks like |
|---|---|
| 1 | NPCs ignore you; a toast tells you someone is angry. |
| 3 | NPCs react (flee, attack) but the same way every time; reactions are motion only, or bark only. |
| 5 | Motion + tell + sound (+ a short bark) + memory; personality varies the response; reactions spread (panic, vultures, witnesses); later the world shows it remembered. You could tell the story of what happened from the reactions alone. |

Anchors: *GTA V* pedestrians and traffic, *Watch Dogs 2* bystanders, *Red Dead Redemption 2* witnesses.

## R4 — Places (Hotspots, arenas, stations)

| Score | What it looks like |
|---|---|
| 1 | A model in space. Nothing happens there. You'd fly past. |
| 3 | Looks like a place with a purpose; some traffic; one thing to do; reads without a label at close range. |
| 5 | You can tell what this place does and who runs it from one screenshot at gameplay zoom; a job is visibly in progress with a crowd doing it; it has a hazard that's both a tool and a threat; there are at least three things to do and several things to break; it sounds like itself; you *want* to mess with it the moment you arrive. |

Anchors: *GTA V* Los Santos port and airport, *Freelancer* Manhattan and Planet Leeds, *EVE* trade
hubs (Jita's traffic), *Hardspace: Shipbreaker* yards.

## R5 — Ships and parts (KIT)

| Score | What it looks like |
|---|---|
| 1 | Role and faction unreadable at gameplay zoom; fitted parts invisible; clipping or floating parts at close zoom. |
| 3 | Role readable; faction mostly readable; fitted guns visible but generic; one or two clipping issues. |
| 5 | Role, faction, fit and history all readable from the top-down camera; heavy guns look heavy; turrets track; a patched pirate looks patched and a police cutter looks clean; no clipping at hangar zoom; you'd recognise your own ship in a crowd. |

Anchors: *Freelancer* (visible guns), *Armored Core* (silhouette = build), *Borderlands* (manufacturer
grammar), *Star Wars* used universe.

## R6 — Enemies (readability and character)

| Score | What it looks like |
|---|---|
| 1 | Enemies are specks; types indistinguishable; damage comes from nowhere. |
| 3 | Types are distinguishable up close; most attacks have some warning. |
| 5 | Every type is identifiable by shape, colour and motion with the HUD hidden; every dangerous ability telegraphs ≥ 0.6 s with an in-world tell; every type has a weakness you can see and exploit; a new type's debut teaches it. |

Anchors: *Geometry Wars*, *Hades* (telegraphs), *Left 4 Dead* special infected (each has a sound and a
silhouette you learn).

## R7 — UI and screen (glass)

| Score | What it looks like |
|---|---|
| 1 | Walls of text, jargon, numbers you can't interpret, things overlapping, menus within menus. |
| 3 | Clean and consistent, but more on screen than needed; some jargon; a few clicks too many. |
| 5 | Only what the player needs right now; plain words; hierarchy is instant (you know where to look); one press to the important thing; previews before commitment (you know what a choice does before you make it); nothing over the action that isn't the action. |

Anchors: *Hades* (between-run UI), *Into the Breach* (consequence preview), *GTA V* HUD restraint,
*Apex Legends* (ping/readability).

## R8 — VFX and light

| Score | What it looks like |
|---|---|
| 1 | Effects missing, or a white flash covers the screen; you can't see the fight. |
| 3 | Effects present and pretty; some hide gameplay; scale feels arbitrary. |
| 5 | Every effect says *what happened, where, how big, which way*; big events are big in the world (rings, debris, smoke, dynamic light) and never blind you; effects never hide a danger telegraph; the palette stays "industrial machinery at arcade energy" against dark space. |

Anchors: *Geometry Wars*, *Returnal* (bullet hell readability with spectacle), *Just Cause* explosions.

## R9 — Audio

| Score | What it looks like |
|---|---|
| 1 | Silence or one sample for everything; music loops audibly. |
| 3 | Distinct sounds for main events; music fits but doesn't move with play. |
| 5 | Sound tells weight (a scout's thump vs a freighter's crunch), distance and danger; every enemy type has a signature sound; music rises with pressure and breathes in calm; you could play with eyes closed and know when you're winning. |

Anchors: *DOOM (2016)*, *Hades*, *Left 4 Dead* (audio telegraphs), *Burnout* crashes.

## R10 — Writing (barks, labels, briefs)

| Score | What it looks like |
|---|---|
| 1 | Lore paragraphs over the action; cryptic or over-written lines; jargon. |
| 3 | Clear but bland; a bit long. |
| 5 | Short, punchy, in character, funny or tense when it should be; a bark ≤ 8 words; a brief ≤ 3 sentences; labels plain; you'd quote a line to a friend. |

Anchors: *GTA V* pedestrian and radio lines, *Hades* barks, *FTL* event text.

## R11 — The moment (MOMENTS.md)

| Score | What it looks like |
|---|---|
| 1 | Only happens with a dev tool or a script. |
| 3 | Happens in ordinary play if you know how to set it up; it's readable. |
| 5 | Happens naturally — a player who doesn't know it exists stumbles into it within the stated time — and it reads so well that a viewer understands what happened without explanation. |

---

## Performance guardrail (all rubrics)

A visible change that adds per-frame cost must ship with a matched before/after on the owner's laptop
(alternate builds within one session; host busy printed). A score of 5 that drops the frame rate is a
regression, not a 5.
