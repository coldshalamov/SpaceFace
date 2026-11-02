// One short handoff on the existing Armory subtitle. Reads the same currentOffers
// receipt as the shelf; it neither quotes repairs itself nor owns a purchase.
export function firstSwarmIntermission(run, offers) {
  if (run?.kind !== 'survival' || run.ruleset !== 'swarm' || run.phase !== 'draft'
    || run.telemetry?.circuit != null || !Array.isArray(offers)) return null;
  const start = Number.isInteger(run.telemetry?.startWave) ? run.telemetry.startWave : 1;
  if (start !== 1) return null;
  if (run.wave === 0 && offers.length === 0) {
    return 'Before round 1 — no stock is available. Keep your current loadout and launch when ready.';
  }
  if (run.wave !== 1) return null;
  const wallet = Number.isFinite(run.credits) && run.credits >= 0 ? run.credits : null;
  const buyable = offer => offer?.available === true && offer.purchased !== true
    && Number.isFinite(offer.price) && offer.price >= 0 && wallet != null && offer.price <= wallet;
  const repair = offers.filter(offer => buyable(offer) && offer.kind === 'service'
    && (offer.service === 'weld' || offer.service === 'hull_patch')
    && typeof offer.name === 'string' && offer.name.trim()).sort((a, b) => a.price - b.price)[0];
  const choice = repair
    ? `Service: ${repair.name.trim()} (${repair.price} cr).`
    : offers.some(buyable)
      ? 'Buy for round 2, or keep your salvage.'
      : 'Keep your salvage; no purchase is available now.';
  return `Round 1 cleared. ${choice} Rearrange loadout for spares, or Fortify the field. Launch round 2 when ready.`;
}
