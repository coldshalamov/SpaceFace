# G16 one glass — recon draft: one popup host, one style

Queue row: `WRITE G16 one glass` (Lane 1). Spec: EC-G16 brief
(`git show origin/experience-commissions/EC-G16-one-glass:design/program/experience-commissions/commissions/shared/EC-G16-one-glass.md`),
plus PR #1024 which nobody on this machine can read (gh not authed — see Questions).
Direction doc the brief names: `design/frontend/ORRERY.md` ("ORRERY is the direction; this is the
machinery under it").

This draft covers **the Stage half of EC-G16** — the queue row's "one popup host, one style" maps
to brief §3 plus the frame rule from §2. The Kit Page (§1) already exists; the Inspector (§4) and
the screen-migration order (Order of work §4) are **separate packets** — do not fold them in.

## 1. What the player must see

Exact words from the spec — `commissions/shared/EC-G16-one-glass.md`, section "3. The Stage — one
door for everything that pops up":

> "The flight screen gets six named slots: **top-centre banner, top-right feed, centre dialog,
> bottom-centre prompt, left objective, right contact**. Station and menu screens get the dialog
> and toast slots.
>
> Everything that appears over the game goes through one call: *show this component in this slot*.
> One thing per slot at a time; the rest queue. Because the Stage hands out the frame, the popup
> cannot be borderless, cannot be off-style, and cannot sit on top of another one.
>
> Gameplay code stops creating page elements. Find every place outside `src/ui/` that builds its
> own (the 259-file list is the worklist), and route it through the Stage."

And the frame rule, same brief, section "2. Twelve components, and nothing else":

> "Each component owns its own frame, padding, type size and — the important part — **its own
> answer to 'what if the text is too long'**, declared once: wraps to N lines, or shortens with an
> ellipsis and shows the full text on hover/focus. Never 'whatever happens'."

Order-of-work line that picks this slice, same brief:

> "2. The Stage, and every in-flight popup moved onto it. This is what the player sees most."

No new visual design is allowed — the brief's Explicitly-reject list bans "a new visual style".

## 2. Code facts

### The six slots are ~70 % built — as four separate owners, not one host

| Stage slot (spec name) | Exists today as | Mount point | File:line |
|---|---|---|---|
| top-centre banner | `createAlerts` — persistent pills + the one-voice floor via `voiceArbiter.js` (`voice:say` channel `alert`, presented as top pill) | `#alerts` div in `index.html:1272` | `src/ui/alerts.js:1` |
| top-right feed | `createToasts` — receipt lane; `admitReceipt` caps at `RECEIPT_MAX = 2` (`hudAttention.js:14,58`); `#toast-live` polite region | `#toasts` div in `index.html:1267` | `src/ui/toasts.js:1` |
| centre dialog | `createScreenManager` — one-visible-screen switching + backdrop | `#screens` + `#modal-backdrop` in `index.html:1265-1266` | `src/ui/screenManager.js:44-45` |
| bottom-centre prompt | `createPromptDeck` — the ONE flight decision surface: ladder (`planLadder`, `FULL_SLOTS = 2`, z 20), Digit1-9 router, gamepad, lifecycle, live region | appends `root` + `live` directly to `#ui-root` | `src/ui/promptDeck.js:178-192` |
| left objective | mission tracker inside the HUD: `sf-objectives` wrap, `sf-objective-details`, `resolveObjectiveHudLayout` (`add('objective', leftContext, …)`) | inside `#hud` | `src/ui/hud.js:2148-2405`, `:6432` |
| right contact | **no canonical owner** — `contactHailPrompt` mounts its own panel on `#ui-root`; `commsRadial`/`nemesisComms` mount their own; the `#sf-comms` feed pins itself `left:20px; top:118px` via injected CSS | `#ui-root` (each module's own element) | `src/ui/contactHailPrompt.js:57-65`, `src/ui/comms.js:333,987-990` |

The z-order contract already exists (ARCHITECTURE §1.2, restated in `src/ui/AGENTS.md`): canvas z0
< vignette z5 < hud+receipts z10–11 < prompt-deck z20 < modal-backdrop z90 < screens z100 < alerts
z1100. `#ui-root` is `pointer-events:none`, children opt in (`index.html:1263`).

### What already routes through the deck (do NOT rebuild)

26 files reference `offerDecision`/`promptDeck`. The `*Prompt.js` adapters own **no DOM** — they
normalize bus events into `offerDecision` specs (AGENTS.md: "they own no DOM, no keys, no
placement"). Verified zero `createElement`/`innerHTML`: aftermathChoice, borrowedSun,
borrowedVoice, crew, customs, encounterChoice, ilexArk, impoundPay, lastShift, lawfulInspection,
longBerth, moralTrap, mothlight, palletJack, physicalJobs, pirateParley, redKite,
signalInvestigation, special500Confessional, special500Invoice, stuckTow, towlineTable,
warrantOffer, wreckChoice. `recoveryEncounterPrompt` is a hybrid (2 DOM sites + deck calls).

### The worklist: popups that still build their own frame, style, and mount point

Each of these injects its own `<style>` into `document.head` and appends its own absolutely-placed
element — exactly the "borderless/off-style/overlap" bug the brief describes:

| File | Mounts on | Own `<style>` | Notes |
|---|---|---|---|
| `src/ui/contactHailPrompt.js` | `#ui-root` (2 roots, :57-65) | yes (`STYLE_ID`, :324-420) | right-contact candidate |
| `src/ui/confirm.js` | `#sf-confirm-root` → `#ui-root` (:33-38); queries `#screens` (:73) | styles/ | the modal confirm |
| `src/ui/discoveryPlate.js` | `#hud` (:55-74) | styles/ | fed by `lineClassMoment.js` + discovery systems |
| `src/ui/hudAttention.js` | `#hud` (:378-390) | yes — inline `z-index:30`, `left:50%; top:18%` (:342-350) | tutorial flight card; sits **above** the deck's z20 |
| `src/ui/commandBar.js` | `#ui-root` (:330) | yes (:250-254) | gated by `COMMAND_BAR_IN_FLIGHT` in uiRoot:930 |
| `src/ui/comms.js` | `#sf-comms` → `#ui-root` (:333) | yes (:983, :1122) | also owns contactHail/commsRadial/endingEpilogue (:315-321) |
| `src/ui/commsRadial.js` | `#ui-root` (:365-453) | yes | radial fan — a mode, maybe not a slot |
| `src/ui/wingmanRadial.js` | `#ui-root` (:75-140) | yes | same radial question |
| `src/ui/nemesisComms.js` | mounted root (:40) | styles/ | comms panel |
| `src/ui/stuntCallout.js` | doc root (:439-448) | yes (:127-131) | owned by `hud.js` (:68) |
| `src/ui/sectorPostcard.js` | `#hud` (:313-358) | styles/ | sector-arrival card |
| `src/ui/dockDenyBanner.js` | `#hud` (:94-119) | styles/ | top banner → banner slot |
| `src/ui/marketNews.js` | `#news-ticker` inside hud comm tape (:774-817; host built `hud.js:2069-2071`) | styles/ | ticker, arguably the feed |
| `src/ui/globalFind.js` | `#screens` (:40) | kit `el()` | palette — dialog slot? |
| `src/ui/whyReveal.js` | `document.body` (:61-68) | styles/ | tooltip → Tooltip/feed |
| `src/ui/endingEpilogue.js` | `#ui-root` (:183) | yes (:117-179) | owned by `comms.js` |
| `src/ui/floatingText.js` | `#hud`/`#ui-root` layer (:157-174) | yes (:482-545) | **world-anchored** — probably not a popup; boundary call |
| `src/ui/damageIndicators.js` | own layer (:193-197) | yes (:108-156) | **world-anchored** — same boundary call |

Also `teachingOverlay.js`, `captions.js`, `adventureDecisions.js`, `logbookRecap.js`,
`starterAirCard.js`, `racingCoach.js`, `jumpNotice.js`, `worldNewsBeats.js`, `attentionGlass.js`,
`objectiveSector.js`/`objectiveRecall.js` — zero direct `createElement`/`innerHTML` (they use kit
`el()` or shared hosts); verify individually before assigning migration.

Counts for the packet's "why": **32 files** under `src/ui/` inject their own `<style>` element
(`grep -rln "createElement('style')" src/ui`); ~24 files **outside** `src/ui/` call
`document.createElement` — most are render/canvas textures, legit (canvas ≠ page element). The
real non-ui DOM creators to name in the Inspector packet: `src/systems/onboarding.js`,
`src/localization/domBridge.js`, `src/localization/fonts.js`, `src/save/saveSystem.js`,
`src/save/slotStill.js`, `src/systems/mobile/{instrument,view,wheel}.js`,
`src/systems/legacyTouch.js`, `src/features/cinderglassJob/integration.js`,
`src/features/salvageOutfits/integration.js`, `src/core/frameTruth.js`,
`src/testing/perf/spectorIntegration.js`, `src/render/{diagnostics,graphicsLab}.js`,
`src/render/spectrum/overlay.js`.

### One style — what exists to reuse

- `src/ui/kit/dom.js` — builders `el` (:5), `words` (:67), `rows` (:159), `table` (:180), `hero`
  (:215), `title` (:222), component-scoped roving focus + kit cues. **Names do not match the
  spec's twelve** (Panel·Card·Row·Stat·Button·Tabs·List·Dialog·Toast·Tooltip·Prompt·Meter);
  `styles/kit.css` (1168 lines, `k-*`, linked last in `index.html`) + `--dp-*` tokens
  (`src/ui/deckplate/tokens.js`, `src/ui/orrery/tokens.js` `injectOrrery`).
- `src/ui/kit/motion.js` — `settle`/`stamp`/`cut`, `reducedMotion`; used by promptDeck. Every
  settle 140 ms, honours `html.sf-reduce-motion`.
- `src/ui/kit/lab.js` renders `_kitlab.html`/`_uilab.html` (the Kit Page — exists, not the spec's
  worst-case-content version; that's a different packet).
- `styles/prompt-deck.css` (478 lines) — the glass frame the deck already hands out.

### The seam

`src/ui/uiRoot.js` constructs every host in one `init`: toasts `:712`, discoveryPlate `:717`,
alerts `:721`, screenManager `:743`, globalFind `:763`, whyReveal `:770`, nemesisComms `:831`,
promptDeck `:887`, wingmanRadial `:899`, commandBar `:930`. A `stage.js` created there and passed
into the popups (or owning the slot containers they mount into) is the single seam. Slot containers
go inside `#ui-root` in `index.html:1263-1279` beside `#alerts`/`#toasts`.

## 3. Files a builder may edit

`git diff --stat` for every path below is **empty** (whole tree clean at draft time, 2026-11-11).

Slice A (the host):
- `src/ui/stage.js` — NEW: slot registry, `show(slot, component)`/`clear(slot)`, one-visible +
  FIFO queue per slot, hands out the kit frame.
- `index.html` — slot containers inside `#ui-root` (foreign-dirty at the 04:40 checkpoint per
  HANDOFF §1, clean now — `git diff` first).
- `styles/stage.css` — NEW, or append to `styles/ui.css`.
- `src/ui/uiRoot.js` — create the Stage, pass it to the hosts above.
- `src/ui/promptDeck.js`, `src/ui/toasts.js`, `src/ui/alerts.js`, `src/ui/screenManager.js` —
  mount inside their slots instead of directly on `#ui-root`/`#hud`.
- `test/stage.test.mjs` — NEW.

Slice B (move the popups onto it): the worklist table in §2 — `contactHailPrompt.js`,
`confirm.js`, `discoveryPlate.js`, `hudAttention.js` (tutorial card), `commandBar.js`, `comms.js`,
`commsRadial.js`, `wingmanRadial.js`, `nemesisComms.js`, `stuntCallout.js`, `sectorPostcard.js`,
`dockDenyBanner.js`, `marketNews.js`, `globalFind.js`, `whyReveal.js`, `endingEpilogue.js`, plus
any styles files their injected styles retire into.

Do **not** hand a builder `src/ui/hud.js` wholesale (huge, contested — PARK-02-adjacent and the
objective tracker lives there); extract only the objective/tracker's mount if the left-objective
slot needs it.

## 4. Existing tests

`grep -rln` hits in `test/`:
- `test/prompt-deck.test.mjs` — deck ladder/digit routing (headless, imports pure helpers).
- `test/kit.test.mjs`, `test/kit-responsive-navigation.test.mjs` — kit builders.
- `test/discovery-plate.test.mjs`, `test/claim-site-discovery-plates.test.mjs`,
  `test/inst-18-discovery-reveal.test.mjs` — plate behaviour.
- `test/toast-action-button.test.mjs`, `test/toast-modal-focus-fast-follow.test.mjs` — receipt lane.
- `test/bm-ear-05-ordinary-alert-dismiss.test.mjs`, `test/first-hour-alert-dedupe.test.mjs` — alerts.
- `test/inst-04-prompt-deck-flight-cluster.test.mjs` — cluster placement.
- `test/line-class-moment.test.mjs` — the G19-01 plate-through-subscriber pattern to copy.

Focused test to write: `test/stage.test.mjs` — fake DOM; `show('dialog', A)` then
`show('dialog', B)` renders only A and queues B; `clear` promotes B; an unknown slot throws; a
component shown through the Stage carries the kit frame class; reduced-motion uses `cut`.

## 5. How to see it

`node scripts/ui-bench.mjs --list` (no game boot) gives the shot ids; the relevant ones:

- Popups: `popup-confirm`, `popup-confirm-danger`, `popup-find`, `popup-tooltip`, `popup-dossier`.
- Comms/contact: `comms-radial`, `wingman-radial`, `flight-contacts`.
- Flight chrome: `flight`, `orrery-flight`, `crucibleHud`, `mobile-flight`.
- Dialog hosts: any `station-*` tab shot, `pause`, `settings` (the centre dialog slot).
- Kit page: open `_kitlab.html` / `_uilab.html` directly.

`--walk` every control on touched shots; `--viewports=390x844,1366x768,1920x1080` matches the
spec's three sizes (phone / small laptop / desktop).

Gate-relevant checks: `check:ui-a11y`, `check:wcag-contrast`, `check:player-facing-labels`,
`check:ui-identity`, `check:ui:layout`, `node scripts/check-ui-screen-imports.mjs`,
`node scripts/check-type-floor.mjs`.

## 6. Split

The whole row is >15 files — propose two packets:

- **G16-01 "the Stage exists":** new `stage.js` + slots in `index.html` + `styles/stage.css` +
  uiRoot wiring + the four existing hosts (promptDeck, toasts, alerts, screenManager) mounting
  inside their named slots + `test/stage.test.mjs`. Player-visible: nothing can overlap the deck
  or the banner ever again; queued second dialogs instead of collisions. ~6 files.
- **G16-02 "every popup through one door":** migrate the §2 worklist (16 files) — each keeps its
  trigger and text, loses its own `<style>`, mount, and z-index; gains the kit frame + slot.
  Player-visible: the hail, the sector postcard, the dock-deny banner, the tutorial card all look
  like they came from the same game. Splittable further by "flight popups" vs "comms/contact".

Kit-component renaming to the spec's twelve names, the worst-case Kit Page, and the Inspector are
explicitly out of this row (different queue rows / not yet written).

## 7. Questions for the lead

Design gaps only:

1. **PR #1024** is named in the queue row but unreadable here (gh unauthenticated, no local ref).
   What does it contain — prior Stage work to preserve, or a ui-polish that conflicts?
2. The six slots leave **radials** (commsRadial, wingmanRadial — a held radial fan, not a timed
   card) and **world-anchored markers** (floatingText, damageIndicators) unassigned. Slot, separate
   surface, or out of scope? The spec doesn't say.
3. "Left objective" and "right contact" today live inside `#hud` / scattered on `#ui-root`. Does
   the Stage own those slots (HUD moves into the slot) or only the four transient ones?
4. Queue semantics per slot — strictly FIFO, or priority (danger beats info) like `alerts.js`'s
   `SEV_RANK` and the voice arbiter already do?
