# FB-014 — Salvage rights minted by a stunt are announced, claimable and recorded

**Kind:** wire · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: stuntGrammar.js, seam: shipLedger.js, seam: stuntCallout.js
**Write-set:** `src/systems/stuntGrammar.js`, `src/systems/shipLedger.js`, `src/ui/stuntCallout.js`, `test/fb-salvage-rights-heard.test.mjs`
**Neighbours (extend, never restate):** NXB-007, SF-278

## The gap
`stuntGrammar.js` emits `stunt:salvageRights`, `stunt:salvageRightsClaimed`, `stunt:lineContractCompleted` and
`stunt:bridge`; none has a listener (`stuntCallout.js` documents `stunt:bridge` and never subscribes). A stunt
mints an economic right the player is never told about and cannot see in any ledger.

## Why this direction
A rights inventory screen was rejected (no empire screen). The callout, the ship ledger and the existing loot
path are the three consumers the events need.

## Mechanism
- Subscribe `stuntCallout.js` to the four events: rights minted → a one-line callout naming the wreck; claimed →
  a confirm; bridge → the combo bridge tick.
- Add a ledger entry type in `shipLedgerTemplates.js`-style templates for rights minted and claimed so the
  record shows in the ship ledger panel.
- Pin that a rights mint on seed 4242 yields exactly one callout and one ledger entry, and that claiming
  consumes the right once.

## Done when
`test/fb-salvage-rights-heard.test.mjs` pins the callout, the ledger entry and the once-only claim;
`test/pq146-02-titles-ledger-bark.test.mjs` stays green.

## Do not
Do not add a rights market. Do not double-pay a claim after save/load (mirror the once-only reward boundary
law from SF-278).

## Focus test starting points
- `test/pq146-02-titles-ledger-bark.test.mjs`
- Locate stunt-grammar suites with `rg stuntGrammar test/`.
