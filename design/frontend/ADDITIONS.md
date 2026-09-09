<!-- LIFETIME: DURABLE -->
# Candidate Additions


> **2026-08-30 IDENTITY NOTE:** the visual identity mandates in this document that predate the
> 2026-08 revision (neon cyan/teal/mint/purple accents, Saira SemiCondensed, tracked-out micro
> labels, coloured left rails, glass/glow treatments) are **superseded** by
> [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md) §3/§4 (2026-08 revision): neutral charcoal,
> one blue accent #4f8fdd, desaturated semantics, Plex Sans/Mono, no rails/glass/glow/tracking.
> Read this document for its structural and interaction design; take every colour, type, and
> surface treatment from the grammar.

**Status:** brainstorm backlog. Ideas *beyond* the four instruments and the station/meta screens
already specified. Nothing here is admitted work; each entry states what it serves, what already
exists to build on, and what it costs.

**The filter every entry had to pass:** does it make the player *understand* or *act* more, and does
it fit an arcade physics playground rather than an empire manager? `design/VISION.md` forbids the
X4 drift, and twenty shallow features is the same failure as twenty shallow screens.

Each was checked against the codebase before listing. **All ten are genuinely absent.**

---

## Tier 1 — the three that would change how the game feels

### 1. Everything is a link

**The single highest-leverage idea in this document.** Every entity name rendered anywhere — a
faction, a commodity, a station, a ship class, a captain, a sector, a module — is clickable and opens
that entity's dossier in place.

Read a contract that names *Helios Freight* → click it → standing, doctrine, what they pay, where
they operate, your history with them → click a sector in that → the Chart opens focused there.

**Why it matters more than any single screen:** it is what makes a large game feel like *one system*
rather than twelve menus. It is also the cheapest possible answer to "the player needs to understand
the systems of the game through these screens" — instead of building a screen per system, you make
every mention of a thing a door into it. It converts depth from *navigation cost* into *curiosity
reward*.

**Build on:** the `[data-why]` tier-2 affordance is already the same shape (`causeLedger.js`'s
enumerated-phrase discipline). This is its tier-3 sibling — `[data-entity="faction:helios"]` with one
delegated click handler and a dossier drawer.
**Cost:** one resolver + one drawer + a tagging pass across screens. **Do it in Phase 0**, because
retrofitting tags into finished screens costs several times more than emitting them as you build.

### 2. Loadout presets — "different kinds of gameplay," made switchable

Save a fit under a name. Swap between saved fits at any station. **Verified absent** — the only
matches are the save system and the dev sandbox.

The owner asked for "a deep skill tree and customization system **to allow different kinds of
gameplay**." Customisation only produces different *kinds* of play if switching is cheap enough to
experiment with. Today, trying a Massline-heavy build means manually unfitting and refitting, so
nobody tries it twice.

**Presets are the mechanism that turns a fitting screen into a build system.** Each preset shows its
own capability sentence — *"Tow & Swing · you can swing a frigate"* vs *"Skirmish · you turn 40%
faster"* — so the choice is expressed as playstyle, never as stats.
**Build on:** `getDerivedStats`, `handlingProfile`, `massDelta` all already compute the comparison.
**Cost:** a save-schema key with a declared cap, plus a preset rail in THE SHIP's APRON.

### 3. The watch list — your own dashboard

Pin anything: a commodity price, a faction's standing, a contract deadline, a rival, a sector's
danger. Pinned items appear as a compact strip on the HUD and as the default view when you open the
relevant instrument. **Verified absent.**

This is the MMO move that makes a deep simulation personal. The game already tracks far more than a
player can hold in their head; a watch list lets *the player* choose which slice of it follows them
around, instead of a designer guessing. It also gives the Chart's staleness model somewhere to
matter — a watched price that has gone stale can say so.

**Cost:** small. A pinned-ids set in save state, a resolver per entity type (shared with idea 1), and
one HUD strip. **Pairs with idea 1** — if everything is a link, everything is pinnable by the same
handle.

---

## Tier 2 — high value, contained

### 4. The re-entry digest

Menus pause the world (owner ruling). So every time you close one, you resume a world you stopped
watching. Right now nothing tells you what changed.

A brief, non-blocking line on resume: *"While you were reading: the convoy departed · Vane is now
hostile · iron ore fell 12 at Ceres."* Three items maximum, and only things you were plausibly
tracking (watched items, your contracts, your sector).

**Why:** it turns pausing from a break in the fiction into a *deliberate beat* — you stopped, you
thought, you came back informed. It is also the honest counterweight to a pause-heavy design.
**Build on:** the one-voice arbiter and the reserved receipt lane already exist. **Cost:** low.

### 5. Recallable event history

Toasts vanish and cannot be recovered — **verified: `toasts.js` has no history.** If a player looks
away for four seconds, that information is gone permanently.

A scrollback for transient messages, opened from the HUD. **This is distinct from THE FOOTPRINT:**
the Footprint is *consequence* (what you did and what it cost); this is *events* (what just
happened). Conflating them would make both worse.
**Cost:** low — a ring buffer with a declared cap and a drawer. High relief per unit effort.

### 6. Player-authored chart notes

Let the player drop a labelled pin on the Chart. **Verified absent.**

Strategic games become personal when the player can write on the map — *"cheap ore here," "ambushed
here," "come back with a bigger spool."* It costs almost nothing and it is the clearest possible
expression of "the world outside the immediate view" being *understood* rather than merely displayed.
**Build on:** `pickMapTargetAt` and the existing camera/bookmark machinery. **Cost:** low.

### 7. Global find

The Chart has search. Nothing else does. **Verified: no global search exists.**

One key opens a find-anything field — commodities, modules, ships, factions, contracts, sectors,
people — with results that route to the right instrument. In a game with 47 commodities, 49 modules,
22 weapons, 13 hulls, 24 sectors and 14 factions, *search is a navigation primitive*, not a
nice-to-have.
**Pairs with idea 1** — same resolver, different entry point.

---

## Tier 3 — worth doing, lower urgency

### 8. Compare mode

Two things side by side, sharing one axis: two ships, two fits, two stations' prices, two routes.
The game computes every number needed and never once places two of them next to each other.
Especially valuable in the shipyard, where the question is always *"is this actually better for how
I fly?"* — which a single-column stat list cannot answer.

### 9. Aspirational browsing

Let the player look at ships and modules they cannot yet afford, with the capability sentence shown
and the gate stated plainly. Progression needs a *visible horizon*; "what could I do" is the engine
that makes "what can I do now" feel like movement. Directly addresses the owner's *"I'd hoped that
moving further into the game you'd unlock new weapons and powers."*

### 10. World hover

Hovering any object in flight names it and gives one line of context, without selecting or committing.
Turns the world itself into a tier-2 "why" surface, and teaches the bestiary passively during play
rather than in a menu.

---

## Deliberately rejected

Recorded so they are not proposed again.

| Idea | Why not |
|---|---|
| A separate stats / achievements screen | Fold into THE FOOTPRINT. A second history surface splits the record and halves both. |
| Fleet management screen | VISION.md forbids the empire manager. **The player never issues an order to anything but their own ship** — wingman commands stay a HUD verb, not a screen. |
| Auction house / player market | No multiplayer, and it would pull the economy away from physical intervention toward spreadsheet arbitrage. |
| Skill *points* to allocate | Progression is *physical agency*, not a stat budget. A node grants a verb, never a slider. |
| Minimap in addition to radar | Radar already owns that job; a second spatial widget competes with the thing it duplicates. |
| Tutorial popups | THE RANGE replaces them. A physics game teaches by being flown, not by being read. |
| Damage numbers floating over enemies | That is the HP-bar dogfighting VISION.md explicitly forbids. Impact is expressed as momentum and consequence. |

---

## Sequencing note

**Ideas 1, 3 and 7 share one resolver** (entity id → dossier + label + route). Building that resolver
once in Phase 0 makes all three cheap and makes every later screen more valuable as it lands.
Building the screens first and retrofitting the resolver costs several times more.

*That is the single most important scheduling consequence in this document.*
