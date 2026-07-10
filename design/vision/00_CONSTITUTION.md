# 00 — Product Constitution (supporting product framing)

> **Current authority banner:** root `ARCHITECTURE.md` (technical) > `design/GDD_2_0.md`
> (design) > `design/spec2/00_MASTER_TASTE.md` (taste/rejection).
> `design/vision/ALPHA_PROGRAM.md` owns current execution order and solo-alpha scope beneath that
> chain. This file records supporting product framing and cannot override that chain.

**Status:** SUPPORTING PRODUCT FRAMING — not an execution or override authority.
**Owner:** Lead / human. Agents implement; they do not renegotiate pillars without an explicit human edit to this file.

Use this document for product intent only when `design/vision/ALPHA_PROGRAM.md` cites it. If its
historical framing conflicts with root `ARCHITECTURE.md`, `design/GDD_2_0.md`,
`design/spec2/00_MASTER_TASTE.md`, or an activated task spec, the higher authority wins.

---

## 1. One-sentence product

A **browser/PC open space sandbox** in the *spirit* of Freelancer (travel grammar, living chart, pilot agency) but with **original IP, names, and voice**: dense places, strategic trading/combat/mining, **massline as the signature verb**, **flight that is easy to pilot**, and a **liquid-glass strategy UI** dense with *data*, not walls of text.

---

## 2. Pillars (must serve at least one)

1. **Playable first.** Soft death is fine; dying every few seconds is not. Fair TTK, readable enemies, undock grace, power-fantasy early game. **Flight must be easy to pilot** — weird center-spin physics and unreadable bank are bugs.
2. **Ship has a body.** Real nose / stern, readable bank, massline lever arm at the front — not a puck spinning on a center pin. **No sore-thumb geometry** (floating white boxes, junk pivots).
3. **Massline is the toy.** Latch must work at combat speed (wide cone + Flyby Focus). Swing, reel-in, cut-whip must be usable strategies.
4. **Open chart travel (Freelancer-like).** Open charted space; jump gates = go fast / continuous feel; **no loading screens** if we can help it. Density per system > empty radius.
5. **Living systems.** Economy, factions, traffic, encounters — player actions ripple. Empty “one rock pile in a void” is a bug.
6. **Strategy UI, glass chrome.** Information density: prices, risk, mass delta, route, heat. Help is hover/first-run only. **No prose spam** in station hubs.
7. **Wonder & polish — no quality cliffs.** Authored assets, lighting, VFX, audio, portraits. Every surface in a hero frame should survive a 5-second sore-thumb test. Iterate with shots and scores (`06_OPERATING_MODEL.md`).
8. **Original identity.** Inspired by classics, **not derivative cosplay** (rename Freelancer-clone ship names; cinematic portraits not cartoon stickers).
9. **Building later.** Claims/automation/empire (Mindustry-adjacent) only after 1–8 make a 30–60 min session fun.

---

## 3. Explicit non-goals (for now)

| Non-goal | Why |
|---|---|
| Full 1:1 galaxy / Elite scale | Wrong scope; 10–30 rich systems beat empty infinity |
| Star Citizen interiors / seamless FPS | Different product |
| Multiplayer as Wave 1–4 requirement | High cost; solo must be excellent first |
| Difficulty for its own sake | Current game is already too lethal |
| Visor/cockpit HUD as mandatory aesthetic | Optional later; not the product identity |
| Editing goldens to fake green | Fix code or re-record deliberately with named reason |

---

## 4. Control & combat fantasy (locked intent)

### Modes (must be obvious in UI)

| Mode | Player does | Computer does |
|---|---|---|
| **Gunnery** | Aim with mouse | — |
| **Combat computer** | Fly / massline | Lead guns, hold lock, optional pursuit |
| **Flyby Focus** | Tag with massline in the window | Slow time, frame camera on you + targets, **widen latch magnet** |

### Massline

- Default latch: **generous cone / soft snap**, not pixel-perfect cursor only.
- Spool is a **real nose lever** (not ~0.38×radius near COM).
- Hold reel-in / cut-out must be taught once and reliable.
- Flyby Focus: high relative speed near hostiles → zoom to keep combatants framed + time dilation + expanded latch radius.

### Difficulty philosophy

- Prefer **assists and clarity** over “git gud” gates.
- Soft respawn stays; **death rate must fall** via fairness + tools, not by making death harsher.
- Enemies must show **intention** (approach, orbit, break, flee) — not zip-flip-fire chaos.

### Travel

- Sector graph OK under the hood (like Freelancer systems).
- Gates: charge → streak → arrive; **no black loading UI**; amortize spawns; prefetch neighbors.
- Continuous feel > true seamless streaming on day one; streaming is a later tech goal if still needed.

---

## 5. UI law (liquid glass + strategy density)

### Visual

- **Liquid glass** panels allowed (blur / translucency / depth). Perf: quality toggle; not a ban.
- Modular component system: Panel, TabRail, DataTable, StatChip, Sparkline, Modal, MapChrome, Toast.
- One visual language for flight chrome, station, map, outfit.

### Information

- **Dense = scannable data**, not essay text.
- Primary numbers always visible: credits, cargo, hull/shield, target layers, price, payout, risk, distance.
- Cut “Market loop:” purpose banners, multi-paragraph mission guides, duplicated hints.
- First-time coach: one line, once; then silence.

### Anti-patterns (reject)

- Walls of instructional copy in station tabs.
- Ten competing fixed panels with no hierarchy.
- Hiding autopilot / pursuit / massline modes so only veterans find them.

---

## 6. World density law

A “sector” must feel like a **place**:

| Minimum in a playable starter system | Intent |
|---|---|
| 3+ landmarks you can find without a wiki | Stations, fields, gates, POIs with radar/map names |
| Visible traffic | Freighters, patrols, not empty sky |
| Something to do in 60 s | Mine, dock, scan, short fight, or route set |
| Safe undock bubble | No instant pirate delete at spawn |

Empty thousands-of-wu voids between one rock cluster and nothing are **content bugs**.

---

## 7. Acceptance ritual (every wave)

Agents may not claim DONE without:

1. **Named automated checks** for the wave (if any) green — *and* new tests added if a bug class recurred.
2. **Playtest rubric + fun judgment** — is this more fun or still lame? (required prose in handoff)
3. **Quality ritual** per `06_OPERATING_MODEL.md`: multi-iteration screenshots (target 10–20 for visual/feel), **weighted scores**, no dimension left in the sore band.
4. **Sore-thumb sweep** on every touched surface (e.g. starter ship emissive junk).
5. **Screenshot / capture** (`.devshots/vision/…`); video when motion is the claim.
6. **Update** `01_CURRENT_STATE.md` and the active wave row in `03_MASTER_BUILD_PLAN.md`.

Transcripts are not proof. Green checks while fun is red = **not done**.

**Open-ended duty:** deduce and implement genre must-haves (see `06_OPERATING_MODEL.md` §5) without waiting for the human to list them — stay inside non-goals.

---

## 8. Relation to prior research

Genre pillars we deliberately target (see `02_RESEARCH_SYNTHESIS.md`):

- Freelancer travel + living local space  
- Star Valor / Endless Sky outfitting clarity  
- Rebel Galaxy density feel  
- X4/EVE *light* ripple (not full MMO)  
- NMS lesson: polish + iterative wonder, not empty procgen  

We do **not** chase Star Citizen feature parity.
