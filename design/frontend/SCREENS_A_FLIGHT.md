<!-- LIFETIME: ACTIVE -->
# Screens A — The Flight Layer

**Binding parent:** [`INSTRUMENT_GRAMMAR.md`](./INSTRUMENT_GRAMMAR.md). Type, colour roles, motion
verbs, disclosure tiers, naming, banned patterns and the definition-of-done all come from there and
are not restated. Where this document gives a number, that number is the implementation value.

**Craft rulings retained from** [`../HUD_FLIGHT_ATTENTION.md`](../HUD_FLIGHT_ATTENTION.md): no
floating boxed cards, no 7–8 px tracked labels, one destination line, receipts as thin type in a
reserved lane, no visor / cockpit / helmet motif, Massline owns bottom-centre while latched.
**Superseded on direction:** the HUD gets *richer*, not quieter. Density is the goal; the centre
stays clear.

**Product authority:** [`../VISION.md`](../VISION.md). Every surface below exists to make the
sentence *"I understand how this world moves, and I can use that to do ridiculous things"* legible
on the glass.

---

## 0. The one idea, and how §6 maps here

> **The flight layer is one instrument: a rank of physical verbs along the bottom edge, a live
> world above it, and nothing in between.** The rank is permanent, it grows as the ship grows, and
> it is the first thing a stranger sees when they look at a screenshot.

The grammar's CREST / STAGE / APRON skeleton is written for full-screen instruments. On the flight
layer it maps as follows, and an implementer must not try to force the boxed version:

| §6 zone | Flight-layer identity | Notes |
|---|---|---|
| **CREST** | the top band: one-voice danger line + the single destination line | transparent, no housing, no controls — same 12 % of frame height |
| **STAGE** | **the sector itself.** The centerpiece object is the live world; the manipulation verb is **FLY** | this is the §2 *RANGE* archetype played for real |
| **APRON** | the bottom band: ship instrument · **Power Rail** · drive band · contact dock | the APRON's "≥ 1 verb" rule is satisfied nine times over |
| **DRAWER** | the **Quick Fan** — grows upward out of the Rail on `Alt`, never modal | slides from an edge, never modal-over-modal |

The flight layer's single **DISPLAY**-sized element is the **speed number**. It is currently
17 px Saira 700 (`.sf-stat--speed .sf-stat__v`, `injectHudCss`) which is below the DISPLAY range;
raise it to **28 px**. Nothing else on the flight layer exceeds SUBHEAD (22 px), and nothing on the
Power Rail exceeds **15 px**.

---

## 1. The frame — space budget, reserved regions, permanence

### 1.1 The Clear Field (law)

> **CLEAR FIELD = x ∈ [24 %, 76 %] of width, y ∈ [12 %, 68 %] of height.**
> At 1440×900 that is the rectangle **x 346–1094, y 108–612**.

Nothing opaque may render inside it. Exactly four exemptions, all of which are *about* the world
rather than *over* it:

1. World-anchored marks — target arcs, lock diamond, lead pip, prograde tick, Massline release
   diamond, mass-seed lock marker, doctrine tells, objective diamond.
2. The reticle.
3. The one-voice alert floor (`src/ui/alerts.js`) at its top-centre home, which sits above y = 108.
4. Impact stamps (§8) — transient, ≤ 400 ms, ≤ 4 concurrent.

A summoned transient (the Quick Fan) is *not* exempt: it is sized so it cannot reach the Clear
Field (§9.2).

### 1.2 Reserved rectangles (1440×900; all measured from the frame edges)

| Region | Anchor | Size | Permanence |
|---|---|---|---|
| **Ship instrument stack** | left 12, bottom 12 | 272 × 150 | permanent |
| **Power Rail** | horizontally centred, bottom 10 | **516 × 46** | permanent |
| **Drive band** (speed, drive state, travel tape) | centred, bottom 64 | 360 × 32 | permanent |
| **Massline lane** | centred, bottom 96 | 420 × 54 | contextual — latched only |
| **Contact dock** (radar + roster + target card) | right 12, bottom 12 | 232 × 210 | permanent (roster collapses) |
| **Destination line** | left 12, top 56 | 300 × 20 | permanent |
| **Receipt lane** | right 12, top 56 | 320 × 36 | contextual |
| **One-voice floor** | centred, top 18 | 440 × 26 | contextual |
| **Quick Fan** | grows from Rail centre | 264 radius half-fan, top edge ≥ y 712 | summoned |

**Rail geometry, derived from the 12 px type floor, not chosen for looks.** A tile must hold a
26 px icon box plus a 12 px DATA keycap plus a 12 px DATA numeral without any of them shrinking.
That forces a **46 px tile at ≥ 1440 px wide and a 44 px hard floor everywhere else.**

```
band = 3 tiles + 2 inner gaps      = 3×46 + 2×5   = 148
rail = 3 bands + 2 band gaps       = 3×148 + 2×13 = 470
rail + brake cell (gap 16, w 30)   = 470 + 46     = 516     height 46
```

At 1280×720 the tile is 44, inner gap 5, band gap 12, brake 28 → **494 × 44**. Below 1100 px wide
the tile drops its cooldown numeral and its count numeral and keeps icon + keycap only. **Type
never shrinks; content is dropped instead.** There is no size below 44.

Clearance check at 1440: rail spans x 462–978; left stack ends at 284; right dock begins at 1196.
At 1280 (where `injectHudCss` narrows the stacks to 236 / 200): rail spans 393–887; stacks end at
246 and begin at 1070.

### 1.3 Ink budget

| State | UI area | Ceiling |
|---|---|---|
| Cruise, nothing selected, no receipts | ≈ 10.9 % of frame | — |
| Fight: + massline lane + 2 receipts + target card | ≈ 13.6 % | **15 % hard** |

**No state may exceed 15 %.** If a new surface would cross it, an existing one is deleted. This is
checkable: sum the reserved rectangles that are currently visible.

### 1.4 Permanence classes

- **Permanent** — Ship instrument, Power Rail, drive band, contact dock, destination line. Always
  mounted, always in the same pixels.
- **Contextual** — Massline lane, target card, receipt lane, one-voice floor, weapon-heat rows,
  travel tape. Mount on a named state, unmount when it clears. Never leave an empty housing behind.
- **Unlocked** — individual Rail tiles. A tile's *socket* is permanent from minute one; its
  *housing* arrives when the power is granted (§9 "earned reveal").

`hudLayout.js` Ctrl-drag repositioning applies to the ship stack, contact dock and Rail. A dragged
Rail keeps its own internal geometry and still refuses to enter the Clear Field: clamp on drop.

---

## 2. SURFACE A — **The Power Rail**

> *"Boxes for the different powers you could accumulate on the HUD, activated by the number keys."*

### 2.1 Concept · archetype · verb

| | |
|---|---|
| **Concept** | The nine physical verbs your ship can perform, laid out as a rank you read left-to-right in three bands of three. |
| **Archetype** | **a rack you pull from.** Not a toolbar — a rack of ordnance, deployables and rig switches bolted to the bottom of the frame. |
| **Primary manipulation** | **FIRE** — press the number, the thing happens. Secondary: **SWAP** (Alt + hold a digit). |
| **Centerpiece object** | the rank itself. Its silhouette — three groups of three plus a detached brake wedge — is unlike any other surface in the build. |
| **Silhouette test** | with all text removed: three clusters of squares and one detached wedge. Nothing else in SpaceFace looks like that. |

### 2.2 The band model

Slots are grouped by **what kind of physical agency they are**, not by cooldown or damage. The
grouping is the teaching.

| Band | Slots | Identity | What every member has in common |
|---|---|---|---|
| **ORDNANCE** | 1 · 2 · 3 | *what comes off your rack* | instantaneous, consumable or cooldown-gated, leaves nothing behind |
| **FIELDWORK** | 4 · 5 · 6 | *what you put in the world* | spawns a bounded object that persists, has a lifetime, and can be shot |
| **RIG** | 7 · 8 · 9 | *what you switch on* | ship-attached, sustained, toggled, metered |

**This grouping costs zero rebinding.** `VERB_BINDINGS` already ships `Digit4 → deployMassSeed`,
`Digit5 → deployWell`, `Digit6 → deployRepulsor`, `Digit7 → toggleClearingCone`,
`Digit8 → toggleSkimCollector`. The bands were latent in the existing table; this document only
names them and gives them faces.

### 2.3 The slot map

`alias` is the letter that already fires the verb and **keeps firing it**. Multi-code bindings are
the house idiom already (`tether: ['Space','KeyF']`), so a slot digit is *added* to the action's
code array, never substituted.

| # | Power | Action id | Codes after this change | Kind | Granted by |
|---|---|---|---|---|---|
| **1** | **IMPULSE CHARGE** | `chargeThrow` | `Digit1` + existing scheme letter | tap → lob | `mod_charge_rack` / `mod_charge_vector_rack` fitted **and** charges in cargo |
| **2** | **DETONATE** | `chargeDetonate` | `Digit2` + `KeyR` | tap | ≥ 1 armed charge in the world |
| **3** | **COUNTERMEASURE** | `countermeasure` | `Digit3` + `KeyX` | tap → burst | `mod_chaff_dispenser_m` / `mod_ecm_jammer_l` fitted |
| **4** | **MASS SEED** | `deployMassSeed` | `Digit4` *(unchanged)* | tap → ballistic deploy | ungated |
| **5** | **WELL** | `deployWell` | `Digit5` *(unchanged)* | tap → deploy at aim point | `FIELD_FLAGS.enabled` |
| **6** | **REPULSOR** | `deployRepulsor` | `Digit6` *(unchanged)* | tap → deploy at hull | `FIELD_FLAGS.enabled` |
| **7** | **CLEARING CONE** | `toggleClearingCone` | `Digit7` *(unchanged)* | toggle | `FIELD_FLAGS.enabled` |
| **8** | **SKIM COLLECTOR** | `toggleSkimCollector` | `Digit8` *(unchanged)* | toggle | ungated, **contextual** — only meaningful inside a planetary band |
| **9** | **CLOAK** | `cloak` | `Digit9` + `Backquote` | toggle, metered | `mod_cloak_mk1` / `mod_cloak_mk2` fitted **and** `massline2Flag('cloak')` |
| **0** | **BRAKE** | `brake` | `Digit0` *(unchanged)* | held | always — **not a power** |

**Never on the Rail, and why:**

| Verb | Home | Reason |
|---|---|---|
| `tether` (Space / F) | Massline lane (§6) | The signature mechanic is larger than a slot. Demoting it to a 46 px square is the single worst thing this document could do. |
| `bulletTime` (CapsLock) | ship instrument meter (§4) | A *held* modal state, not a press. A tile that means "hold me" teaches the wrong grammar. |
| `cruise` (V), `travelBurn` (H / NumLock) | drive band (§5) | Drive states, read against speed, not against ordnance. |
| `autoFire` (G) | reticle mode mark (§7) | An aiming mode. |
| `scanPulse` (C), `deployBeacon` (U), `siteBeam` (B), fleet orders (Z) | Quick Fan outer arc (§9) | Rare, contextual or fleet-directed. Occupying a permanent slot with a verb you press twice an hour is what makes an MMO bar feel like homework. |
| `brake` (0) | the brake cell | Kept on 0 per owner instruction; rendered as **not a power** so the rank cannot be miscounted. |

### 2.4 Collision resolutions — explicit

**`Digit0` — resolved: keep brake, render it as a different object.** The brake cell is
30 × 46 (28 at narrow), separated from slot 9 by a 16 px gap, and has **no housing, no icon frame,
no cooldown ring**. It draws three stacked descending bars that fill bottom-up while `inp.brake` is
true. It can never be swapped, claimed or locked. Reading the rank left to right you get nine
sockets and one wedge; the wedge is obviously not a socket.

**`Digit1` / `Digit2` / `Digit3` — resolved: they become flight verbs, and the Rail renders every
competing claim.** This is the substantive finding of this document:

Four in-flight prompt surfaces already claim digit keys on `document` in the **capture** phase and
call `stopPropagation()`. Document-capture runs before `input.js`'s window-bubble `keydown`
listener, so those prompts already win, today, silently:

| Surface | Claims | Evidence |
|---|---|---|
| `src/ui/contactHailPrompt.js` | `Digit1–3` / `Numpad1–3`, only while `active` | :100–108 |
| `src/ui/pirateParleyPrompt.js` | `Digit1–3` → comply / refuse / run | :15–17 |
| `src/ui/lawfulInspectionPrompt.js` | `Digit1` — comment states it *deliberately* owns the key "so a flight binding cannot fire through it" | :146, :229 |
| `src/ui/encounterChoicePrompt.js` | **`Digit1–Digit9`** — the whole rank | :212 |

The HUD cannot un-claim a key it does not own. It has exactly one honest option: **render the
claim.** Hence:

> **SLOT CLAIM.** A prompt that consumes digit keys emits `hud:slotClaim`
> `{ claimId, slots:[1..9], answers:[{slot, verb, glyphId}], expiresAt, mode }` on open and
> `hud:slotRelease { claimId }` on close. While claimed, the Rail's claimed tiles flip to the
> answers. When no claim is live, the digits are flight verbs.

Claim modes: `SINGLE` (lawful inspection, slot 1), `PARTIAL` (hail / parley, slots 1–N ≤ 3),
`FULL` (encounter choice, slots 1–9).

Claim rendering (tier 1):
- Housing geometry is unchanged — the rank does not move.
- Icon box is replaced by the answer glyph; the power icon is **removed**, not dimmed, so there is
  no ambiguity about what the key does.
- A 12 px SUBHEAD answer verb replaces the tile's empty label lane (`COMPLY` / `REFUSE` / `RUN`).
- A 2 px `--sf-goal` ribbon runs the full length of the claimed run, tying the claimed tiles into
  one object.
- Unclaimed tiles in the same rank go `--spent` (dashed border, icon at 60 % luminance) for the
  claim's duration, because they genuinely cannot fire.
- `ui_open` on claim, `ui_back` on release.

**Mis-press safety, stated as a number:** on claim, every claimed tile is hard-disabled for
**220 ms**. A digit pressed inside that window is swallowed, plays `ui_deny`, and submits nothing.
A player mid-input on "1 = throw charge" cannot accidentally answer a hail with their trigger
finger. A claim never outlives the prompt's own `expiresAt`; the Rail restores on the same frame
the claim releases.

**Save compatibility.** `settings.controls.bindings` is mirrored from defaults on first run and
persisted, so existing saves will not receive `Digit1/2/3/9`. Ruling: on load, **merge missing
default codes into a stored binding array when the player has not explicitly rebound that action**
(the array is byte-equal to a known previous default). If the player rebound it, leave it alone and
let the Rail render whatever `resolveActionCodes` returns — the tile keycap is derived, never
literal.

### 2.5 What information a tile shows

Every value below is read from published state. Nothing is invented, and no tile ever renders a
guess.

| Channel | Source | Rendered as |
|---|---|---|
| **Identity** | `POWER_DEFS[powerId].iconId` | 26 px single-channel icon mask, tinted by role colour |
| **Key** | `resolveActionLabel(state, action)` (`hud.js` :691) — **never a literal letter** | 12 px DATA keycap, bottom-right of the tile |
| **Grant state** | `resolveSlotRoster` (§2.9) | housing present / socket empty / dashed ghost |
| **Cooldown remaining** | slot 1 `e.data.combat` charge rack timer · slot 3 `e.data.cm.cooldownT` · slot 4 `state.player.massSeed.cooldownUntil` · slots 5/6 `state.fields.cooldowns[kind]` | SVG ring sweep **+** whole-second numeral **+** dashed border |
| **Live lifetime** | slot 4 `state.massSeed.expireAt` / `warnAt` · slots 5/6 `state.fields.active[].expireAt` | ring *drains* instead of filling; `--latch` state |
| **Engaged** | slot 6/7 `state.fields.active[].engaged` · slot 7 `state.fields.coneActive` · slot 9 `state.massline2.cloak.engaged` | housing gains a 2 px `--sf-you` inner edge |
| **Charge / ammo count** | slot 1 charges in `state.cargo` · slot 2 armed charges in world | 12 px DATA count, top-right |
| **Meter** | slot 9 cloak energy | 3 px bar across the tile's bottom edge |
| **Field budget** | `FIELD_MAX_ACTIVE = 6` vs `state.fields.snapshot.length` | when at cap, slots 5/6 go `--spent` with reason `FIELD CAP` |
| **Denial reason** | `state.fields.lastDenial` · `state.massSeed.lastDenial` · `massSeed:deployDenied` | 1.4 s inline flip of the tile's label lane to the reason word, in `--sf-foe` |
| **Context validity** | slot 8: player inside a planetary band (`state.planets` runtime record) | outside a band the tile is `--locked` with tier-2 reason `NO ATMOSPHERE` |
| **Wear** | per-power use count from the ship ledger | tier 3 only (§2.11) |

**Denial reasons are the whole reason the HUD exists for these powers.** The world can show a well
pulling; it cannot show *why* the deploy was refused. `fieldHud.js` already resolves those reason
strings correctly — that logic moves onto the tile and `fieldHud`'s floating pill is deleted (§14).

### 2.6 Actions available

| Input | Result |
|---|---|
| Press the digit (or the letter alias) | fire / toggle the power |
| Press while `--spent` | `ui_deny`, tile flashes its reason word for 700 ms, nothing fires |
| Press while `--locked` | `ui_deny`, tile shows the grant condition for 1.4 s |
| **`Alt` held** | Rail becomes pointer-interactive (§9.1) — click a tile to fire it |
| **`Alt` + hold a digit 350 ms** | **SWAP FAN** — a 3-item micro-fan of that band's alternates opens above the tile; release on one to swap it into the slot |
| Hover with `Alt` held | tier 2 `[data-why]` — name, one-line verb sentence, exact cost / cooldown / lifetime |
| Gamepad: hold **LB/L1** | Quick Fan opens with the Rail as its inner arc (§9) |

**The Rail is never empty of verbs.** Even hour 1, four tiles fire.

### 2.7 What is symbolic rather than numeric

| Read | Symbol | Why it reads without a legend |
|---|---|---|
| **Band identity** | three visually separated clusters | grouping *is* the taxonomy; you learn it once by pressing keys |
| **Granted vs not** | a **housing** (solid hairline frame + flat fill) vs an **open socket** (two hairline corner brackets, no fill, no background) | a socket obviously wants something in it; a disabled button obviously does not |
| **Next unlock** | one socket drawn with a **dashed** bracket pair and a `+` at 40 % | the only dashed thing on the Rail is the thing you can go and buy |
| **Cooldown** | ring **sweeping in** around the tile | filling = becoming available; matches every game the player has ever touched |
| **Active lifetime** | the same ring **draining out** | direction alone distinguishes "coming back" from "running out" — no colour needed |
| **Toggle engaged** | inner edge light + the icon's own fill inverting | a switch that is *on* looks lit from inside |
| **Deployable in flight** | the ring is *absent* and the icon carries a motion trail during the seed's travel phase | the power is in transit, not on cooldown |
| **Instantaneous vs deployed vs sustained** | band position | left = gone the moment you press it, middle = it stays out there, right = it stays on you |
| **Brake** | a wedge, not a square | shape carries "this is not one of the nine" |

Colour is spent, never worn: at rest the whole Rail is `--sf-calm` hairlines and `--sf-paper`
icons. `--sf-you` appears only on an engaged toggle and a ready-again flourish. `--sf-foe` appears
only on a denial word. `--sf-goal` appears only on a claim ribbon and the dashed next-unlock socket.
**That is at most three coloured elements on a rank of ten.**

### 2.8 Animation & interaction

Every animation names its §5 row and its §5 verb. Anything not in this table does not ship.

| Element | §5 motion row | Verb | Detail |
|---|---|---|---|
| Cooldown ring sweep | *gauge snap-back rate* (generalised: recharge rate) | **SPOOL** | bound to real remaining time; a 7 s well cooldown is a 7 s sweep, never a fixed animation |
| Lifetime ring drain | *ripple radius / reach* | **SPOOL** | drains against `expireAt`; enters `--warn` at the def's `warningS` (mass seed: 6 s) |
| Ready-again | *value arriving* | **SETTLE** | ring completes, housing overshoots 1.06× and returns over **90 ms**, `ui_confirm` |
| Fire / toggle | discrete state change | **LATCH** | tile seats 2 px downward with a hard stop, **90 ms** |
| Toggle engaged (7 / 9) | — | **LATCH** | inner edge light seats on; stays until toggled off |
| Grant (socket → housing) | *earned reveal*, §9.10 | **SETTLE** | brackets close into a frame over **160 ms**, icon fades up, `lock_acquired`. **Fires once, ever, per power.** |
| Swap fan open | *rail magnify* — the single atmospheric allowance | **SPOOL** | 3 items arc up over 140 ms |
| Claim flip | discrete | **LATCH** | 90 ms, `ui_open` |
| Denial | — | **LATCH** | label lane flips to the reason word, holds 1.4 s, flips back. **No shake, no colour-only cue.** |
| Overshoot amplitude on grant / ready | *inertia / massRatio* | — | amplitude scales with the hull's `massRatio`, exactly as the grammar requires. A Kestrel's tiles are twitchy; a hauler's tiles are heavy. **This is free physical literacy and it costs one multiplier.** |

**Nothing on the Rail exceeds 180 ms.** All JS-driven motion calls `prefersReducedMotion()` from
`src/ui/effects/effectRuntime.js` — the global blanket only neutralises CSS.

**What makes it a small game:** technique §9.9 **earned reveal** (an empty socket closing into a
housing is the single most legible expression of progression in the build), §9.3
**physics-consistent motion** (overshoot ∝ your hull), §9.4 **state-encoding animation** (ring
direction encodes *becoming ready* vs *running out* with no text), §9.5 **hover-reveals-cause**,
§9.10 **sound on every state change**.

### 2.9 Progressive disclosure

| Tier | Trigger | Content |
|---|---|---|
| **1** | always | icon · keycap · ring · count · engaged edge. **No power name on the tile face, ever.** That single rule is what stops the Rail becoming a field of tracked-out micro-labels. |
| **2** | `Alt`-hover or gamepad focus — no click | `[data-why]` card anchored above the tile, 168 px wide: SUBHEAD verb sentence (*"Pulls light bodies inward for 9 s"*), DATA line at half size (`R 190 · 9 s · CD 7 s`), and for a `--spent` or `--locked` tile the enumerated reason. **Enumerated phrases only** — an unknown reason renders nothing, per `causeLedger.js` house law. |
| **3** | `Alt`-click a tile's keycap → DRAWER slides up from the Rail | full record: every deploy this session, denial log, use count, the exact def numbers, the grant chain (module → tech → credits). Never opens a second modal; closes on `Alt` release or `Esc`. |

### 2.10 The resolver seam

All slot derivation lives in **one pure function** so it is testable and cannot scatter across the
render path:

```js
// src/ui/powerRail.js — pure, no DOM, no bus
export function resolveSlotRoster(state) → [{
  slot: 1..9,
  powerId: string|null,
  band: 'ordnance'|'fieldwork'|'rig',
  status: 'live' | 'spent' | 'latched' | 'travelling' | 'locked' | 'ghost' | 'claimed',
  reason: string|null,        // enumerated; null when status is 'live'
  ring:  { kind:'fill'|'drain'|'none', t:0..1 },
  count: number|null,
  meter: 0..1|null,
  keyLabel: string,           // via resolveActionLabel(state, action)
}]

export function resolveRailGeometry(width, height) → { tile, gap, bandGap, brakeW, x, y, w, h }
export function resolveTileFace(entry, claim) → { iconId, capText, labelText, tone }
```

Inputs it reads and nothing else: `state.player.fittedModules` (or the owned-ship fittings the
cloak system already reads), `state.researchedNodes`, `state.cargo`, `state.fields`,
`state.massSeed`, `state.player.massSeed`, `state.massline2`, the entity's `e.data.cm`, feature
flags via `fieldsFlag` / `massline2Flag`, and the active `hud:slotClaim`.

Power definitions live in a new pure data file **`src/data/powers.js`**:

```js
POWER_DEFS[powerId] = {
  id, band, slot, action,          // action = the input.js action id
  verb,                            // SUBHEAD sentence for tier 2 — enumerated, never generated
  iconId,                          // -> assets/ui/powers/<iconId>.png
  grant: { modules:[...], tech:[...], flag:'…', context:'…' },
  meter: 'cloakEnergy'|null,
  ringSource: 'cooldown'|'lifetime'|'none',
  alternates: [powerId, …],        // the band's swap roster
}
```

### 2.11 Hour-50 wear

A tile's housing accumulates a **wear etch** — a hairline notch on the housing's lower edge at
1/4, 1/2 and 3/4 of the way along, arriving at 50 / 250 / 1000 uses. Tier 3 shows the exact count.
This is the Rail's contribution to *"this is my fucking ship."* It is three hairlines; it costs
nothing; and after fifty hours the rank tells you what kind of pilot you are without a single word.

### 2.12 Reduced motion & forced colors

| Channel | Reduced motion | `forced-colors: active` |
|---|---|---|
| Cooldown ring | stepped at 4 Hz instead of tweened; the **numeral** carries the read | SVG `stroke` survives — keep the ring as an SVG arc, **never** a conic-gradient background |
| Lifetime drain | as above, plus the printed word `EXPIRES 4s` | as above |
| Ready flourish | omitted; the numeral disappearing is the event | border returns to solid |
| Grant reveal | brackets snap to frame, no overshoot; the `lock_acquired` cue still fires | solid `CanvasText` border |
| Engaged toggle | static inner edge, plus the printed word `ON` in the label lane | `outline: 2px solid Highlight` |
| Denial | word only, no flip | word only |
| Locked socket watermark | unchanged (static) | **watermark dropped**; socket renders as `1px dashed CanvasText` |
| Icon | unchanged | mask-tinted icons collapse to `CanvasText`; every icon must be legible as a pure silhouette |
| Claim ribbon | static | `Highlight` colour, plus the answer verb text which is already present |

A reduced-motion Rail is a *complete* Rail: every ring has a numeral, every toggle has a word,
every denial has a reason.

### 2.13 Naming & DOM contract

Approved §8 vocabulary only. **Never** `pulse` / `blink` / `flash` in a class name
(`sf-reduce-flash` blanket-kills them). **Never** `panel` / `card` on anything whose meaning lives
in a gradient or shadow.

```
.sf-rail                      the rank
  .sf-rail__band              ×3
    .sf-tile                  a slot
      .sf-tile--live --spent --latch --locked --spool --settle --claimed
      .sf-housing             granted frame (meaning is in border geometry, not shadow)
      .sf-tile__icon          mask-image, currentColor
      .sf-tile__ring          SVG arc
      .sf-tile__cap           12px DATA keycap
      .sf-tile__count         12px DATA
      .sf-tile__label         the label lane — empty at rest, holds reason/answer words
      .sf-tile__meter         3px bottom edge bar
  .sf-rail__brake             the wedge — no .sf-housing, no .sf-tile
  .sf-drawer.sf-drawer--fan   the Quick Fan (§9)
  .sf-drawer.sf-drawer--swap  the swap micro-fan
```

`.sf-rail` is `pointer-events: none`; only `.sf-tile` and `.sf-rail__brake` set `auto`, and only
while `Alt` is held. The Rail never sets `.ui-modal-open` — the `wingmanRadial.js` precedent.

### 2.14 Behaviour while Massline is latched

`HUD_FLIGHT_ATTENTION` §2.8 rules that bottom-centre is the line while latched. The Rail is the
frame-edge rank *below* that lane, and it does not compete for the same read — but it must recede:

- **Keycaps and label lanes are removed** (not dimmed) — this is the "no key chips while latched"
  ruling, satisfied by deletion.
- Housings drop their fill and keep the hairline frame.
- **Icons stay at full contrast at 22 px.** Do **not** lower opacity across the Rail: that fails
  `check:wcag-contrast` and it hides exactly the powers a latched player wants (a well or repulsor
  mid-swing is the whole VISION.md fantasy).
- Rings and counts persist.

### 2.15 Icon system, and the generation prompts

Icons ship as **single-channel silhouette masks**, applied with CSS `mask-image` and tinted at
runtime with `currentColor`. This is what makes `forced-colors` and the "colour is spent" rule
survivable, and it means one asset serves ready / spent / locked / claimed without a variant.

**Output contract**
- `assets/ui/powers/<iconId>.png` and `<iconId>@2x.png`
- **256 × 256**, RGBA, transparent background, content confined to a **208 × 208** safe box
- Pure white shape on full transparency — **no colour, no gradient, no background plate, no text,
  no border, no drop shadow, no bevel, no glow**
- Readable as a solid silhouette at **26 px**. If it stops reading at 26 px it is rejected.
- One clear closed silhouette; no more than three separated elements

**Shared style preamble — prepend verbatim to every prompt below**

> A single flat white icon on a fully transparent background, in the style of industrial machinery
> stencils painted on the hull of a working spacecraft. Bold, chunky, mechanically plausible forms
> with thick strokes and generous negative space, in the spirit of heavy-equipment warning
> placards and hazard stencils. Absolutely no colour, no gradients, no shading, no outlines around
> the shape, no background, no text, no letters, no numbers, no drop shadow, no glow, no bevel, no
> 3D perspective. Perfectly flat, front-on or plan view. The whole design must remain instantly
> readable when shrunk to 26 pixels. Content centred with generous margin. Vector-crisp edges.

**Per-power prompts** — each describes what the power *physically does*, because the icon's job is
to teach the mechanic, not to decorate the slot.

| iconId | Slot | Prompt (append to the preamble) |
|---|---|---|
| `pwr_charge` | 1 | *A thick disc-shaped demolition plate with two stubby mounting lugs, shown mid-throw with three short straight motion dashes trailing behind it on a shallow arc. The plate reads as heavy and hand-thrown, like a limpet mine.* |
| `pwr_detonate` | 2 | *A stylised detonator: a squat rectangular block with a single large plunger pressed down into it, and four short straight blast rays radiating outward from the block's corners. Emphasis on the pressed plunger.* |
| `pwr_countermeasure` | 3 | *A launcher pod fanning out a spray of small angular chaff flakes in a wide cone, the flakes scattering outward and tumbling. The pod is a blunt cylinder at the base; the cone of debris occupies two-thirds of the frame.* |
| `pwr_massseed` | 4 | *A heavy octagonal anchor puck with four short clamp legs gripping outward, and a single bold ring locked around it indicating a fixed frame. The puck should look bolted to nothing — anchored in empty space.* |
| `pwr_well` | 5 | *A funnel of concentric rings drawing inward toward a small dense point at the centre, with three small angular bodies caught on the rings and being pulled in, arrowheads pointing inward. Reads unmistakably as suction.* |
| `pwr_repulsor` | 6 | *A dense core with three heavy chevrons blasting outward from it in a radial burst, and two small angular bodies being shoved off the outer edge, arrowheads pointing outward. The mirror of the well: everything points away.* |
| `pwr_cone` | 7 | *A blunt-nosed plough wedge seen from above, projecting a wide triangular sweep of force ahead of it, with two small rocks being pushed aside to the left and right of the wedge's leading edges. Reads as a snowplough.* |
| `pwr_skim` | 8 | *A scoop intake shaped like a flattened funnel skimming through three long horizontal streamline bands, with the bands bending into the scoop's mouth. Reads as sweeping material out of a moving layer.* |
| `pwr_cloak` | 9 | *A simple hard-edged ship silhouette in plan view, its rear half dissolving into four vertical broken bands as if partially erased, with one closed ring around the intact front half. Reads as vanishing, not as an eye.* |
| `pwr_scan` | fan | *A squat emitter dish firing three nested expanding arcs outward in one direction, the arcs increasing in width. Reads as one outgoing ping, not a radar sweep.* |
| `pwr_beacon` | fan | *A stubby weighted marker post with a broad base and a flared top, emitting two short arcs from its tip. Reads as something dropped and left behind.* |
| `pwr_sitebeam` | fan | *A narrow beam projecting downward from a small emitter head into a flat bracketed target rectangle, with two short registration ticks either side of the bracket.* |
| `pwr_fleet` | fan | *Three identical blunt chevrons in a wedge formation, the leading chevron slightly larger, with a short command bracket enclosing the two trailing ones.* |

**Fallback while art is missing — the Rail ships without waiting for a single image.** Every power
has an authored inline-SVG glyph built from primitives, and the tile uses it whenever the PNG mask
fails to load. These are specified, not improvised:

| Power | Fallback glyph |
|---|---|
| 1 CHARGE | filled circle + 3 trailing dashes |
| 2 DETONATE | filled square + 4 corner rays |
| 3 COUNTERMEASURE | 5 small squares in a 60° fan |
| 4 MASS SEED | octagon + concentric ring |
| 5 WELL | 3 concentric arcs + centre dot, arrowheads inward |
| 6 REPULSOR | centre dot + 3 chevrons, arrowheads outward |
| 7 CONE | 32°-half-angle wedge outline (matches `FIELD_DEFS.cone.halfAngleRad = 0.56`) |
| 8 SKIM | 3 horizontal bars bending into a funnel |
| 9 CLOAK | ship triangle with the rear 50 % as 4 broken bars |

The `FIELD_PALETTE` in `src/data/fields.js` already fixes each field's world-space colour identity
(well = cool rim → hot sink, repulsor = hot core → cool rim, cone = utility teal). Tier-2 hover on
slots 5–7 tints its `[data-why]` edge with that same palette anchor, so the tile and the thing in
the world are visibly the same object. **Tier 1 stays monochrome** — the 80 % rule holds.

---

## 3. SURFACE B — The Ship Instrument (bottom-left)

Largely built (`.sf-bars`, `.sf-schematic`, ring + silhouette fill). What this document adds.

| | |
|---|---|
| **Concept** | your hull, told as one image: a ring that empties with shields and a silhouette that empties with hull. |
| **Archetype** | **a body you read.** |
| **Verb** | **INSPECT** — `Alt`-hover any tick for its cause. |
| **Shows** | `hull` / `shields` (ring dashoffset + silhouette fill height) · `energy`, `boost`, `heat`, `fuel` as 3 px ticks · per-weapon heat rows **only while hot** · **bullet-time meter** (`state.massline2.bulletTime.meter`) · **cloak detection radius** as a numeral when cloaked (`state.massline2.cloak.radius`) · hit-direction wedges · scar marks (hour 50) |
| **Actions** | `Alt`-hover a tick → tier 2 cause (*"heat 74 % — pulse laser sustained fire"*). `Alt`-click the silhouette → tier 3 damage log drawer. Ctrl-drag to reposition. |
| **Symbolic** | ring = shields, silhouette = hull, **one image, one size, centred**. No `SHIP CONDITION` title, no `NOMINAL`, no duplicate numerals unless actually low. Bullet-time is a **horizontal meter**, never a tile — its shape says *hold*, not *press*. |
| **Motion** | ring snap-back = `shieldRegenRate` (§5 row 4) · overshoot on arrival = `inertia` · hit flash is the existing `sf-schhit` **SETTLE** · bullet-time meter drains in sim seconds (`BT_DRAIN_PER_S = 0.55`), refills at `BT_RECHARGE_PER_S = 0.18`, and shows the `BT_MIN_ENGAGE = 0.15` floor as a hairline tick so the re-engage lockout is visible rather than mysterious |
| **Tiers** | 1: ring + silhouette. 2: hover a tick → cause. 3: damage log. |
| **Reduced / forced** | numerals appear permanently under reduced motion; ring is an SVG stroke; critical state carries the word `CRITICAL` not just red. |

**The bullet-time meter is the correct home for a held verb.** Placing it on the Rail would teach
that tiles can mean "hold", which would poison the other nine.

---

## 4. SURFACE C — The Drive Band (bottom-centre, above the Rail)

| | |
|---|---|
| **Concept** | how fast you are going and what the drive is doing about it. |
| **Archetype** | **a needle you watch.** |
| **Verb** | **COMMIT** — engage cruise or a travel burn and accept the consequences. |
| **Shows** | speed (**the one DISPLAY element, 28 px Saira 700, tabular**) · `inp.travelDrive.state` (`off`/`spooling`/`engaged`/`cooldown`) · `spoolT` against `TRAVEL_SPOOL_S = 1.6` · `cooldownT` against `TRAVEL_COOLDOWN_S = 3` · `breakReason` (`brake`/`pilot`/`cancelled`/`disrupted`) · cruise charge state · travel tape **only while spooling, burning, or about to overshoot** |
| **Actions** | `V` cruise · `H`/`NumLock` travel burn · `Alt`-hover the state word → tier 2 (*"burn broken — you braked"*) |
| **Symbolic** | the spool is a **horizontal bar filling left-to-right under the speed number** — it is a commitment window, and a bar that has to finish is the only honest shape for it. The break reason is a word, not a colour. |
| **Motion** | spool bar = **SPOOL**, bound to `spoolT` — never a fixed duration (§5 law) · engage = **LATCH** 90 ms · speed number **SETTLE**s, it does not snap (numbers count) |
| **Tiers** | 1: speed. 2: hover drive state → why it broke. 3: none — this surface has no history worth a drawer. |
| **Reduced / forced** | the state word (`SPOOLING 0.8s` / `BURNING` / `COOLDOWN 2s`) is always printed; the bar is decoration on top of it. |

---

## 5. SURFACE D — The Massline Lane (bottom-centre, latched only)

The signature mechanic. `HUD_FLIGHT_ATTENTION` §2.8 gives it bottom-centre while latched; this
document does not touch that ruling, it fills it in.

| | |
|---|---|
| **Concept** | the line as a physical object: how long, how loaded, and when to let go. |
| **Archetype** | **a rope you feel.** |
| **Verb** | **RELEASE** — the whole instrument exists to time one press. |
| **Shows** | line length (`.sf-ml-instrument__fill` / `mllen`) · tension from `masslineTetherStatus(tether)` against `TETHER_STATUS_LOADED_LOAD = 0.5` and `TETHER_STATUS_HIGH_LOAD = 0.88` · fitted head from `MASSLINE_HEAD_LABELS` (tractor / elastic whip / frame coupler / monofilament sweep / transverse snare / twin bridle) · payload mass and type · **release window** (`RELEASE` / `ALIGN` from `resolveReleaseCue`) · self-sling vs throw |
| **Actions** | `Space`/`F` cut · `W`/`S` reel · `A`/`D` orbit · `Shift` pump · RMB throw-arm when the payload is throwable (`isThrowArmPayload`) |
| **Symbolic** | **the lane is drawn as a rope, not a bar** — a single horizontal stroke whose *thickness* is load and whose *length* is line length. At high load it develops a visible strand separation. This is the one place in the build where a gauge should look like the thing it measures. The world-space release diamond (`masslineHud.js`) remains authoritative for *where*; the lane only says *when* and *how hard*. |
| **Motion** | load thickening = **SETTLE** · release window opening = **LATCH** with `lock_acquired` · strand separation at load > 0.88 is a *state encoding*, §5 row 3 (beam reversal analogue) — it is the fit telling you it is about to break |
| **Tiers** | 1: rope + release word. 2: `Alt`-hover → payload name, mass, head name, predicted exit speed. 3: `Alt`-click → the swing's impact log (§8), which is where the "holy shit" receipts accumulate. |
| **Reduced / forced** | thickness is supplemented by the printed load word (`SLACK` / `LOADED` / `CRITICAL`); the release window prints `RELEASE` regardless. `masslineHud.js` already carries a correct `forced-colors` block — extend it, do not replace it. |
| **Rail interaction** | see §2.14. |

**No key chips in this lane.** The existing `.sf-tether-controls` chip row is deleted; its content
is either obvious (reel = thrust) or belongs in Help.

---

## 6. SURFACE E — The Contact Dock (bottom-right)

| | |
|---|---|
| **Concept** | who is here, what they are doing, which one you have selected. |
| **Archetype** | **a room you scan.** |
| **Verb** | **PICK** — click a row or a radar mark to target. |
| **Shows** | radar · roster ordered `selected → threat → ally → wreck → ambient` (pinned by `check:ui-identity`) · `contactOverflowSummary` `+N` truthfully · target card **only while something is selected** with shield/armour/hull arcs · doctrine tells (≤ `TELL_POOL_SIZE = 3`) |
| **Actions** | click a row → target · `Tab` cycles · `Alt`-hover a row → tier 2 *why this contact matters* |
| **Symbolic** | threat is carried by **position in the list** first and colour second — the top of the roster is the thing about to hurt you. Wreck and ambient rows lose their identity glyph entirely rather than gaining a grey one. |
| **Motion** | roster expand/collapse = **LATCH** · lock acquisition = **LATCH** + `lock_acquired` · roster refresh throttled by `createContactRosterClock` (5 Hz) |
| **Tiers** | 1: roster + target card. 2: hover → faction, doctrine, standing. 3: `Alt`-click → dossier drawer. |
| **Reduced / forced** | ordering and glyph shape carry everything; no state is colour-only. |

### 6.1 Swarm readability — the law

VISION.md wants twenty light enemies being knocked around. The HUD stays readable by **capping and
coalescing**, never by hiding.

```js
SWARM_DENSITY_THRESHOLD = 8   // hostile contacts within radar range
```

| Cap | Value | Enforced where |
|---|---|---|
| Doctrine tells on screen | 3 | `TELL_POOL_SIZE`, exists |
| Receipts in the lane | 2 | §8 |
| Impact stamps concurrent | 4 | §8 pool |
| Lock diamonds | 1 | exists |
| Roster rows | `contactDisplayLimit(w,h)` + a truthful `+N` | exists |
| Per-enemy health bars | **0, forever** | non-goal, restated |

**At or above `SWARM_DENSITY_THRESHOLD`:**

1. The roster collapses to `N HOSTILE · M` and stops per-row updates.
2. The Rail drops cooldown **numerals** (keeps rings) — one less thing counting during a brawl.
3. The receipt lane holds a **single** coalesced line.
4. **`--sf-foe` is spent only on the selected target and on incoming-fire wedges.** The rest of the
   swarm draws in `--sf-calm` outline. Twenty red marks is twenty things with equal priority, which
   is no priority at all.
5. Nothing else changes. The Rail does not shrink, the ship instrument does not hide. Density
   discipline is about *colour and text*, not about deleting instruments when the game gets good.

---

## 7. SURFACE F — Destination & reticle

| | |
|---|---|
| **Concept** | one line that says where you are going, and one mark that says where you are shooting. |
| **Archetype** | **a heading you hold.** |
| **Verb** | **RE-AIM** — click the line to re-plot; press `G` to change how the gun thinks. |
| **Shows** | **one** destination line carrying name + distance + ETA (`objectiveTravelReadout`), replacing the mission tracker / nav readout / objective-list trio · the world diamond via `resolveObjectiveEdgePlacement` · the prograde tick · lead pip · `autoFire` mode as a **change in the reticle's own shape** (open cross → bracketed cross), never a text chip |
| **Actions** | click the line → open the chart at that waypoint · `G` toggles auto-target · `Alt`-hover → tier 2 route reason |
| **Symbolic** | the diamond does **not** also wear a caption plate while the corner line is visible (existing ruling). Auto-fire changes the reticle's silhouette because the reticle is the thing the mode affects. |
| **Motion** | edge-clamp slide = continuous, not animated · arrival = **SETTLE** |
| **Tiers** | 1: the line. 2: hover → why this destination. 3: chart. |
| **Reduced / forced** | the line is text and survives natively; the diamond is an outline shape. |

---

## 8. SURFACE G — The Receipt Lane and Impact Feedback

> *"Holy shit, I did that"* — and it must fire for impacts the player **delivers**, not receives.

### 8.1 Concept

| | |
|---|---|
| **Concept** | a two-line reserved lane of thin type that says what you just caused, plus a world-space stamp at the place you caused it. |
| **Archetype** | **a ledger you glance at.** |
| **Verb** | **HOLD** — `Alt`-hover a receipt to stop it expiring and expand it. |

### 8.2 The three channels

**Channel 1 — the impact stamp (primary, non-textual, world-anchored).**
At the contact point: one hard ring expanding once, radius ∝ `log(momentum)`, plus a radial shard
burst whose **count encodes the rating** — `glance` 3, `solid` 6, `crushing` 10. Duration 400 ms,
pool of 4. Reduced motion: the ring is drawn at final radius and held 400 ms, no expansion.

**Channel 2 — the delivery wedge (frame edge, mirrors an existing mechanism).**
The HUD already draws hit-direction wedges in `--sf-foe` for damage *received*. A delivered impact
draws the identical wedge on the bearing of the victim in **`--sf-you`**, opacity ∝ `severity`,
110 ms. Same shape, opposite colour, opposite meaning. **This is the "I did that" channel** and it
costs one reuse.

**Channel 3 — the receipt line (thin type, reserved lane).**
`VERB` in SUBHEAD 15 px + the number in DATA 13 px — the verb outranks the number (§3 law).

### 8.3 Provenance — what counts as "delivered"

| Event | Filter | Fields |
|---|---|---|
| `tether:whipImpact` | always — the observer only tracks the player's own tether | `rating`, `severity`, `momentum`, `mass`, `relSpeed`, `slung` |
| `massline:sweepImpact` | always | `rating`, `severity`, `momentum`, `transverseSpeed`, `headId` |
| `combat:collisionConsequence` | **only when `receipt.provenance.actorId === state.playerId`** | `exchangedMomentum`, `deltaV`, `control`, `staggerTicks`, `surface`, `debrisCount` |
| `combat:collisionDebris` | same provenance filter | `count`, `surface`, `pos` |

**Optional second phase — field attribution.** When a `combat:collisionConsequence` occurs inside a
player field (centre within `radius` of `receipt.pos`, read from `state.fields.active`), the receipt
may carry the verb `FIELDED`. This is a *presentation-derived* attribution and must never be
written into the combat trace or the cause ledger as a causal claim. Ship the four rows above
first; this row is not a blocker.

### 8.4 The verb bank (enumerated — never invented)

`GLANCED` · `SLAMMED` · `CRUSHED` (from `rating`) · `CUT` (sweep) · `RAMMED`
(collision, `surface` is your hull) · `TUMBLED` (`control === 'tumble'`) · `STAGGERED`
(`control === 'stagger'`) · `CHAINED` (a second victim within 1.2 s of the first) · `SHATTERED`
(`debrisCount > 0`) · `FIELDED` (optional, §8.3).

An event that does not map to one of these renders **nothing**. House law from `causeLedger.js`.

### 8.5 Coalescing (this is the swarm answer)

- Window **1.2 s**, key = verb tier.
- N impacts in a window collapse to one line: `CRUSHED ×4` with the **highest** rating's verb and
  the **summed** momentum.
- **Max two lines in the lane, ever.** A third arriving evicts the oldest.
- Lines live 2.6 s; `Alt`-hover freezes the timer.

Without this rule twenty light enemies produce twenty receipts and the lane becomes the thing
`HUD_FLIGHT_ATTENTION` was written to delete.

### 8.6 Hard constraints

- **Never assertive.** `masslineImpacts.js` sets `playerRelevance: 0.88` with an explicit code
  comment stating 0.9 crosses the assertive-caption bar and would turn a reward into a screen-reader
  interrupt that pre-empts real warnings. Delivered-impact receipts route to the **polite** live
  region only.
- **Not a toast.** They live in the HUD z-layer inside the reserved lane, never at z-index 1000,
  never with a card, stripe, or drop shadow.
- **Never enter** the ship, radar, objective or Rail rectangles — `resolveObjectiveHudLayout` is the
  collision kernel and the receipt lane is one of its clients.
- The HUD owns **no audio** for impacts. `presentationAdapters` already routes those cues; adding a
  second voice here would break `check:one-voice`.

### 8.7 Schema completion

| | |
|---|---|
| **Actions** | `Alt`-hover holds + expands a line to two lines (adds victim name and momentum breakdown). `Alt`-click opens the tier-3 impact log drawer. |
| **Symbolic** | shard **count** encodes rating; wedge **colour** encodes direction of authorship (you vs them); ring **radius** encodes momentum. No number is required to feel the hit. |
| **Motion** | stamp = **SETTLE** (400 ms, one overshoot-free expansion) · wedge = **LATCH** (110 ms) · receipt line arrives with a 90 ms **LATCH**, no slide |
| **Tiers** | 1: verb + number. 2: hover → victim, mass, speed. 3: the log. |
| **Reduced / forced** | stamp static, wedge static at 60 % of peak opacity for 110 ms, receipts unchanged (they are text). Under `forced-colors` the wedge becomes a `Highlight` outline arc — it must not be the only channel, which is why the receipt line always fires too. |

---

## 9. SURFACE H — The Quick Fan (`Alt`-held, non-pausing)

### 9.1 `Alt` is the flight layer's one modifier

> **While `Alt` is held, the HUD becomes interactive and the pointer stops being a weapon.**

This is one rule that gives **every** flight surface an action without stealing the aim, and it
needs no `input.js` change. `input.js` already drops mouse-button state when the event target is not
the canvas (`if (this._canvas && e.target !== this._canvas) { this._m0 = false; … }`), so the moment
HUD surfaces take `pointer-events: auto`, clicks stop reaching the guns. Verified.

All four digit prompts already ignore keys with `altKey` set, so `Alt` cannot collide with them.
Electron already calls `win.removeMenu()` (`electron/main.cjs` :374), so `Alt` does not raise a menu
bar. Ctrl remains the layout-drag and nearest-tether modifier; they do not overlap.

`Alt` never sets `.ui-modal-open` and never pauses. The sim keeps running, the ship keeps flying,
enemies keep shooting. `wingmanRadial.js` is the proof this works.

### 9.2 The Fan

| | |
|---|---|
| **Concept** | the Rail's second face: the same nine slots as a fan, plus an outer arc of the contextual verbs that have no permanent slot. |
| **Archetype** | **a hand of cards you sweep.** |
| **Verb** | **SWEEP** — push the pointer or right stick toward a wedge; release `Alt` to commit. |
| **Why it is the same object** | §2.1 of the grammar: one vocabulary, learned once. The Fan is not an overflow menu — it is the pointer-and-gamepad *face* of the Rail. That single decision also supplies the Rail's entire gamepad story. |

**Geometry.** A 180° half-fan opening **upward out of the Rail's centre**, hub at the Rail's midpoint.

- **Inner arc, radius 96 px** — the nine slots, in Rail order, left to right along the arc. Identical
  icons, identical states, identical `--live/--spent/--locked`.
- **Outer arc, radius 132 px** — contextual verbs, grouped: **SENSE** (`scanPulse` C) · **MARK**
  (`deployBeacon` U) · **WORK** (`siteBeam` B, only when `selectedWorldSiteTarget(state)` is
  non-null) · **FLEET** (attack / screen / regroup / hold — only when `state.automation.fleet` is
  non-empty).
- Outer radius 132 puts the Fan's top edge at **y 712** at 1440×900 — **below the Clear Field's
  y 612 boundary.** The Fan physically cannot cover the fight.

**Actions.** Pointer hover + click a wedge · number keys still fire their slot while the Fan is open
(the Fan is a *view*, not a mode) · `Alt` + hold a digit 350 ms → **swap fan** for that band ·
release `Alt` → close · `Esc` → close.

**Swap is only available inside the Fan.** A bare hold-to-swap on the Rail would mean a player who
holds `5` a beat too long mid-fight gets a configuration menu instead of a well. Gating swap behind
`Alt` makes the gesture unambiguous and impossible to trigger by accident.

**Gamepad.** Hold **LB / L1** opens the Fan; right stick selects by angle; **A / cross** activates;
`spatialFocusTarget` in `src/ui/input.js` handles DOM focus with no registration. This requires one
new polled action (`powerFan`) in `src/systems/gamepad.js` — **the only input-layer addition in this
document beyond merging default binding arrays.**

**Symbolic.** Angular position mirrors linear Rail position, so the same power lives at the same
*relative* place in both faces. Inner ring = permanent capability, outer ring = situational. No
unicode glyphs: `wingmanRadial.js`'s current `⌖ ⛊ ↟ ✦` are emoji-as-icons and are banned by §9;
the Fan takes the authored icon set (§2.15) including `pwr_fleet`.

**Motion.** Wedges arc out over **140 ms** staggered 12 ms apart — this is the §5 *rail magnify*
row, the grammar's single atmospheric allowance, and it is the only stagger permitted on the flight
layer. Selection = **LATCH** 90 ms. `ui_open` / `ui_tick` / `ui_confirm` / `ui_back`.

**Tiers.** 1: icons + state. 2: hover a wedge → the same `[data-why]` card the Rail uses. 3: none —
the Fan is transient by design and a drawer inside a transient is a second modal.

**Reduced motion / forced colors.** Wedges appear with no arc and no stagger. Under `forced-colors`
each wedge is a `1px solid CanvasText` rectangle with the icon as `CanvasText` and the selected
wedge as `Highlight`; the fan geometry survives because it is layout, not decoration.

**`src/ui/wingmanRadial.js` is superseded.** Its four orders become the Fan's FLEET group; `Z`
remains bound and opens the Fan pre-focused on that group. One surface replaces two.

---

## 10. The progression artifact — the same frame at hour 1, hour 10, hour 50

This is the direct answer to *"I can't look at the HUD and see the big game that it will become."*
**The Rail shows nine sockets from the first minute.** Locked sockets are not disabled buttons —
they are open bracket pairs with the band's watermark. The empty rank *is* the promise, and every
socket that closes into a housing is a moment.

The hour-1 column below is derived from verified code, not assumed:
`newGameDefaults.NEW_GAME.fittedModules` is `[wpn_pulse_laser_s, mod_mining_laser_s,
mod_engine_ion_m, mod_shield_booster_s]`, 5 000 cr, `researchedNodes: []`, `cargo: []`;
`FIELD_FLAGS.enabled = IS_BROWSER` (fields are **live from minute one**); `MASS_SEED_DEF` has no
module or tech gate; `PRODUCTION_FEATURES.massline2.cloak` and `.bulletTime` are `true` but cloak
additionally requires a fitted cloak module, which the starting fit does not have.

### Hour 1 — *"there are five things here I do not understand yet, and four holes"*

| Region | State |
|---|---|
| **Rail — ORDNANCE (1·2·3)** | **three open sockets.** No charge rack, no chaff dispenser. Slot 1 is the **ghost**: dashed brackets + `+`, tier 2 reads `IMPULSE CHARGE RACK · 18,000 cr`. |
| **Rail — FIELDWORK (4·5·6)** | **all three granted and live from the first minute.** Mass seed (8 s cooldown, 30 s anchor), Well (R 190, 9 s, cd 7), Repulsor (R 170, 7 s, cd 8). **These are the powers VISION.md celebrates and the HUD is currently silent about. On day one they now have faces.** |
| **Rail — RIG (7·8·9)** | 7 Clearing Cone **live** (toggle, no cooldown). 8 Skim Collector **granted but `--locked`** with reason `NO ATMOSPHERE` until the player reaches a planetary band. 9 **open socket** — needs a cloak module. |
| **Brake cell** | present |
| **Field budget read** | `1/6` fields deployed appears the first time the player deploys anything |
| **Ship instrument** | ring + silhouette + energy/boost/heat/fuel ticks + **bullet-time meter** (ungated) |
| **Drive band** | speed (28 px) + brake; travel-burn spool bar appears the first time `H` is pressed |
| **Massline lane** | appears on first latch: rope + length + load. **No head chip** — no head module fitted, so the base rope is all there is to say. |
| **Contact dock** | radar + roster, collapsed to a count at rest |
| **Quick Fan** | inner arc = 4 live + 5 unavailable; outer arc = **SENSE** and **MARK** only. No WORK (no site selected), no FLEET (no wingmen). |
| **Receipt lane** | fires the first time the player rams something or whips a rock into a pirate |
| **Rail ink** | 4 housings, 4 open sockets, 1 dashed ghost, 1 wedge |

### Hour 10 — *"the rank is full and I know what every icon means"*

| Region | State |
|---|---|
| **Rail — ORDNANCE** | **1** IMPULSE CHARGE (rack fitted, count `6` from cargo). **2** DETONATE — `--locked` until a charge is armed in the world, then it lights *by itself*, which is the clearest possible teaching of the pair. **3** COUNTERMEASURE (`mod_chaff_dispenser_m`), cooldown ring live. |
| **Rail — FIELDWORK** | unchanged in membership; the progression here is **not unlocks** but **budget and skill** — `FIELD_MAX_ACTIVE = 6` now actually binds, slots 5/6 go `--spent` with reason `FIELD CAP` when the player stacks, and the cap counter `5/6` becomes a thing the player plays against. |
| **Rail — RIG** | **7** Cone. **8** Skim Collector now genuinely live (the player has reached The Anvil). **9** CLOAK (`mod_cloak_mk1`) with its energy meter along the tile's bottom edge and the detection-radius numeral on the ship instrument while engaged. **All nine housings are closed.** |
| **Alternates exist** | the moment a 10th eligible power exists, every band's alternate roster becomes non-empty and the tiles gain a 3 px corner tick meaning *"this slot has alternates"*. `Alt`+hold swaps. |
| **Massline lane** | a **head chip** appears — `TRACTOR` / `ELASTIC WHIP` / `FRAME COUPLER` from `MASSLINE_HEAD_LABELS` — and the lane gains the throw-solution read (`ALIGN` → `RELEASE`) because `massline2Flag('throw')` payloads are now common |
| **Contact dock** | roster expanded, doctrine tells firing, target card carries shield/armour/hull arcs |
| **Quick Fan** | outer arc gains **WORK** (a claimed site) and **FLEET** (wingmen deployed) |
| **Receipt lane** | routinely two lines: `CRUSHED ×3` and `SHATTERED` |
| **Rail ink** | 9 housings, 0 sockets, 1 wedge, 3 alternate ticks |

### Hour 50 — *"this rank is a record of who I am"*

| Region | State |
|---|---|
| **Rail** | still exactly nine tiles and one wedge. **The Rail never grows a second row** — depth arrives as *alternates*, not as area. Every band has 2–4 alternates; the corner ticks are on every tile; the player has a personal loadout they swap between sectors. |
| **Wear** | housings carry 1–3 wear notches. The FIELDWORK band is scarred and the ORDNANCE band is clean, or the reverse, and that *is* the player's playstyle rendered without a single word. |
| **Denials are rare** | the player has learned the cooldowns; the label lanes are silent almost all the time, which is the point — silence means healthy |
| **Ship instrument** | the silhouette carries persistent **scars** at the hull locations that have taken the most damage across the save |
| **Massline lane** | named head (`MONOFILAMENT SWEEP`, `TRANSVERSE SNARE`, `TWIN BRIDLE`) + `mod_massline_spool_l`; twin bridle draws **two** ropes in the lane, which is the only time the lane's geometry changes, and it is earned |
| **Drive band** | travel burn is routine; the spool bar is muscle memory |
| **Contact dock** | roster rows carry faction and standing glyphs; the player reads the room before the room reads them |
| **Quick Fan** | four outer groups populated; the Fan is how the player configures between fights |
| **Rail ink** | identical geometry to hour 1. **Same 516 × 46 rectangle. Every socket filled, every tile worn.** |

> **The artifact in one sentence:** the frame does not change shape between hour 1 and hour 50 —
> the same nine holes are visible from the first minute, and the whole game is watching them fill.

---

## 11. Motion table — every animation on the flight layer, mapped to grammar §5

| Animation | §5 row it encodes | Verb | ms | Static form under reduced motion |
|---|---|---|---|---|
| Tile press | discrete state change | LATCH | 90 | none needed — the state changes |
| Tile ready-again | value arriving | SETTLE | 90 | numeral disappears |
| Tile grant reveal | earned reveal (§9.9) | SETTLE | 160 | brackets snap; cue still fires |
| Tile overshoot amplitude | `inertia` / `massRatio` | — | — | printed hull verb on the ship instrument |
| Cooldown ring | recharge rate | SPOOL | = real remaining | whole-second numeral |
| Lifetime ring | `magnetRange`-class reach/decay | SPOOL | = real remaining | `EXPIRES 4s` |
| Fan wedges out | rail magnify (atmospheric allowance) | SPOOL | 140 + 12 stagger | appear in place |
| Swap fan | rail magnify | SPOOL | 140 | appear in place |
| Claim flip | discrete | LATCH | 90 | instant |
| Shield ring snap-back | `shieldRegenRate` | SETTLE | = real | numeral |
| Massline load thickening | `capRegen − continuousDrain` analogue | SETTLE | = real | `SLACK`/`LOADED`/`CRITICAL` |
| Massline strand separation | fit is unsustainable | — | — | `CRITICAL` |
| Travel spool bar | commitment window | SPOOL | = `spoolT` | `SPOOLING 0.8s` |
| Speed number | value arriving | SETTLE | ≤ 180 | counts, never snaps — unchanged |
| Impact stamp | delivered momentum | SETTLE | 400 | static ring |
| Delivery wedge | authorship direction | LATCH | 110 | static at 60 % peak |
| Receipt arrival | discrete | LATCH | 90 | instant |
| Roster expand | focus | LATCH | 90 | instant |

Nothing on this layer exceeds **180 ms** except the impact stamp (400 ms), which is a world-space
event mark rather than an interface transition and is explicitly exempted here.

---

## 12. Accessibility matrix

| Requirement | How this layer satisfies it |
|---|---|
| 12 px floor | every numeral and label on the Rail, lane, drive band and receipts is ≥ 12 px. At narrow widths **content is dropped, never shrunk.** |
| One DISPLAY element | speed, raised to 28 px |
| Never colour alone | every state carries shape (housing/socket/dashed/wedge), position (band, roster order) or a word (reason, `ON`, rating verb) |
| `forced-colors` | rings are SVG strokes; icons are masks that collapse to `CanvasText`; watermarks drop; no meaning lives in a gradient, shadow or filter |
| Reduced motion | every ring has a numeral, every toggle has a word, every denial has a reason. A reduced-motion flight layer is complete, not blank. |
| JS motion | all of it calls `prefersReducedMotion()` from `effectRuntime.js` |
| Live regions | delivered impacts and receipts → **polite** only. Danger → the existing one-voice assertive floor. Never both. |
| Class naming | no `pulse`/`blink`/`flash` anywhere; no `panel`/`card`/`menu`/`modal` on meaning-carrying elements |
| Keyboard | the entire Rail is keyboard-native by construction — it *is* the keyboard |
| Gamepad | the Fan, via `spatialFocusTarget`; every Rail power reachable without touching a key |
| Screen reader | each tile is a `role="button"` with `aria-label` = `"<verb sentence>, <key>, <state>"`, and `aria-disabled` for `--spent`/`--locked`. The Rail is a `role="toolbar"` with `aria-label="Powers"`. |

---

## 13. Implementation seams

**New files (3):**

| File | Contents |
|---|---|
| `src/data/powers.js` | `POWER_DEFS` — pure data, no imports, per §2.10 |
| `src/ui/powerRail.js` | the Rail + Fan, in the DOM-guarded own-module style of `fieldHud.js` / `massSeedHud.js`; exports the pure resolvers `resolveSlotRoster`, `resolveRailGeometry`, `resolveTileFace` |
| `assets/ui/powers/*.png` | the icon masks (§2.15); the Rail ships and works without them |

**Reused, not rebuilt** (building a new one of these is a review failure per grammar §10):

| Need | Use |
|---|---|
| Live binding labels | `resolveActionLabel` / `resolveActionCodes` / `codeToBindingLabel` in `hud.js` :659–697 |
| Reserved-rectangle collision | `resolveObjectiveHudLayout` in `hud.js` :445 |
| Throttled HUD ticking | `createHudClock` / `consumeHudClock` in `hud.js` :904 — **8 Hz** for numerals, **20 Hz** for rings, event-driven for state changes. No new `rAF`. |
| Reduced-motion probe | `prefersReducedMotion` in `src/ui/effects/effectRuntime.js` :67 |
| Non-pausing overlay pattern | `wingmanRadial.js` — `pointer-events:none` container, `auto` only on wedges, never sets `.ui-modal-open` |
| Cause tooltips (tier 2) | the `causeLedger.js` pattern generalised to `[data-why]` |
| Gamepad DOM focus | `spatialFocusTarget` in `src/ui/input.js` |
| Reposition + persist | `createHudDragController` in `src/ui/hudLayout.js` |
| Massline world marks | `masslineHud.js` — complement, never duplicate |
| DOM vocabulary | `src/ui/uiPrimitives.js` + the primitive block at the end of `styles/ui.css` — **adopt it here**, it currently ships in zero live screens |

**Deleted by this document** (net surfaces: −2):

| Removed | Where its content goes |
|---|---|
| `fieldHud.js`'s floating `.sf-field-pill` | field state → tiles 5/6/7; denial reasons → tile label lanes; **Cinder Sluice hazard phase → the top-centre one-voice floor**, where danger lines already belong |
| `massSeedHud.js`'s `.sf-mseed-pill` | seed phase + cooldown → tile 4. **The world-space lock marker stays** — world marks are not chrome. |
| `.sf-tether-controls` key chips | Help / Settings |
| `wingmanRadial.js` | the Fan's FLEET group |
| `masslineHud.js`'s `.ml2-meters` pills | bullet-time meter → ship instrument; cloak meter → tile 9 |

**Input layer — the complete list of changes:**

1. Add `Digit1` to `chargeThrow`, `Digit2` to `chargeDetonate`, `Digit3` to `countermeasure`,
   `Digit9` to `cloak` — **appended** to the existing code arrays, letters retained.
2. Merge missing default codes into stored `settings.controls.bindings` arrays that the player has
   not explicitly rebound (§2.4).
3. Add a polled `powerFan` action to `src/systems/gamepad.js` (LB / L1).

Nothing else in `input.js` changes. `Digit4`–`Digit8` and `Digit0` are untouched.

**Bus contract (new events):** `hud:slotClaim`, `hud:slotRelease` (emitted by the four digit
prompts, consumed by the Rail). The Rail emits nothing that mutates sim state; it fires powers by
the same route the keyboard does.

---

## 14. Definition of done for the flight layer

Grammar §12, instantiated:

1. Silhouette test — three clusters of squares plus a detached wedge along the bottom edge. Nothing
   else in the build shares it. ✔ when a text-stripped capture is unmistakable.
2. Exactly one DISPLAY element (speed, 28 px). Nothing below 12 px anywhere on the layer.
3. The APRON contains ≥ 1 verb — it contains nine.
4. The STAGE responds to pointer, keyboard and gamepad — it is the flying game; the Fan supplies
   the gamepad path to every power.
5. Every animation maps to a row of §11.
6. Legible and complete under reduced motion **and** `forced-colors` — verified by capture, not by
   check.
7. Tier 2 `[data-why]` wired for every tile, every drive state, every roster row, every receipt.
8. **Looked at** in captured frames at 1440×900 and 1280×720, in all five HUD jobs: cruise, fight,
   latched, hurt, and **swarm (≥ 8 hostiles)**.

**Extra, specific to this layer — a green check is not proof (grammar §11):**

- Capture the Rail at hour-1 grant state, at full grant, and mid-claim. `check:ui-identity` cannot
  see whether a socket looks like a promise or like a broken button.
- Capture with `--sf-foe` swarm suppression active and count the red elements. There must be two:
  the selected target and the incoming-fire wedge.
- Verify a delivered impact fires channel 2 (the `--sf-you` wedge) — a receipt line alone means the
  provenance filter is passing damage *received*.
- Verify the 220 ms claim deadzone by pressing a digit on the same frame a hail opens.
- Sum the visible reserved rectangles in the loudest capture and confirm ≤ 15 % of frame.
