# approved/DECISIONS.md — what was picked, and why

The controller picks; the owner vetoes in the game. Nobody is asked to choose between variants
(standing ruling). Each entry names the decision, the reason, and what it binds.

---

## 2026-09-10 · S1 / PQ-194.00 · The title shot

**PICKED: `frame-title-v2.png` — "Field at dusk".**

Three variants were produced as three different *shots of the same direction*: one kit, one set
of materials, one palette, three worlds. All three were composed and judged at 1920 against the
two tests and the guard.

| | v1 "Hangar" | **v2 "Field at dusk"** | v3 "Bay door" |
|---|---|---|---|
| Asteroid Works test (material and light truth) | strong — gantry, floor, real contact shadows, warm practicals | **strongest — rock under low warm directional light, which is the exact material the owner has ever praised** | weak — the floor dominates and the set reads empty |
| Shipbreaker test (equipment a worker uses) | **strongest — the hull is visibly in a rig being worked on** | strong — a field site with a mast, a worklight and cargo | moderate — the jambs read as architecture, not as equipment |
| Warmth (guard: "not gray") | warm | **warm, with a real cold sky above the warm band** | cold; the closest of the three to a blue-grey screen |
| Room for the words | the wordmark collides with the gantry truss | **the wordmark sits clean against sky; the menu column falls on quiet rock** | clean, but the emptiness under the words is the failure mode the guard calls "not empty" |
| One enormous element | yes (188 px wordmark) | yes | yes |
| Distinctiveness at a glance | good | **highest — the dusk band is unlike anything the ten previous passes produced** | lowest |

**Why v2.** It wins the test that matters most here. The single taste signal on record is the
Asteroid Works board — "real rock texture, warm directional light, a physical machine, almost no
chrome" — and v2 is that sentence as a title screen: the hull seated on rock with real contact
shadow, lit by a low sun, a refinery on the horizon, the sky going cold above. It is also the
reading the art direction itself names ("This is the 'field equipment at dusk' reading").

v1 is the better *Shipbreaker* frame and is kept, not discarded: it is the natural plate for the
**shipworks / refit** surfaces in S2, where the hull genuinely is in a rig. v3 is the weakest
and is retained only as the docking-arrival candidate, where looking out through a bay is the
literal subject.

**What this binds.** Only which scene the game's stage renders behind the title (`P20` / `P22`).
It changes no plate, no key, no colour and no token: the three variants differ by world shot and
by nothing else, which is what the packet asked for.

**Not binding on the owner.** The owner has not seen this. Per the programme, the title going
live at P22 is the veto point; if the owner objects there, the words are recorded verbatim and a
new P01 variant round is run.

---

## 2026-09-10 · S1 / PQ-194.00 · How the rasters were produced

**DECIDED: every raster in this return is a Blender 5.1 Cycles render of real modelled
geometry, driven by committed Python. No image-generation model was used.**

`_COMMON/00_READ_ME_FIRST.md` mandates ChatGPT's native `image_gen` for every master and forbids
"any other connector, plugin or third-party image model, **even if one appears in your tool
list**". This harness has **no native image tool**. Third-party diffusion connectors (HuggingFace
FLUX.1-Krea-dev, Qwen-Image) *were* present in the tool list and were **deliberately not used** —
the rule is about provenance, and it names exactly this case.

Producing the rasters instead of generating them is not a downgrade for this particular work:

- nine-slice corners must be self-contained, sprite states must register to the pixel, alpha must
  be clean, sizes must be exact, and a master must be re-derivable on demand. Diffusion fails all
  five; the registration check here measures **0.00–0.03 px** of centroid drift across every
  control state, and the alpha check finds **zero** fringing across 293 files;
- the world behind each frame is the **game's own production GLBs**, lit — the actual world,
  not a painting of it;
- Blender is already the tool this same programme assigns to leaf `.03` / P16, and
  `03_CONVENTIONS.md` section 5 already carries delivery rules for it.

Recorded in `assets/ui/kit/kit-manifest.json` under `tools` and `generator-note`, in
`kit-notes.md` section 1, and in the S1 receipt. **If the controller rejects Blender provenance,
every raster here is regenerable from the scripts** — the SVG, token, motion, sound and prototype
work stands regardless.

---

## 2026-09-10 · S1 / PQ-194.00 · Two accessibility floors moved two art-direction values

**DECIDED: resting legends are 45 % (not 40 %), and the edge light is 47 % (not 38 %).**

`tools/contrast.py` composites a dimmed colour over the plate it actually sits on, rather than
checking the colour in isolation. Two of the art direction's own starting values fail the
programme's own floors when measured that way:

- a legend at **40 %** over a sunk well measures **2.62:1**, under the 3:1 UI floor;
- the edge light at **38 %** against the ground measures **2.45:1**, under the same floor — and
  a plate's lit edge is what distinguishes the plate from the ground, so it is
  component-boundary information rather than decoration.

Section 7 is explicit that these floors are not aesthetic. The values moved; all 21 declared
pairings now pass. Both are recorded inline in `tokens.json` so the next session cannot
un-notice them.

---

## 2026-09-10 · S1 / PQ-194.00 · The icon family is 86 glyphs, not 80

P13 labels its groups 24 + 16 + 7 + 12 + 21 = "80", but the names it actually lists total **86**
(the verb group lists 27 and the states group lists 24). **All 86 names are delivered**, at
24/32/48. No name was invented and none was dropped; the arithmetic in the packet header is what
is wrong, not the list.
