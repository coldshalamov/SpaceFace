// Pure presentation seam for persistent demand causes. Economy stores every contributing driver;
// UI surfaces use this helper so rows, routes, map intel, and assistive text never silently explain
// only the first cause when conditions stack (for example war plus blockade pressure).

function directionFrom(multiplier, drivers) {
  const value = Number(multiplier);
  if (Number.isFinite(value)) {
    if (value > 1 + 1e-9) return 'up';
    if (value < 1 - 1e-9) return 'down';
  }
  const directions = new Set(drivers.map((driver) => driver.direction));
  if (directions.size === 1 && directions.has('up')) return 'up';
  if (directions.size === 1 && directions.has('down')) return 'down';
  return 'flat';
}

function compactName(driver) {
  const source = String(driver.shortLabel || driver.label || '').trim();
  const first = source.split(/[·|]/, 1)[0].trim();
  return first || String(driver.label || 'Demand').trim();
}

function labelledExplanation(driver) {
  const label = String(driver.label || '').trim();
  const explanation = String(driver.explanation || '').trim();
  if (!label) return explanation;
  if (!explanation) return label;
  return explanation.toLocaleLowerCase().includes(label.toLocaleLowerCase())
    ? explanation
    : `${label}. ${explanation}`;
}

export function summarizeDemandDrivers(rawDrivers, multiplier = 1) {
  const drivers = (Array.isArray(rawDrivers) ? rawDrivers : [])
    .filter((driver) => driver && typeof driver === 'object')
    .map((driver) => ({
      id: driver.id != null ? String(driver.id) : '',
      label: String(driver.label || driver.shortLabel || 'Persistent demand').trim(),
      shortLabel: String(driver.shortLabel || driver.label || 'Persistent demand').trim(),
      explanation: String(driver.explanation || driver.label || driver.shortLabel || '').trim(),
      direction: driver.direction === 'up' || driver.direction === 'down' ? driver.direction : 'flat',
    }))
    .filter((driver) => driver.label || driver.shortLabel || driver.explanation);
  if (!drivers.length) return null;

  const direction = directionFrom(multiplier, drivers);
  if (drivers.length === 1) {
    const only = drivers[0];
    return Object.freeze({
      id: only.id,
      label: only.label,
      shortLabel: only.shortLabel,
      explanation: labelledExplanation(only),
      direction,
      drivers: Object.freeze(drivers),
    });
  }

  const arrow = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '↕';
  const compact = [...new Set(drivers.map(compactName).filter(Boolean))];
  const labels = [...new Set(drivers.map((driver) => driver.label).filter(Boolean))];
  return Object.freeze({
    id: 'stacked-demand',
    label: labels.join(' + '),
    shortLabel: `${compact.join(' + ')} ${arrow}`,
    explanation: drivers.map(labelledExplanation).filter(Boolean).join(' '),
    direction,
    drivers: Object.freeze(drivers),
  });
}

export default summarizeDemandDrivers;
