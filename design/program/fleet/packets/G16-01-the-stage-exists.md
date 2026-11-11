# G16-01 — The Stage exists: one host for every transient popup

**Lane 2.** **Commission:** EC-G16 One glass. **Owner complaint:** "popups without borders or spacing
and a different style than the game, elements popping up overlapping others."
**Spec:** the recon draft `design/program/fleet/drafts/G16-one-glass.md` — §1 (what the player sees),
§2 (code facts, worklist, the seam), §3 files, §4 tests, §5 how to see it. Build **§6 "G16-01 the
Stage exists"** only. Follow `docs/UI_VISUAL_ITERATION.md` (ui-bench shots, `--walk`).

## Lead answers to the draft's §7 questions
1. PR #1024 is the commission brief only (documents) — no code to preserve or conflict with.
2. Radials (commsRadial, wingmanRadial) and world-anchored markers (floatingText, damageIndicators) are
   **out of scope** — separate surfaces.
3. The Stage owns the **transient** slots only (centre dialog/card, banner, toast stack, prompt deck).
   The HUD's fixed objective and contact panels stay in the HUD for now.
4. Queue semantics per slot: **priority first** (danger > warning > info — reuse `alerts.js`'s
   `SEV_RANK`), then first-come-first-served within the same priority; **one visible item per slot**
   (toasts: at most 3 stacked); a second dialog waits instead of overlapping.

## Done when
A new `stage.js` owns the named slots; the four existing hosts (promptDeck, toasts, alerts,
screenManager) mount inside their slots; two things can never overlap a slot; the draft's ui-bench
shots show the slots with no overlap at 1920×1080, 1366×768 and the phone viewport (`--phone`);
`--walk` passes on the screens you touched; `test/stage.test.mjs` covers priority, FIFO, one-visible.
Run ui-bench and any browser step through `node scripts/fleet/game-lock.mjs run -- ...`. Any `src/ui/**`
change: refresh the UI budget digest exactly as `test/ui-frame-references/` documents
(`scripts/lib/uiBudgets.mjs`).

Commit: `fleet(G16-01): one Stage hosts every transient popup; nothing overlaps`.
