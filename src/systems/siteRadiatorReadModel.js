// Pure radiator projections shared by native stepping and detached presentation reads.
import { SITE_MACHINE_BY_ID } from '../data/sites.js';
import { stepSiteThermal, THERMAL_BANDS } from './siteThermalModel.js';
import { buildSiteSignature } from './siteSignatureModel.js';

function radiatorMachineRows(site, rt) {
  const machines = Array.isArray(site.machines) ? site.machines : [];
  const rows = [];
  const defs = {};
  for (let i = 0; i < machines.length; i++) {
    const m = machines[i];
    if (!m || typeof m !== 'object') continue;
    const powerKey = rt.powerCompByMachine && rt.powerCompByMachine[m.id];
    let ratio = 0;
    if (powerKey != null && rt.compRatio) {
      const raw = Number(rt.compRatio[powerKey]);
      ratio = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
    } else {
      const known = typeof m.defId === 'string' ? SITE_MACHINE_BY_ID.get(m.defId) : null;
      ratio = known && known.power > 0 ? 1 : 0;
    }
    rows.push({
      id: m.id,
      defId: m.defId,
      profile: rt.geo && rt.geo[m.id],
      powerRatio: ratio,
      mode: m.mode,
      col: m.col,
      row: m.row,
    });
    if (typeof m.defId === 'string' && !SITE_MACHINE_BY_ID.get(m.defId) && !defs[m.defId]) {
      const comp = powerKey != null && rt.compPower ? rt.compPower[powerKey] : null;
      const draw = comp && Number.isFinite(Number(comp.draw)) ? Math.max(0, Number(comp.draw)) : 0;
      // Harnesses report served draw. Catalog machines keep their real def and ratio.
      defs[m.defId] = { id: m.defId, power: -draw };
    }
  }
  return { rows, defs };
}

export function solveRadiatorThermal(site, rt, dtS) {
  const { rows, defs } = radiatorMachineRows(site, rt);
  const thermal = stepSiteThermal({
    dtS,
    machines: rows,
    radiatorFins: site.radiatorFins,
    ...(Object.keys(defs).length ? { defs } : {}),
  });
  // The plain-words band name rides the result so readers (the scanner) never import the thermal kernel.
  const band = THERMAL_BANDS.find((row) => row.id === thermal.worstBand);
  return { ...thermal, worstBandLabel: band ? band.label : '' };
}

export function radiatorSignature(site, rt) {
  const { rows } = radiatorMachineRows(site, rt);
  const power = [];
  const comp = rt.compPower;
  if (comp && typeof comp === 'object') {
    for (const key of Object.keys(comp).sort()) {
      const row = comp[key];
      if (!row || typeof row !== 'object') continue;
      power.push({ key, gen: row.gen, draw: row.draw });
    }
  }
  return buildSiteSignature({
    cleared: Array.isArray(site.cleared) ? site.cleared : [],
    machines: rows,
    power,
    radiatorFins: site.radiatorFins,
  });
}
