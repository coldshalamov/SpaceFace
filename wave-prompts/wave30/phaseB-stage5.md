You are the S1 Phase-B **Stage 5** implementation agent for coldshalamov/SpaceFace — a Three.js space game (browser + Electron). This is IMPLEMENTATION work on the whole-sim-in-worker spike: remediate the synchronous main→sim call/write surface so every cross-lane interaction is a command, an RPC, or a mirror read before the flip. Verify, commit, push.

CHECKOUT: work on branch `devin/s1-sim-worker-spike` — pull latest before starting (HEAD should include stage 4 — domain mirrors — landed by lane `12b6d5cdd188453a9feac2c511dd8a3b`; if it is NOT yet merged into the spike branch, coordinate: implement against whatever stage-4 surface exists and note it in the report). Do NOT touch master or the perf branch. Commit to the spike branch and push.

CONTEXT: `design/perf/STRUCTURAL-HORIZON.md` (on branch `devin/1790796194-perf-w8-hitches`) — §W29 stage-5 census lists the exact conversion surface (verified by grep; re-verify line numbers before citing). Stage 5 reads: "Hard-sync remediation — flag-gated eager market mint (commodity order → quote pure), promote→command+ack, physicsPrep→RPC". Stages 0–3 landed; stage 4 (domain mirrors) lands the read side — your job is the write/call side.

THREE WORK ITEMS (in this order — each independently gated + committable):

### A) Eager market mint → `economy.quote` pure (the HIGH item)

THE mutating read: `economy.quote(sid, cmdtyId, side, qty)` (market.js:677/687 via `ctx.registry.get('economy')`, tradeLogic.js:94) lazily calls `ensureMarket`/`mintUnseededListing`/`getCycle` — which draws `state.economy.rngSeed` and mutates market state *on UI call order*. Two bugs in one: a same-tick reader's answer depends on whether the trade screen was open, and post-flip it's a hard-sync call that can't cross the ring.

Design (follow unless code proves it wrong — report deviations):
- Move the mint to **tick end** inside the sim: after the economy tick completes, iterate markets in a CANONICAL commodity order (sorted stationId × commodityId — derive the enumeration from the same table the lazy mint reads) and materialize every listing that lazy access would have produced for the tick window. Quote() then reads the already-materialized row — pure projection.
- Flag-gate it: `economy.eagerMarketMint` (or a feature flag on ctx) — when OFF, keep today's lazy path byte-for-byte. Default ON inside the spike; the flag exists so the flip can A/B.
- Determinism proof the fix actually strengthens: today the draw order = first-UI-touch order across save/load + event replay; canonical mint order makes it input-order-invariant. The golden hash MUST remain bit-identical — if canonical order vs. the 47a run's UI-touch order diverges (a quote drawn during 47a), the mint order must be arranged to reproduce identical draws (e.g. mint exactly the listings the seed's interactions produce, in the same relative order — if impossible to match bit-for-bit without the UI path, document why and propose the flag-default that keeps golden parity; DO NOT ship a hash-changing mint order silently).
- Trade EXECUTION is already evented (`bus.emit('ui:buy'|'ui:sell')` at market.js:1616) — no conversion needed there; verify the emit carries everything the worker needs (sid, commodity, qty, price-lock if the contract snapshots one).

### B) Command conversions — direct `state.*` writes → ring envelopes

The census list (verify each site still exists; add any site the grep surfaces that the census missed — these all become `{kind}` envelopes over the stage-1 command ring, or fold into the existing input directive where marked):

- `state.player.targetId` (~11 sites): uiRoot.js:1600/1614/1622/1742/1765/1769, hud.js:4459, commsRadial.js:304, worldObjectInteraction.js:54/67/196/355 — **fold into the input directive** (it's already input-adjacent; a new command kind is not wanted here).
- `state.input.*` writes: uiRoot.js:1248/1259/1269 `.blocked`, :1625/1626 `targetAssistDisabled`/`autoAim`, hud.js:4460, worldObjectInteraction.js:61/72, crucibleLabControls.js:364 `input.actions` — input fold, same directive.
- `state.nav.waypoint` + `state.nav = {}` — tradeLogic.js:463/483 — `{kind:'nav'}` command.
- `state.mode` — pause.js:977/985/998 (unevented — command; it must emit `mode:changed` worker-side on receipt so the event stream stays identical); screenManager.js:~466 is redundant with the evented path — **drop the write, don't twin it** (verify the evented path fires first — if pause.js sets mode then screenManager re-sets it, removal is safe only when the evented write already landed; trace the ordering).
- `state.settings.ui.*` — hud.js:4365-4372, hudLayout.js:137, camera.js:245 — settings envelope (stage-1 channel already exists — extend its key allowlist if these paths aren't covered).
- `helpers.spawnEntity`/`removeEntity` — sandboxSetup.js (5+ sites), crucibleLabControls.js:204/405 — spawn/remove commands (same envelope shape as scenario spawns).
- `main.js:521` spawnEntity, `:531` world.enterSector, `:559-568` misc mutations — commands.
- `main.js:535` `state.rng()` on main — find the consumer, move it worker-side or serve it from a worker-drawn value shipped in the tick reply (a main-side draw forks the stream — HARD forbidden). Verify no main-side `state.rng` call sites remain (grep for them all, list each disposition in the report).

Each conversion needs an **ack/apply path** for the spike driver: the command envelope posts into the ring and the worker applies it at the next directive boundary (never mid-tick — the input fold's existing tick-boundary semantics). The spike runner needs a way to inject each command kind so the probe exercises them (see gate below).

### C) promote → command+ack; physicsPrep → RPC

- `promoteAsteroidFieldRock`/`promoteFarActor` called synchronously from the render lane's far-row machinery — post-flip these become `{kind:'promote', id}` commands; the render lane drops the far row's mesh on COMMAND SEND, and the worker acks promotion in the tick reply (the far-row ledger update already carries the removal — verify the ack is just the aux-channel removal, don't add a second channel). Promotion was never same-frame-visible, so the one-tick latency is contract-legal — write the boundary so the far row stays presented until the worker's removal row arrives (don't blank it early).
- `physicsPrep`/`finalize` — already async (returns a promise); post-flip it's a `{kind:'rpc'}` envelope with a correlation id and the reply carries the prepared result. Convert the call site to the RPC shape on the spike's host driver; keep the sync-in-process path for `SIM_LANE=main`.

HARD CONTRACTS:
- Golden 47a sha256 `e517a97bd256045b0db0f96a7124a5abd539478a84ee305e36e1eb8479449dd3`, `deterministic:true` via the spike runner non-probe: `/c/hostedtoolcache/node/24.0.1/x64/node scripts/sf-sim-worker-spike.mjs --ticks 720 --seed 47 --inputs test/47a.inputs.json --reload-at 600` — ALL gates pass (A–F + stage-4's domain probe). The eager mint is the hash-risk item — see its design note; everything else (commands folding at tick boundary) must reproduce identical sim writes.
- `node --check` every touched file.
- Command application is tick-boundary only — never mid-tick (same class of bug as emit-slicing: ordering changes = determinism changes).
- Mutate-in-place / no behavior change to `SIM_LANE=main` paths — the flag must make today's path reproduce byte-for-byte when the worker is off.

VERIFY GATES (all must pass before push):
1. `node --check` clean on every touched file.
2. Non-probe spike run: verdict ALL PASS — golden bit-identical.
3. `--probe aux` run: ALL PASS.
4. `--probe domains` run: ALL PASS (stage-4's probe — keep it passing).
5. New `--probe commands`: inject at least one of each new command kind mid-run (a mode write, a nav command, a spawn, a targetId fold, a promote, an rpc round-trip) — ALL PASS with the mutating-probe relaxation for gate A if the commands perturb the hash by design (mirror the existing `mutatingProbe` pattern), BUT prefer non-perturbing injections so the hash gate still binds (e.g. a mode write that writes the value already set, a nav waypoint to the already-set waypoint — exercises the envelope path without changing sim outcome).
6. Market-parity probe: with the eager mint ON, a scripted quote sequence produces identical prices/qtys as the lazy path on the same seed (add `quoteProbe` rows or a dedicated mini-run — the 47a inputs include trade interaction if available; if not, synthesize a 60-tick quote probe against a seeded market).

ENVIRONMENT: Windows Server 2022, Git Bash, no Python, no rg (use grep). Node 24 at `/c/hostedtoolcache/node/24.0.1/x64/node` — ONE node process at a time. SwiftShader box — never draw GPU conclusions from wall timings. `gh` unavailable. NEVER create junctions inside git worktrees. Tests run as `/c/hostedtoolcache/node/24.0.1/x64/node test/<name>.test.mjs`.

COMMIT + PUSH: commit `s1(phaseB): stage 5 — hard-sync remediation (eager mint, commands, rpc)` with a body listing every converted site (file:line → envelope kind), the mint ordering rules + flag name, probe results, and gate output. Push to `devin/s1-sim-worker-spike`. If the work is too large for one lane, land item A fully + commit, then item B, then item C — partial pushes are fine as long as each commit's gates pass; say in the report what's landed vs remaining.

REPORT: converted site inventory (every file:line and its envelope kind), flag names + defaults, market-mint ordering + parity evidence, `--probe commands` coverage, any census site that turned out already-converted/impossible (with evidence), design deviations, and what stage 6 (the flip) still needs.
