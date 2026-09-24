// wantedReason.js — the WANTED alert's incident trace (INF-077).
//
// Renders the heat owner's convicting-incident record as a compact reason suffix:
// kind, affected party, and the witness/jurisdiction basis the law actually
// established. Pure and DOM-free so the no-false-witness rule is unit-testable:
// suspicion without a receipt yields no reason, and a record carrying neither
// witnesses nor a jurisdiction renders the kind alone — never an invented witness.
export const WANTED_KIND_LABELS = Object.freeze({
  payload_theft: 'CARGO THEFT',
  unlawful_kill: 'KILL',
  lawful_kill: 'LAW KILL',
});

export function wantedReasonText(packet, player) {
  const inc = (packet && typeof packet === 'object' && packet.incident)
    || (player && typeof player === 'object' && player.heatLastIncident)
    || null;
  if (!inc || typeof inc !== 'object' || !inc.incidentReceiptId) return '';
  const parts = [WANTED_KIND_LABELS[inc.kind]
    || (typeof inc.kind === 'string' && inc.kind ? inc.kind.toUpperCase().slice(0, 32) : 'INCIDENT')];
  if (typeof inc.affected === 'string' && inc.affected) parts.push(inc.affected);
  if (Number(inc.witnessCount) > 0) {
    parts.push(inc.witnessCount + (inc.witnessCount === 1 ? ' WITNESS' : ' WITNESSES'));
  }
  if (typeof inc.jurisdiction === 'string' && inc.jurisdiction) parts.push(inc.jurisdiction);
  return ' · ' + parts.join(' · ');
}
