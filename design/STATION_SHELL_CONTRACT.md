# Station Strategy Mode Contract

**Authority:** behavioral and quality outcomes for the docked station mode. The user brief, root
architecture, live game state, and owning system contracts outrank historical layout choices.

**Live implementation:** `src/ui/station/stationScreen.js`, `stationApp.js`, `dock.js`, and
`src/ui/station/screens/`.

**Guard:** `npm run check:station-shell` proves live intents and task continuity. It must not freeze a
palette, panel topology, navigation position, framework, effect count, or aesthetic recipe.

The previous “Station OS” contract required a left rail, top strip, cyan panels, soft radii, and a
specific legacy `stationHub.js` structure. Those requirements were historical implementation
choices, contradicted current repository policy, and are superseded. They must not be restored as
acceptance criteria or hidden markup.

## 1. Product model

The station is the strategy half of SpaceFace: economy, preparation, ship acquisition, fitting,
production, contracts, factions, and local contacts. It is not navigation between reports.

The core interaction loop is:

> Select an object → reveal its state and relationships → manipulate or compare it → preview real
> consequences → commit through the owning game system → see the affected system respond.

Every substantial operation should support as many of these depths as its mechanic warrants:

1. **Glance** — understand the current state and available decision.
2. **Focus** — select the ship, slot, commodity, recipe, contract, faction, or contact.
3. **Reveal** — expose contextual relationships and constraints near the selection.
4. **Manipulate** — configure quantity, fit, route, allocation, filter, or choice.
5. **Simulate** — preview honest costs and derived consequences.
6. **Commit** — emit the canonical intent; the owning system performs the mutation.
7. **Explain** — reveal optional history, causes, help, or advanced detail without permanent copy walls.

## 2. Global invariants

- One primary station command model exposes destinations and immediate berth services. Do not add a
  duplicate permanent navigation rail.
- Destination selection, transient pointer/focus response, and immediate mutating verbs remain
  visually and semantically distinct.
- The selected operation owns the viewport. Station identity, credits, cargo pressure, readiness,
  and departure remain accessible without visually outweighing the active mechanic.
- Context is preserved. A shortcut must carry task mode, filter, selection, and focus—not merely
  arrive at the same destination.
- “Sell what you hauled” opens Market in Sell mode, filters to owned cargo, and focuses a sellable
  commodity. An empty hold receives a direct explanation.
- Shipworks unifies hull acquisition and outfitting around one authored ship preview and the real
  fitting/derived-stat pipeline.
- Refining and fabrication are modes of one production system when they share the same dependency
  chain; redundant entry points do not justify duplicate applications.
- Station identity, contextual help, and environmental narrative are separate concepts.
- All meaningful controls are keyboard reachable, have visible focus, expose hover information on
  focus, and retain a composed reduced-motion state.
- Hidden screens stop render and animation work. Player-facing preview quality is DPR-aware and does
  not settle on a deliberately degraded fallback.

## 3. Ownership and intent grammar

The station reads game state and emits intents. Simulation owners retain mutation authority.

| Player operation | Canonical path |
|---|---|
| Buy / sell commodity | `ui:buy` / `ui:sell` → economy |
| Repair / refuel / resupply | `ui:service` → economy |
| Buy / activate hull | `ui:buyShip` / `ui:setActiveShip` → ships |
| Buy / fit / remove module | `ui:buyModule` / `ui:fitModule` / `ui:unfitModule` → ships |
| Accept / track / abandon contract | mission UI intents → missions |
| Depart | canonical dock departure event and readiness gate |

Never invent a parallel mutation path to simplify presentation. Failed, locked, unaffordable,
incompatible, and unavailable states must localize the real reason.

## 4. Interaction representation rule

Choose the representation from the player’s reasoning problem:

- relationships → graph or constellation;
- flow → dependency path, Sankey, or routed beam;
- time → timeline;
- quantity → allocation control, threshold meter, or scale;
- alternatives → ghost preview, spatial chooser, or comparison scrubber;
- location → overlay on the real object;
- causality → shared transition and action receipt;
- hierarchy → semantic zoom or progressive expansion;
- explanation → anchored disclosure.

Advanced effects are not a quota. Each effect needs real state, a trigger, an accessible equivalent,
a maximum duration, and a disposal path. Idle ornament is not evidence of depth.

## 5. Quality boundary

Reject a result whose structure is interchangeable with a generic admin dashboard, whose important
mechanics are walls of text, or whose visual hierarchy is a repeated list / center card / inspector
template. This is an outcome boundary, not permission for a checker to grep for taste words.

Visual direction may change as the game develops. Tests protect behavior, reachability,
accessibility, lifecycle, measured performance, and task comprehension—not cyan, glass, radius,
sidebars, card counts, or exact DOM geometry.

## 6. Player-route acceptance

A representative browser/Electron run must demonstrate:

- all primary operations are reachable from one command model;
- pointer and keyboard navigation agree;
- immediate services report real state/cost and use live event paths;
- departure readiness and explicit risk handling work;
- owned-cargo selling preserves its filter and mode;
- Shipworks can select a hull, select a slot, preview compatible equipment, and commit or cancel;
- preview rendering is crisp, settles on authored assets, and stops when hidden;
- production, contracts, factions, and contacts expose their real actions;
- focus, contrast, reduced motion, and representative viewport compositions pass;
- current full-resolution screenshots are reviewed as evidence. Source-pattern checks alone do not
  prove this contract.
