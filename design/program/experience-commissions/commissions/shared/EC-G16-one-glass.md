# EC-G16 — One glass — an interface that cannot overflow or overlap

**Direct execution commission · Shared system**
**Commissioned by the creative director, 2026-11-09.** Standard and build order: [09 — Creative direction](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/09_CREATIVE_DIRECTION.md).
**Native parents:** `X3`, `X5`, `P1`, `P2`, `Q3`; Lane 3 owns `src/ui/**` and `styles/**`. Design direction stays `design/frontend/ORRERY.md`.

## Why the interface is still bad after four hundred fixes

Measured on master, 2026-11-09:

| Fact | Number |
|---|---:|
| Lines of stylesheet | 23,257 across 28 files |
| Window-size special cases (`@media`) | 390 |
| Elements placed by hand (`position: absolute/fixed`) | 462 |
| Stacking-order declarations (`z-index`) | 217 |
| Script files that position things with inline styles | 59 |
| Script files that create their own page elements | 259 |
| `ui-polish-NNN` pull requests so far | 443 (357 merged) |

Every one of those pull requests fixed one screen at one window size ("960x540 station head readings…", "1101–1439 × ≤800 flight brief…"). Each was correct. None could stop the next one being needed, because the interface is placed by hand per screen and per window size, and because any gameplay system that wants to tell the player something builds its own popup from scratch. That is where the borderless, unpadded, off-style popups and the overlaps come from: they were never part of the interface at all.

**So this commission does not polish screens. It removes the ability to make the mistake.** Four pieces, in this order.

## 1. The Kit Page — the place agents iterate

One static page that opens in under a second with no game running. It shows every component in every state, filled with the nastiest content the game can produce: the longest ship name, a seven-digit price, a three-line mission title, a label twice as long as English, an empty list, a list of two hundred. It shows each at three sizes: phone, small laptop (1366×768) and desktop (1920×1080).

Build it on the existing bench (`tools/ui-bench.html`, `node scripts/ui-bench.mjs`). This is the answer to "agents boot the whole game to look at a button". A component is designed, argued over and approved **here**. It is the pixel reference.

## 2. Twelve components, and nothing else

Panel · Card · Row · Stat · Button · Tabs · List · Dialog · Toast · Tooltip · Prompt (the in-flight key hint) · Meter.

Each component owns its own frame, padding, type size and — the important part — **its own answer to "what if the text is too long"**, declared once: wraps to N lines, or shortens with an ellipsis and shows the full text on hover/focus. Never "whatever happens".

A screen may only *arrange* components. Screen-level styling may not set a font size, a hand position, or a stacking order. If a screen needs something the twelve cannot do, the answer is a thirteenth component on the Kit Page, reviewed there — not a local exception.

## 3. The Stage — one door for everything that pops up

The flight screen gets six named slots: top-centre banner, top-right feed, centre dialog, bottom-centre prompt, left objective, right contact. Station and menu screens get the dialog and toast slots.

Everything that appears over the game goes through one call: *show this component in this slot*. One thing per slot at a time; the rest queue. Because the Stage hands out the frame, the popup cannot be borderless, cannot be off-style, and cannot sit on top of another one.

Gameplay code stops creating page elements. Find every place outside `src/ui/` that builds its own (the 259-file list is the worklist), and route it through the Stage.

## 4. The Inspector — the robot that replaces the four hundred pull requests

One command that opens every screen and every popup on the bench, at the three sizes, with worst-case content, and fails on any of:

- text that is cut off or spills out of its box;
- two boxes overlapping that are not parent and child;
- anything on the flight screen outside a Stage slot;
- a popup without the kit frame;
- a page element created outside `src/ui/`.

It prints the screen, the size and the element, and saves the picture. It runs on stills, so it takes seconds. From the day it exists, **no pull request may fix one screen at one size.** A defect it reports is fixed in the component or the slot, so the same defect is fixed everywhere and cannot return.

## Order of work

1. Kit Page with the twelve components, approved by looking at it.
2. The Stage, and every in-flight popup moved onto it. This is what the player sees most.
3. The Inspector, turned on as a required check.
4. Move screens across in order of how often a player sees them: flight HUD → station tabs → ship and refit → map → menus and settings. Delete the old styling as each screen moves.

## How to build this without fooling yourself

- Look at the picture. After every change, shoot the bench (`node scripts/ui-bench.mjs --shot=<id>`), open the image yourself, and compare it with the Kit Page. Do not report a screen as done from a passing check alone.
- Walk every control on a screen you changed (`--walk`) before calling it done.
- Keyboard, controller and reduced-motion behaviour belong to the component, so they are tested once on the Kit Page.
- Do not start a new design language. ORRERY is the direction; this is the machinery under it.
- When a screen fights you, the component is wrong. Fix it on the Kit Page.

## Finish line

- The Inspector passes on every screen and popup at all three sizes.
- Stylesheet under 8,000 lines; window-size special cases under 40; no hand-placed element outside the kit and the Stage.
- No page element created outside `src/ui/`.
- The `ui-polish-NNN` series is closed: open ones are merged if still correct, otherwise closed with a pointer here.
- **Stranger Test for an interface:** a first-time player, on a small laptop, is never shown a cut-off word, two things on top of each other, or a popup that looks like it came from a different game — across the first hour.

## Explicitly reject

Another round of per-screen fixes. A new visual style. A component library nobody is forced to use. An Inspector that warns instead of failing. A Kit Page that shows only friendly content.
