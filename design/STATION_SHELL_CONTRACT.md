# Station Shell Contract — Station OS (not a webpage)

**Authority:** This file is the spatial + interaction contract for the docked station screen.
When agents add chrome that violates it, reject the diff. Taste still inherits
`design/spec2/00_MASTER_TASTE.md` (no visor, no backdrop-filter, dark panels, cyan interactive).

**Live implementation:** `src/ui/screens/stationHub.js` (shell) + tool panels under `src/ui/screens/`.
**Guard:** `npm run check:station-shell`.

---

## 1. Model

The docked station is a **small OS of tools**, not a command-deck diorama.

```
┌─ App rail (Nav only) ────────┬─ Workspace (active tool ≥70% center) ────────┐
│ Market                       │                                              │
│ Hold                         │   FULL HEIGHT tool window                    │
│ Services                     │   no permanent essay column                  │
│ Shipyard / Outfit / …        │                                              │
└──────────────────────────────┴──────────────────────────────────────────────┘
 Top strip: Station name · credits · cargo · Briefing (Meta) · Undock (Meta)
```

Optional later (Phase D, not required): floating secondary tool windows.

---

## 2. Spatial rules (non-negotiable)

1. **One primary tool** owns ≥70% of the center workspace height.
2. **Rail = place/tool names only.** No status essays on rail rows. A one-line chip max if needed.
3. **Services are verbs** on the Services tool (quote → confirm). Not a second nav of dead icons.
4. **No permanent briefing column.** Lore/diagnostics open only via Meta “Briefing” drawer.
5. **Tutorial is disposable** — one dismissible strip; never permanent multi-card layout chrome.
6. **Every control answers in &lt;50 ms** (toast, number change, list refresh). Taste constitution.

### Forbidden permanent layout chrome

- Decorative bullseye / schematic centerpiece eating vertical space
- Route-beam overlays drawn across readable content
- Always-visible diagnostics/essay sidebar
- Multi-card first-dock handoff grid as permanent chrome
- Service “icon dock” that only selects trivia without acting

---

## 3. Control grammar (four types — never mix meanings)

| Type | Looks like | Does | Examples |
|------|------------|------|----------|
| **Nav** | Left rail row | Switches tool | Market, Hold, Services |
| **Verb** | Solid primary button | Mutates economy/ship via live intents | Sell all, Refuel now |
| **Param** | Stepper / field / chips | Sets qty/filter/mode | Qty 1…N, Buy\|Sell mode |
| **Meta** | Ghost / icon / secondary | Opens help, undock, briefing | Briefing, Undock |

**Anti-patterns (reject):**
- Nav that looks like Verb (Refuel chip that only selects)
- Verb that is Meta (“Audit hold” card that only switches tab with jargon)
- Param that mutates without confirmation when cost is material (prefer quote→confirm for services)

### Live intents (sole writers stay in systems)

- Trade: `ui:buy` / `ui:sell` → `economy.handleTrade`
- Services: `ui:service` `{ type, amount }` → `economy.handleService`
- Never invent dead bus names (`ui:trade` is forbidden)

---

## 4. Tool ownership

| Tool | Owns | Must not |
|------|------|----------|
| **Hold** | Hangar list, station pay price, sell 1 / N / all | Mini-market forecast chrome |
| **Market** | Buy\|Sell board, search/categories, qty, live total | Always-on forecast cones (expand-only) |
| **Services** | Quote cards → confirm for refuel/repair/ammo | Decorative berth map |
| **Missions** | Job cards with Accept primary | Microscopic secondary-only CTAs |
| **Outfit / Shipyard** | Ship stage + shop list | Blank white stage as default |

---

## 5. Design language (quiet premium)

- Ground: near-opaque dark panels (`rgba(5,9,18,.92)` class)
- Structure: 1 px edge, soft radius; **no** nested neon frames
- Type: mono for numbers/labels; body for copy; **labels upper, content sentence case**
- Accent: cyan interactive; green ready/profit; amber strain; red block
- Motion: 150–200 ms ease-out open/close; **no idle animation**
- Voice: “Sell ore.” not “AUDIT HOLD / SELL CARGO”

---

## 6. Acceptance (five-second test)

Pause on the station screen. A stranger must name:

1. Left rail tools  
2. Active tool workspace  
3. Top strip (name / money / cargo / undock)  

If chrome &gt; content, the shell failed.
