export const PQ024_COMMITTED_PRESENTATION_SCHEMA =
  'spaceface.pq024-committed-presentation.v1';

/**
 * Fail-closed contract for the player-visible state immediately after a Massline Core commits the
 * active assay. The Browser/Electron actor supplies a DOM snapshot; this pure check keeps the
 * acceptance predicate seconds-scale and gives stale transition frames causal diagnostics.
 */
export function assessPq024CommittedPresentation(snapshot, { expectedSiteId = null } = {}) {
  const failures = [];
  const row = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const owner = row.owner && typeof row.owner === 'object' ? row.owner : {};
  const inspector = row.inspector && typeof row.inspector === 'object' ? row.inspector : {};
  const siteId = text(owner.siteId);
  const wantedSiteId = expectedSiteId == null ? null : text(expectedSiteId);
  const cells = Number(owner.cells);
  const claimText = text(row.claimText);
  const assayText = text(row.assayText);
  const kicker = text(inspector.kicker);
  const title = text(inspector.title);
  const body = text(inspector.text);

  if (!siteId) failures.push('owner site id is missing');
  if (wantedSiteId && siteId !== wantedSiteId) {
    failures.push(`owner site id is "${siteId}", expected "${wantedSiteId}"`);
  }
  if (owner.anchored !== true) failures.push('owner site is not anchored');
  if (owner.lifecycle !== 'committed') {
    failures.push(`owner lifecycle is "${text(owner.lifecycle)}", expected "committed"`);
  }
  if (!(Number.isInteger(cells) && cells > 0)) {
    failures.push(`owner committed cell count is invalid: ${String(owner.cells)}`);
  }
  if (claimText !== 'Anchored') {
    failures.push(`claim chip is "${claimText}", expected "Anchored"`);
  }
  const expectedAssay = Number.isInteger(cells) && cells > 0 ? `Assay ${cells} cells` : null;
  if (!expectedAssay || assayText !== expectedAssay) {
    failures.push(`assay chip is "${assayText}", expected "${expectedAssay || 'Assay <cells> cells'}"`);
  }
  if (kicker !== 'Site overview') {
    failures.push(`inspector kicker is "${kicker}", expected "Site overview"`);
  }
  if (title !== 'Anchored claim') {
    failures.push(`inspector title is "${title}", expected "Anchored claim"`);
  }
  if (!/Survey record:/i.test(body)) failures.push('inspector is missing the durable Survey record');
  if (!/Awaiting first real output/i.test(body)) {
    failures.push('inspector is missing the first-output consequence');
  }
  if (/A machine already occupies this cell/i.test(body)) {
    failures.push('inspector retains occupied-placement error');
  }

  return {
    schema: PQ024_COMMITTED_PRESENTATION_SCHEMA,
    pass: failures.length === 0,
    failures,
  };
}

function text(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}
