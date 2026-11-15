# PRI-14b — The bench flags PRI-14 did not reach [FE]

**Frontend packet (Sonnet).** Continuation of
[`PRI-14-phone-screens-the-bench-flags.md`](PRI-14-phone-screens-the-bench-flags.md) — read it first;
same rules, same checks, same commit shape. PRI-14 timed out after items 1–2 landed
(`04978f3202`, `6c46c4f68b`). Do the remaining six items, in this order:

1. **Dossier popup, phone** — `popup-dossier`: verb rows overlap the station tab verbs; nothing of
   the screen beneath may print through or collide with the dossier's verbs.
2. **Station Ledger at 1440×900** — `station-ledger`: "BOUGHT", "SOLD", "Eligibility Assessment",
   "Assessment is free…", "Net worth", "20,400 / 100,000 cr" cut off — PR #1071's fix is gated
   ≥1441px wide and ≥721px tall, so 1440×900 misses it. Fix the gate or the layout; also check
   1280×720 and 1920×1080.
3. **Station Factions, treaty state, phone** — `station-factions-treaty`: "The lamplighters finished
   their w…" truncated — wrap it.
4. **Station Industry, desktop** — `station-industry`: "from Mining Laser S", "from Shield Booster S"
   cut off.
5. **Crucible refit (Swarm), phone** — `crucible-refit-swarm`: "Next — Round 11 — The Wing · clea…"
   prints on top of "Sell · 14 cr" and a blurb.
6. **Hail-panel bench shot** — catalog entry `hail-resident` per PRI-14 item 8. **The previous run
   already started this**: `scripts/lib/uiBenchCatalog.mjs` and `tools/ui-bench.js` carry its
   uncommitted fixture edits in the working tree — inspect the diff first (`git diff` on those two
   files), finish or rewrite it deliberately, then shoot `hail-resident` at 1440×900 and 390×844 and
   fix what looks wrong (the panel has never been looked at).

Everything else — tokens, 12px floor, `node --check`, `check-type-floor`, `check-ui-screen-imports`,
`check:src-imports`, `--walk` changed screens, before/after PNGs under `.devshots/fleet/pri-14b/`,
one `ui(<screen>):` commit per item — is identical to PRI-14. **Never** report a dirty or busy file
as a blocker: use `bash scripts/fleet/own-commit.sh begin|commit` and keep working.
