# Economy professional depth — evidence routes (ECON-P6)

**Packet:** ECON-P6 anti-exploit / professional economy depth
**Scope:** route definitions only. This file does **not** claim that screenshots, videos, or JSON capture artifacts already exist under `.devshots/economy/`. Capture when a later evidence pass needs them.

**Headless gate (no artifacts required):**

```bash
node --test test/economy-professional-anti-exploit.test.mjs
node scripts/check-economy-professional-depth.mjs
```

Machine-readable outcomes from the current check: `pass` | `fail` (RED). The professional
economy suite currently has no skipped cases.

---

## Seven default Browser / Electron evidence routes

These are the default player-facing paths to exercise anti-exploit and depth seams on **the same** New Game / Continue route (One Game Path). Use Browser (`http://localhost:8123/` or the project dev server) **or** Electron (`npm run electron`) — both must boot the same game entrypoint.

| ID | Route | Runtime | What to observe (manual) | Related headless case |
|----|-------|---------|--------------------------|------------------------|
| **R01** | Main Menu → **New Game** → first flight → dock home station → **Market** | Browser + Electron | Quotes show impact % on large qty; selling a large stack softens the local sell price (flood self-decay). | `flood_self_decay` |
| **R02** | New Game → flight near freighter/traffic → open Market after freighters dock/trade | Browser + Electron | Ambient freighter activity moves station stock/prices; **player credits/cargo unchanged** by NPC trades. | `npc_no_wallet_cargo` |
| **R03** | Dock → Market → buy until station stock is nearly empty | Browser + Electron | Cannot buy the last unit; buy fails or clamps with stock floor ≥ 1. | `buy_stock_floor` |
| **R04** | Dock station A (note prices) → undock → dock station B → Market “best known sell” / memory chips | Browser + Electron | Memory and best-known lines only reference **visited** stations — never unvisited live oracles. | `memory_no_omniscience` |
| **R05** | Station → Automation / Operations board → note passive cap; optional away/reload for offline summary | Browser + Electron | Passive income rate respects cap vs active reference; offline catch-up (if triggered) is efficiency-scaled and capped — not full AFK print. | `passive_cap_offline_eff` |
| **R06** | Dock in a high price-pressure / scarce sector → re-dock same epoch → Mission board | Browser + Electron | At most **one** field-born offer per station-epoch; re-dock does not duplicate. Calm fields intentionally stay silent. | `field_contract_dedupe` |
| **R07** | Carry contraband → patrol scan / gate customs → Submit / Bribe / Run panel | Browser + Electron | UI projects fine/bribe only; **one** charge path via economy (`fine:contraband` / `bribe:contraband`). No second UI fine. Trade ledger + event news remain coherent after a buy/sell + shortage/boom. | `no_ui_double_fine`, `deterministic_trade_event_log` |

### Route numbering (copy-paste checklist)

1. **R01 — Market flood / impact** (Browser or Electron)
2. **R02 — NPC traffic ≠ player wallet** (Browser or Electron)
3. **R03 — Buy stock floor** (Browser or Electron)
4. **R04 — Memory honesty** (Browser or Electron)
5. **R05 — Passive cap / offline** (Browser or Electron)
6. **R06 — Field contract dedupe** (Browser or Electron; calm fields intentionally stay empty)
7. **R07 — Customs single fine + ledger** (Browser or Electron)

---

## Not claimed here

- No paths under `.devshots/economy/*.png` or `*.json` are asserted present.
- Freight pressure conservation is proved headlessly through the shipped `pressureShareRecipe`;
  live freighter share plus abstract field share never exceeds the prior abstract-only budget.
- Do not treat this README as acceptance proof — checks are.

## Related production seams (read-only for this packet)

- `src/systems/economy.js` — quote/execute, stock floor, NPC stock pressure, trade ledger, events, runScan
- `src/systems/automation.js` / `src/data/automation.js` — passive cap + offlineEff
- `src/systems/economyContracts.js` — registered field-offer source with saved station-epoch dedupe
- `src/ui/customsPrompt.js` — decision surface only (no credit writes)
- `src/ui/screens/market.js` — `bestKnownSellFor` over `marketMemory`
