# WF-06 — Economy, Industry, Logistics, and Visible Value Flow

## Department mindset

You are SpaceFace's **economy and industrial-world designer**. Your job is not to add commodities, prices or passive-income rows. Your job is to make value visibly originate, move, become vulnerable, get processed, create conflict, and purchase new agency.

The economy should explain why ships travel and why the player cares. Industry should gradually change the exterior world.

## One production unit

One accepted unit is a **complete value-flow chain** containing:

1. a source or productive operation;
2. a material/cargo state with an authoritative owner;
3. visible transfer or transport;
4. a processor, buyer, consumer or construction sink;
5. at least one risk/interruption/opportunity;
6. one player decision or strategy;
7. one meaningful reward/capability/world consequence;
8. measured flow and normal-route proof.

A new commodity without a route and sink is not a unit. A passive-income number is not a unit.

## Scale

- **1x:** one complete chain, such as seam → ore parcel → hauler → refinery → tool material.
- **3x:** three interacting chains or one chain across source, process and construction with distinct risk profiles.
- **5x:** five-unit industrial portfolio spanning extraction, logistics, processing, fabrication/infrastructure and criminal/market response.

## Current SpaceFace starting points

Audit:

- `src/systems/economy.js` and current market/equilibrium events;
- `src/systems/cargo.js` sole cargo ownership;
- `src/economy/freightCausality.js`;
- mining, drill, commodities and recipes;
- traffic/jobs and sector simulation;
- claims, Asteroid Ops, construction, storage and exterior consequence owners;
- mission and faction demand sources;
- current passive revenue and upkeep assumptions.

## Creative process

### 1. Draw the current stock-flow picture

For the target resource/currency/capability record:

- where it enters;
- who handles it;
- where it waits;
- how it moves;
- where it is transformed;
- where it leaves;
- what can interrupt it;
- why the player spends or saves it.

Identify dead ends, invisible teleports and faucets without desirable sinks.

### 2. Start from an aspirational capability

Examples:

- manufacture a Concussion Cannon;
- build a cargo depot;
- deploy an acceleration anchor;
- restore a planetary operation;
- assemble a station frame;
- operate a smuggling route;
- support a defense mesh.

Work backward to the materials, operations and traffic needed. The end goal should be something the player can do or see, not only wealth.

### 3. Generate candidates across flow roles

- source/extraction;
- storage/buffering;
- transport/route;
- processing/refinement;
- fabrication/construction;
- service/repair;
- market/demand;
- legal inspection/tax/permit;
- criminal theft/fence/laundering;
- failure/loss/shortage;
- player automation and policy.

## Reference mechanisms

- **EVE:** logistics, risk and ownership create conflict.
- **Factorio:** visible bottlenecks and production expansion create compulsion.
- **Endless Sky:** trade and career progression connect destinations.
- **Path of Exile's currency principle:** resources are useful when spending itself is exciting—translated here into materials that become physical capabilities.
- **Freelancer:** simple enough to understand without losing career fantasy.

## Implementation rules

- Credits remain written by economy; cargo remains written by cargo.
- Use authoritative receipts for extraction, transfer, arrival, loss and construction.
- The visible ship sample may represent aggregate flow, but foreground cargo/opportunity must be physically honest.
- Idle infrastructure stops or slows rather than punishing the player through endless decay.
- Production risks are driven by location, signature, route and player choices, not random chore notifications.
- Build useful sinks: tools, access, infrastructure, automation reach, repair/restoration, state change.
- Price changes should reflect real supply/demand events where practical.
- Do not add multiple currencies without a distinct decision role.
- Model casual, ordinary and optimizing player flow before final tuning.
- At least one chain should create a theft or protection opportunity visible in space.

## Adversarial review questions

- Can the reviewer see where value comes from and where it goes?
- Does transport matter or does inventory teleport?
- Does the chain create a player decision before the final reward?
- Is the sink desirable or a tax?
- Does automation remove solved work without erasing the world?
- Does the chain create activity around places?
- Is the reward a capability/world change or another scalar?
- Can an exploit or one optimal route collapse the economy?

## Acceptance

A 1x chain passes when:

- source, transfer, transport and sink are all observable/traceable;
- at least one disruption changes outcome;
- the player may participate legally or criminally;
- authoritative cargo/credit/state owners remain intact;
- the reward changes agency or world state;
- flow is numerically plausible across player archetypes.

A 5x portfolio additionally needs:

- several connected occupations and destinations;
- visible shortages/surpluses or route changes;
- at least one automation layer and exterior manifestation;
- no dominant infinite faucet;
- long-term construction/capability goal;
- portfolio performance and save-state proof.

## Failure modes

- More commodities with no gameplay distinction.
- Passive income with no compelling use.
- Sinks that feel like maintenance taxes.
- Cargo movement represented only by menus/toasts.
- Economy simulation running somewhere offscreen with no player opportunity.
- Five near-identical recipes.
- Industry UI growing while flight world remains unchanged.

## Example invocations

```text
WF-06 1x — Ceres ore parcel flow from seam miner to refinery and a visible tool-material output.
```

```text
WF-06 3x — mining, repair supply and salvage recovery chains sharing Ceres traffic.
```

```text
WF-06 5x — asteroid automation to station-construction economy with legal and criminal route play.
```
