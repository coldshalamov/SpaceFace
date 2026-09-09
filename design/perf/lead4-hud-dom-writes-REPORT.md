# Lead 4 — HUD DOM attribute writes (write-on-change)

**Branch:** `claude/perf00-20260727`  
**Date:** 2026-07-29  
**Symptom (MAKE_THE_GAME_FAST Lead 4):** 16542 `domAttributeMutations` across 1216 post-boot frames ≈ **13.6 attribute writes/frame** while displayed values change only a few times per second. PERF-C05 signature: DOM writes scale with **frame count**, not **state changes**.

## What counts (meter)

`src/ui/domInstrumentation.js` observes `document.documentElement` with:

```js
{ childList: true, attributes: true, characterData: true, subtree: true }
```

and keeps only records whose `target` is inside `#hud`. Attribute mutations include `style`, `class`, `aria-*`, `data-*`, SVG presentation attributes, `hidden`, `title`, etc.

**Hard rule honored:** meter untouched; producers fixed only.

## Frame path entry

`uiRoot.frame` → `hud.frame(dt)` when flight HUD visible; also `bandHud.update`, `toasts.tick`, `comms.tick`, `_syncFlightCursor`.

HUD `frame()` callees (cadence noted):

| Path | Cadence |
|---|---|
| schematic / bars / action slots / prograde tick | every frame |
| `updateDoctrineTells` | every frame |
| `updateTravelTape` | every frame |
| `updateCombatHud` | every frame |
| `updateTargetArcs` | every frame |
| `updateObjectiveArrow` | overlay (~30 Hz) or numeric (~10 Hz) |
| `targetPanel.update` | ~20 Hz |
| `floatingText.update` / `dmgInd.tick` | ~30 Hz when active |
| `radar.draw` | ~10 Hz |
| `updateOverview` | ≤5 Hz |
| `alerts.tick` / `hudMeta.tick` | overlay / event |
| `bandHud.update` / `syncFlightCursor` | every ui frame |

## Shared helpers (hud.js)

| Helper | Lines | Verdict | Action |
|---|---|---|---|
| `setText` | ~639 | innocent (textContent compare) | left-alone |
| `setScaleX` | ~640–646 | was guarded (`_sfScaleX`) | left-alone |
| `setStyle` | ~647–654 | **was guilty** (relied on `el.style[prop]` read; no durable JS cache) | **guarded** via `el._sfStyle` |
| `setCssVar` | new | — | **added** (JS cache + `setProperty`) |
| `setOpacity` | new | — | **added** |
| `setAttr` | new | — | **added** |
| `setDataEdge` | new | — | **added** (not `dataset` for cache) |
| `setTitle` | new | — | **added** |
| `setHidden` | new | — | **added** |
| `setHudScreenTransform` | ~690–703 | was guarded (`_sfHudTransform`) | left-alone |
| `setClass` | ~704–706 | innocent (`contains` before toggle) | left-alone |
| `setDisplay` | ~707–714 | was style-read guard | **guarded** via `_sfStyle.display` |
| `setSvgAttr` | ~3016 | was guarded (`__sfAttrCache`) | now delegates to `setAttr` |

---

## Writer inventory

Verdict key: **guilty** = ran on the frame path and wrote without a JS-side last-value compare; **innocent** = already write-on-change or not a per-frame attribute writer; **event** = not on the steady frame path.

### `src/ui/hud.js` — every-frame / cadence writers

| Site | What | Verdict | Action |
|---|---|---|---|
| schematic `--hull-pct` (`setCssVar`) | `style.setProperty` every frame | **guilty** | **guarded** |
| `schShield` strokeDashoffset | `setStyle` | was style-read | **guarded** (via setStyle cache) |
| energy/heat/boost/fuel `setScaleX` | transform | innocent | left-alone |
| boost/heat row `setStyle(display)` | display | style-read → | **guarded** |
| condition/action `setClass` many | class | innocent | left-alone |
| prograde `proTick` opacity | `style.opacity` every frame while fading | **guilty** | **guarded** (`setOpacity`) |
| prograde transform | `setHudScreenTransform` | innocent | left-alone |
| doctrine tell `dirEl` transform | `style.transform` every frame while active | **guilty** | **guarded** (`setStyle`) |
| doctrine tell `hidden` / `is-on` | hidden + class every frame | **guilty** / soft | **guarded** (`setHidden`/`setClass`) |
| travel tape `dataset.state` | data-state every frame when on | **guilty** | **guarded** (`setAttr`) |
| travel tape fill/cap/vmax/arc | setScaleX/setStyle | mostly innocent | setStyle now JS-cached |
| travel tape `aria-hidden` on brake | setAttribute (edge-gated by `_vtapeBrakeOn`) | innocent (edge) | still uses `setAttr` |
| combat lock ring active/locked | classList add/remove unguarded | soft (browser no-op) | **guarded** (`setClass`) |
| lockFill `stroke-dashoffset` | getAttribute compare | was DOM-read | **guarded** (`setAttr`) |
| weapon heat fills | setScaleX | innocent | left-alone |
| wpnHeatsWrap display | setStyle | → | **guarded** |
| lock diamond / lead pip visible + transform | class + setHudScreenTransform | soft/innocent | **guarded** class |
| target arcs display/visible/size/SVG attrs | mix | display unguarded branches | **guarded**; SVG via `setSvgAttr` |
| objective arrow `title` | title attr every overlay tick | **guilty** | **guarded** (`setTitle`) |
| objective arrow `aria-label` | setAttribute (text-gated) | innocent | now `setAttr` |
| objective arrow classList / compact | class | soft | **guarded** (`setClass`) |
| objective arrow `dataset.edge` | **data-edge every tick** | **guilty** | **guarded** (`setDataEdge`) |
| objective arrow `transform` | style every tick | **guilty** | **guarded** (`setStyle`) |
| objective arrow `--sf-arrow-angle` | setProperty every edge tick | **guilty** | **guarded** (`setCssVar`) |
| tether stat `style.display` @10 Hz | display | **guilty** | **guarded** |
| reticle bloom transform @10 Hz | setStyle | → | **guarded** |
| mission tracker mt-urgent class @10 Hz | classList | soft | **guarded** |
| overview strip display / row fields @≤5 Hz | display + fields | display unguarded; fields already keyed | **display guarded**; fields left-alone |
| overview IFF `--iff-color` | setProperty behind color cache | innocent | left-alone |
| targetPanel hide when route owns attention | display | style-read | **guarded** (`setDisplay`) |
| root `setVisible` | display | unguarded | **guarded** |
| rebuildWeaponHeatBars display | display on rebuild | event | now `setStyle` |
| cargo panel / death / caption / chips / schematic hit | various | **event** | left-alone (not frame churn) |
| init-only className/setAttribute/role | construct | **event** | left-alone |

### `src/ui/uiRoot.js` — `syncFlightCursor` (every flight frame)

| Site | What | Verdict | Action |
|---|---|---|---|
| reticle `style.display` | every frame | **guilty** | **guarded** |
| autoTargetFlightPath `display` / `opacity` | every frame | **guilty** | **guarded** |
| route polyline `points` | was points-string gated | innocent | left-alone |
| endpoint ring/circle `cx`/`cy` | **4× setAttribute every frame** when path active | **guilty** | **guarded** |
| `is-drawing` classList.toggle | every frame | soft | **guarded** (drawing cache) |
| reticle transform | was `_sfHudTransform` gated | innocent | left-alone |
| `body.sf-flight-cursor` toggle | class | soft (browser no-op) | left-alone |

### `src/ui/floatingText.js` — overlay cadence when active

| Site | What | Verdict | Action |
|---|---|---|---|
| transform / opacity per live number | every overlay tick | **guilty** (rewrite even when string-identical mid-hold) | **guarded** |
| spawn/retire display | event | event | left-alone (+ cache reset) |

### `src/ui/damageIndicators.js` — overlay cadence when active

| Site | What | Verdict | Action |
|---|---|---|---|
| display / opacity / transform / chevron rotate | every overlay tick | **guilty** | **guarded** |
| retire display/opacity | event | event | cache cleared on retire |

### `src/ui/targetPanel.js` — ~20 Hz

| Site | What | Verdict | Action |
|---|---|---|---|
| display show/hide | style-read compare | innocent | left-alone |
| hull/armor/shield scaleX | last*Scale cache | innocent | left-alone |
| triangle fills | only on triKey change | innocent | left-alone |
| close color | lastCloseColor | innocent | left-alone |
| aria-label | setAttribute on identity/intel change | soft | **guarded** (`_sfAriaLabel`) |
| other display/color behind keys | — | innocent | left-alone |

### `src/ui/radar.js` — ~10 Hz canvas

| Site | What | Verdict | Action |
|---|---|---|---|
| canvas 2D draw | canvas pixels (not DOM attrs under #hud churn of this class) | n/a for attr meter | left-alone |
| `configureCanvas` width/height/style | size-gated | innocent | left-alone |
| `objectiveKey.hidden` | **hidden every draw** | **guilty** | **guarded** |
| expanded toggle cssText | user toggle | event | left-alone |

### `src/ui/bandHud.js` — every ui frame

| Site | What | Verdict | Action |
|---|---|---|---|
| full render behind `lastRenderSignature` | setAttribute/text | innocent | left-alone |

### `src/ui/commandBar.js` — **not** on default flight path (`COMMAND_BAR_IN_FLIGHT = false`)

| Site | What | Verdict | Action |
|---|---|---|---|
| `setFill` transform | would be guilty if enabled | **guilty if live** | **guarded** anyway |
| classList toggles on vitals | soft | left-alone |

### `src/ui/toasts.js` / `src/ui/comms.js` — tick when fading

| Site | What | Verdict | Action |
|---|---|---|---|
| fade `style.opacity` | every wake while fading | soft/guilty identical strings | **guarded** |
| spawn/dismiss attrs | event | event | left-alone |

### `src/ui/hudMeta.js` — overlay timers

| Site | What | Verdict | Action |
|---|---|---|---|
| class/display on phase/timer edges | event/timer | innocent for steady frame | left-alone |

### `src/ui/alerts.js` — tick expiry

| Site | What | Verdict | Action |
|---|---|---|---|
| raise/clear DOM | event | event | left-alone |

### `src/ui/effects/circularGauge.js` — cargo panel (event)

| Site | What | Verdict | Action |
|---|---|---|---|
| setValue stroke-dashoffset / aria / class | event (cargo refresh) | soft | **guarded** |

### Canvas / non-attribute (left-alone)

- `radar.js` 2D blip pass — not MutationObserver attribute records.
- Three.js / GL — different counter family.

---

## Fix shape

Write-on-change only: JS-side last-written values (`_sfStyle`, `_sfCssVar`, `_sfOpacity`, `_sfAttr`, `_sfDataEdge`, `_sfTitle`, `_sfHidden`, `_sfScaleX`, `_sfHudTransform`, local `last*` vars). **No** throttling of update rates, **no** quality cuts, **no** `element.dataset` used as the cache store.

Formatting of written strings kept equivalent to pre-fix producers (objective arrow transform still uses raw `${x}px` interpolation; floating-text/damage indicator strings unchanged).

## Verification

```text
npm run check:perf-counters
✔ ... 29 pass, 0 fail
ℹ duration_ms 262.22

npm run check:perf-packets
✔ ... 39 pass, 0 fail  (includes hud-contact-roster-keyed-rows)
ℹ duration_ms 925.7824
```

**PASS** both gates.

## Expected effect

Steady idle flight with stable vitals/HUD should drive `domAttributeMutations` toward **state-change rate** (near 0 per frame when nothing moves on screen), not ~13.6/frame. Continuous motion overlays (lead pip, objective arrow while flying, floating damage numbers while animating) still write when the serialized value actually changes.
