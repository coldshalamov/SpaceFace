# Packet F0 — Claude Fable Advisor (FIRST)

## Mission

You are the **taste + architecture advisor** for SpaceFace multi-agent polish.  
Orchestrator (Grok) has collected context. **Do not spend time broad-grepping the repo.**  
Read the packed context files, then produce a ranked build plan.

## Context files (read these fully)

1. `docs/evidence/orchestration/00_CHARTER.md`
2. `docs/evidence/orchestration/01_LIVE_TRUTH.md`
3. `docs/evidence/orchestration/02_MARKET_BAR.md`
4. `docs/evidence/depth-actualization/02_PROGRESS.md` (what Grok already landed)
5. `design/program/02_REMAINING_WORK.md` (stale-ish backlog — starting point only)
6. `design/program/README.md` (authority)
7. `ARCHITECTURE.md` (first 150 lines + search for flight/sim if needed)
8. `design/GDD_2_0.md` only if needed for pillars

## Hard fences

- Graphics worktree owns assets/thrusters/materials — **do not plan rewrites there**
- No mining greenfield rewrite; polish only if ranked
- No station shell redesign; no menu overhaul unless P0 UX disaster with evidence
- Prefer sewing existing systems over new frameworks

## Deliverable (write to)

`docs/evidence/orchestration/returns/F0_FABLE_ADVISOR_RETURN.md`

### Required sections

1. **Stale vs live** — top 10 program rows that are wrong given LIVE_TRUTH
2. **Failure taxonomy guidance** — how builders should classify RED checks
3. **Ranked wave plan (W1–W4)** — max ~15 build tasks total across Codex/Kimi/Grok
   - Each task: owner agent (codex|kimi|grok|fable), 1-sentence outcome, acceptance command, files likely, risk
4. **Kimi 2–3 only** — the highest-taste tasks worth scarce budget
5. **Fable 5–7 self-tasks** — architecture/taste work Fable should personally own next
6. **Polish opportunities** vs 2020s space-game bar (from MARKET_BAR + your judgment)
7. **Mining** — polish yes/no, exact slice if yes
8. **Explicit non-goals** for this campaign
9. **Integration order** so parallel worktrees don’t thrash

## Quality standard

Steam-quality space game: motivated world, readable combat, causal economy, discoverable depth, professional first hour. SpaceFace-specific voice (receipts, bureaucracy, Firefly-adjacent frontier).

## Do not

- Claim features DONE
- Edit `design/program/**` status (orchestrator integrates)
- Start large implementation in F0 (advice only; small clarifying reads OK)
