<!-- LIFETIME: CAMPAIGN -->
# X3 — Adventure glass: diagnosis

**Campaign:** X3 (Lane 6, LOOK & SOUND). Written before any edit, 2026-11-06.
**Depends on:** SWARM lane S2 (quiet glass) — landed `dba0710c14b3`. This campaign generalises it.

## 1. What the player sees

In ordinary Adventure flight the screen talks over the action. Three separate streams compete:

- **Prose over the fight.** Barks, faction news, codex discoveries and contract flavour arrive as
  sentences (*"The desk is open. The stacks already know what you carry."*) with the same priority as
  "taking fire". `admitReceipt` limits how many draw (`RECEIPT_MAX = 2`) but not *what* or *when*.
- **A jargon stack.** `stuntCallout.js` and `hud.js` print `CLEAN SNAG 93`, `IMPACT LOGGED — 214`,
  `LINE RELEASED 16T — MESSY`, `MASS 20 · EVEN PULL`, `GYRE — STRAIN ×4 · 38t`, and the Band HUD
  prints `BAND OFF`. A spectator cannot decode any of them.
- **A permanent seven-row power list.** `powerRail.js` shows five powers plus the Line plus the
  travel-drive lamp at all times (`PULL 1 · SHOVE 2 · …`), with words on every socket.

The 2026-11-05 baseline `swarm/baseline/03-jargon-and-line-panel.jpg` shows all three at once.

## 2. The measured cause chain

| Surface | Code | What it admits today | Measured |
|---|---|---|---|
| Receipts / toasts | `hudAttention.admitReceipt`, `toasts.js` | any source outside a live Swarm run; only the count is capped | `RECEIPT_MAX = 2`, source gate is `isSwarmGlass(state)` only |
| Comms / captions / discovery / target card | `comms.js`, `captions.js`, `discoveryPlate.js`, `targetPanel.js` | S2 adds early returns **inside Swarm only** | four Swarm-only gates |
| Stunt + massline telemetry | `stuntCallout.js`, `masslineHud.js`, `hud.js`, `gyreHud.js` | Adventure prints mass/tonnage/strain words; Swarm drops them | `MASS ${shown} · ${band}`, `GYRE — STRAIN ×${count} · ${mass}t` |
| Power rail | `powerRail.js` + `orrery/flightCluster.js` | seven sockets, words under every icon, always | 5 powers + LINE + DRIVE = **7 rows** |
| Voice | `audioSystem.js` bark consumer | non-fight barks muted in Swarm only | S2 patch is one Swarm condition |

The root defect is not any one string. **The glass policy has a Swarm-shaped predicate, so Adventure
has no policy at all.** S2 proved the mechanism (one pure module, every surface gated, plain-word
callout check, ≤3 short transients); it is wired to `isSwarmGlass`, which is false for Adventure.
That is why the fix took one commit in Swarm and Adventure still reads as a different product.

## 3. Is the design the bottleneck?

**Yes — the policy's scope, not its design.** Replacing the HUD would cost weeks and lose the
ORRERY Cluster, radar and objective tape that already work. Generalising the policy costs one new
pure module and the same ~10 call sites S2 already touched. The design question is what Adventure's
budget should be, not whether to have one.

## 4. The chosen road

1. **`src/ui/attentionGlass.js`** — one pure policy with a mode (`flight`, `combat`, `station`,
   `map`, `swarm`):
   - `attentionModeFor(state)` — Swarm keeps `swarm`; a live hostile/weapon event puts Adventure in
     `combat` for a short window; an open station screen is `station`; open map is `map`; else
     `flight`.
   - `attentionAdmits(state, { source, kind, text })` — Adventure flight admits fight, objective,
     system/error and one queue of low-priority chatter at a time; combat admits fight + objective
     only; station/map admit their own UI sources.
   - `plainCallout(text)` — the S2 readability check (≤3 words, no mass/tonnage/jargon/bare IDs),
     applied to Adventure stunt and massline words too.
   - `MAX_TRANSIENTS = 3`; the existing `RECEIPT_MAX = 2` stays as the stack size.
2. **Gate the same ten surfaces** on `attentionAdmits` instead of the Swarm-only check, keeping
   `swarmGlass` as the strict subset (so S2's tests and behaviour are unchanged).
3. **Plain words at the Line.** Adventure keeps the rope, the release diamond and the target, and
   prints at most one plain word (`GRAB`, `TOO HEAVY`, `RELEASED`). Mass/tonnage/strain words move
   behind the existing "Details" affordance (target panel / pause), not the flight glass.
4. **One persistent set.** Objective tape, hull/shield/heat, power icons with keys, radar; the
   seven-row word list collapses to icons with key caps (names in aria-label/tips), which is what
   S5 did for Swarm. Chat/prose arrives on the right rail as ≤3 short transients, never over the
   reticle.

**Verify:** Adventure flight captures at 0/10/30 s show only the persistent set + ≤3 transients of
≤3 words; the baseline jargon strings cannot draw; a fight event preempts chatter; station and map
screens are unchanged; `npm run check:ui:perf` holds; S2's Swarm tests still pass.
