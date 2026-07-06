# BP-12 — CAUSAL ECONOMY MISSIONS & CONTRACTS

> **New BP** (doctrine §6). The load-bearing rule this whole BP exists to satisfy: **"no economy change without
> cause."** **Absorbs clusters L (causal world & economy-driven missions, 201-235 + 401-410), M (cargo/customs/
> contraband, 221-240), S (contracts engine, 486-500).** Packets: `detail/E_salvage_economy_contracts.md` +
> `DETAIL_PACKETS.md`. **Extends** SPEC3-F1. **The gold ore:** `dangerModel` (reaction-diffusion danger/price/
> influence field) + `sectorSim` (projects to spawns/economy/tension/intel + offscreen losses) already exist —
> **mine them**, don't build a parallel simulation.

## Goal
Make the deepest system in the codebase *perceptible and causal*: the player understands **why** the world
changed and can **act** on it. Objective #3 (the economy breathes on-screen) with teeth.

## Scope (packets in `detail/E_salvage_economy_contracts.md`; highlights)
- [ ] **"Why prices changed" tooltip → cause ledger** — every market/danger/faction change traces to a cause from the `dangerModel`/`sectorSim` driver ("fuel rose because two Meridian convoys were interdicted near Tethys"). `marketNews` surfaces the headline; this adds the *chain*.
- [ ] **Missions born from economy, not boards** — surplus → delivery; scarcity → fuel run; rising danger → escort; convoy loss → salvage + investigation POI; station attacked → repair-material demand; Reach pressure → bounty cluster. Generated from live field state, seeded.
- [ ] **Customs / contraband gameplay** — submit / bribe / spoof / run / dump; cargo reputation (medicine→Frontier, weapons→anger-Concord, contraband→Quiet); contraband heat that decays or bribes off. Ties to the shipped `dockDeny`/faction rep.
- [ ] **Contracts engine** — contracts with collateral / optional clauses (no-kills, cargo-intact, time-limit) / moral traps / physical twist (too-massive, tether-only) / route planning; contracts that **start from objects/events/economy/rumor** (a drifting communicator, a witnessed convoy attack, a shortage, a bar rumor).
- [ ] **Markets remember violence · security follows danger · pirate adaptation** — player actions feed `sectorSim` impulses (mostly VALIDATED plumbing; surface the consequences).

## Contracts
Determinism (seeded per station/refresh-epoch, as missions already are); economy is single-writer — read the
field, emit sanctioned intents only; `voiceArbiter` for intel lines; no per-frame flavor rolls without a domain.

## Acceptance
`check:causal-economy` (new): every surfaced price/danger change has a machine-traceable cause; an economy-born
mission appears deterministically from a seeded surplus/scarcity; a customs encounter offers submit/bribe/run/dump
and each resolves; `check:balance` stays green.

## Dependencies
`dangerModel` + `sectorSim` (shipped) · `economy`/`marketNews` (shipped) · `missions` · coordinates with BP-01
(convoy-loss → salvage POI) and BP-13 (danger → bounty clusters).
