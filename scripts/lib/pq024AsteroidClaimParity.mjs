export function projectPq024RouteSemantics(receipt) {
  const observations = receipt?.observations || {};
  const productionReceipt = observations.production?.receipt || {};
  const cargo = Array.isArray(observations.cargo) ? observations.cargo : [];
  return {
    schema: 'spaceface.pq024-asteroid-claim-semantics.v1',
    fixedSeed: Number(receipt?.fixedSeed),
    recordedSeed: Number(receipt?.recordedSeed),
    cargo: cargo.map((row) => ({
      commodityId: row?.commodityId || null,
      requested: Number(row?.qty),
      acquired: Number(row?.after?.owned) - Number(row?.before?.owned),
    })),
    asteroidSiteId: observations.asteroid?.siteId || null,
    survey: {
      revealed: Number(observations.surveyReveal?.revealed),
      cells: Number(observations.surveyReveal?.cells),
    },
    core: {
      siteId: observations.core?.siteId || null,
      anchored: observations.core?.anchored === true,
      lifecycle: observations.core?.lifecycle || null,
      cell: normalizeCell(observations.core?.cell),
    },
    extractor: {
      siteId: observations.extractor?.siteId || null,
      cell: normalizeCell(observations.extractor?.cell),
    },
    production: {
      siteId: observations.production?.siteId || null,
      lifecycle: observations.production?.lifecycle || null,
      outputId: productionReceipt.outputId || null,
      positiveQuantity: Number(productionReceipt.positiveQuantity),
      eventCount: Number(observations.production?.eventCount),
    },
    relay: normalizeRelay(observations.relay),
    continue: {
      siteId: observations.continued?.siteId || null,
      lifecycle: observations.continued?.lifecycle || null,
      outputId: observations.continued?.outputId || null,
      positiveQuantity: Number(observations.continued?.positiveQuantity),
      receiptMatches: observations.continued?.receiptMatches === true,
      relayCount: Number(observations.continued?.relayCount),
    },
    restoredAsteroidSiteId: observations.restoredAsteroid?.siteId || null,
    reentered: {
      siteId: observations.reentered?.siteId || null,
      lifecycle: observations.reentered?.lifecycle || null,
      producingChip: Array.isArray(observations.reentered?.chips)
        && observations.reentered.chips.includes('Producing'),
    },
    restoredRelay: normalizeRelay(observations.restoredRelay),
  };
}

function normalizeCell(cell) {
  return {
    col: Number(cell?.col),
    row: Number(cell?.row),
  };
}

function normalizeRelay(relay) {
  return {
    count: Number(relay?.count),
    placeId: relay?.placeId || null,
    siteId: relay?.siteId || null,
  };
}
