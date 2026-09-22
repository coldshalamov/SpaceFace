<!-- LIFETIME: STABLE -->
# The bar

What "indistinguishable from a 2026 A-list game" means for this tree, written down so a pass can be
judged instead of argued about. Read with [`../../docs/UI_VISUAL_ITERATION.md`](../../docs/UI_VISUAL_ITERATION.md),
which is how you look at a screen. This file is what you are looking *for*.

Owner bar, verbatim: **consistent, high-detail, creative, interactive, non-generic.**

---

## 1. The one decision this file exists to protect

**Deckplate is the design system.** `src/ui/deckplate/` — tokens, materials, components, hardware.
It is the fourth system this tree has grown and the only one derived from an owner signal rather
than from a spec document. Its own header states the plan that was never carried out:

> The flight HUD is the first surface built on it; station, pause and the chart follow by
> **assembly, not by new styling**.

Everything below serves finishing that sentence. The failure mode this tree has repeated five times
is writing system number five. Symptoms of that failure, all present today:

| Prefix | Declarations | What it was |
|---|---|---|
| `--k-` | 926 | Field Hardware "kit", `styles/kit.css` |
| `--sf-` | 501 | "Instrument grammar", `styles/ui.css` |
| `--fh-` | 420 | The produced Cycles kit, `assets/ui/kit/tokens/` |
| `--dp-` | 112 | **Deckplate — the one that stays** |
| `--of-` `--so-` `--aw-` `--mf-` `--lab-` `--glass-` `--console-` `--visor-` | ~700 | one-screen roots |

274 distinct custom properties. Four faces declared across three systems. **Adding a fifth root is
the defect, not the fix.** Migrate onto `--dp-`, alias the rest while screens are in flight, delete
the aliases at the end.

---

## 2. The positive bar — what an A-list 2026 screen actually does

Not decoration. These are the things that separate a shipped interface from a prototype.

**Material, not theme.** A surface is lit metal, etched legend, and a lamp — things with a physical
story — rather than a `background-color` and a `border-radius`. Light has ONE direction (Deckplate:
top-left, warm key). A bevel is lit on the key side and shadowed on the other. This is why the
deckplate integrity cluster is the best-looking thing in the game today and the market panel is the
worst: one is a material, the other is a rectangle.

**One accent, spent on state.** Deckplate's warm lamp at three heats (dim → live → hot) plus the
same lamp driven red for failure. A screen at rest is ~80% metal and bone. Colour arrives when
something *changes*. A screen where the accent is worn as chrome has no way to shout.

**Hierarchy you can read in 200 ms.** Exactly one display-sized element per screen. Everything else
descends from it in deliberate steps. Squint at the PNG: if three things compete, it fails.

**Anchored geometry.** Every panel sits on a shared grid and a shared margin. Nothing floats at a
coordinate somebody typed. Two panels on the same screen share an edge or they are far apart — near
misses read as a mistake, because they are one.

**State has a second channel.** Colour never carries meaning alone: a word, a glyph, or a shape
carries it too. This is an accessibility floor *and* the thing that makes an interface feel
authored.

**Motion bound to a cause.** A value settling, a latch seating, a plate waking. Nothing exceeds
180 ms, nothing loops without a real progress source, everything respects `motionReduce`.

**Density is a choice, not an accident.** Instruments are dense on purpose; menus breathe on
purpose. Both are fine. What is not fine is a screen that is dense in one corner and empty in
three-quarters of the frame because nobody composed it.

**Every control earns its place.** It does something you can name, you have seen the state it
opens, and a disabled one looks disabled. `--walk` proves this; "no visible change" is a bug.

---

## 3. The tells — what marks an interface as vibe-coded

Every one of these is currently in the game. The screenshot that proves it is named.

1. **A debug identifier as a hero title.** `SECTOR_HELIOS`, underscore and all, at 96 px. *(chart)*
2. **A painted box with nothing in it.** A 64×787 black rail down the title screen; a 276×40 black
   bar on the flight deck; an empty plate where a price chart should be. *(title, flight, market)*
3. **Type printed on type.** "you pay · per unit" over the body paragraph; three panels of text
   mashed into the bottom-left corner. *(market, chart)*
4. **A hero number cut in half by a button cluster** that was positioned independently of it. *(ship)*
5. **Panels floating in a void** with no shared edge, no grid, no margin. *(ship)*
6. **Five panel treatments on one screen** — bevelled grey, green tint, flat card, double border,
   circle. *(market, flight)*
7. **Generic rounded-rect buttons** in a row: Fewer / More / Max / Buy / Sell. Grey fill, 6 px
   radius, no material, no state. *(market)*
8. **A wall of identical pills** standing in for information design — eleven of them. *(chart)*
9. **Contradictory simultaneous copy.** "TAKING FIRE" while the panel reads "THREAT Clear". *(flight)*
10. **Build metadata shown to players.** `v0.1.0 · 24bb3d0c37e8`. *(title, pause)*
11. **Naked text as a menu.** No affordance, no hit target, no state. *(title)*
12. **One accent used arbitrarily** — a peach block for Resume against dark green for everything
    else, with no rule behind it. *(pause)*
13. **A section header over nothing** — "DEV" with an empty bar under it. *(pause)*
14. **The screen occupying a quarter of the frame** with the rest left to the backdrop. *(pause)*

Generic web tells to stay clear of on top of those: purple→blue gradients, Inter/Roboto/system-ui,
a 1px grey border on every card, a coloured 3–4 px left rail as the only state cue, `shadow-lg`
`rounded-2xl` defaults, evenly-distributed timid palettes, three feature cards in a row.

---

## 4. The gate — a screen is done when all of this is true

Run per screen, on the real PNG, in the same pass:

```
node scripts/ui-bench.mjs --shot=<id>          # then OPEN the png
node scripts/ui-bench.mjs --shot=<id> --walk   # then OPEN every png it adds
```

- [ ] The bench prints **no** ON TOP OF, BURIED, CUT OFF, OVERLAP, CLIPPED, OFF FRAME, or EMPTY BOX.
- [ ] Every colour, size, radius, duration and face on the screen comes from `--dp-*`. No new root,
      no hand-mixed hex, no one-off curve.
- [ ] One display element. Squint: the hierarchy survives.
- [ ] Panels share a grid and a margin with each other and with the rest of the game.
- [ ] Accent is spent on state, not worn as chrome.
- [ ] Every visible control did something nameable under `--walk`, and disabled reads as disabled.
- [ ] Nothing a player should not see: no identifiers, no hashes, no placeholder copy.
- [ ] It looks like the same game as the screen before it in the player's path.

The bench finding list is necessary and not sufficient. **The picture can be clean and still be
cheap.** You are the reviewer; the PNG is the evidence.

---

## 5. Sources

Research round, 2026-09-22, recorded so the frame is auditable rather than asserted:

- [The 4 Types of Game UI: Diegetic vs Non-Diegetic Design Guide 2026](https://superfiles.in/game-ui-design-guide-diegetic-spatial.php)
- [Game UI Type Systems: HUD to Handheld](https://www.sidebearings.com/game-ui-type-system/)
- [HUD in Video Games: Meaning, Examples & Design Guide](https://sunstrikestudios.com/en/blog/HUD_design_in_games/)
- [AI Design Slop: Why AI-Generated UI Looks Generic — and the Fix](https://smoothui.dev/blog/ai-design-slop)
- [anti-slop: rules for filtering generic AI-generated UI](https://github.com/miqdadbadjuber/anti-slop)
- [Game UI Database](https://www.gameuidatabase.com/) — reference library for shipped screens

The useful half of that reading is already encoded in §2 and §3. Do not re-research; iterate.
