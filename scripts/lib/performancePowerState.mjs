// Read-only host power metadata for performance receipts. Browser/Electron support for
// navigator.getBattery is optional, so unsupported and failed reads stay explicit unknowns.

function errorText(error) {
  return String(error?.message || error || 'unknown power-state error').slice(0, 500);
}
function unknownRecord(capturedAt) {
  return {
    schema: 'spaceface.performancePowerState.v1',
    status: 'unknown',
    supported: null,
    charging: null,
    level: null,
    chargingTime: null,
    dischargingTime: null,
    capturedAt,
  };
}

export async function captureHostPowerState(page) {
  const capturedAt = new Date().toISOString();
  const unknown = unknownRecord(capturedAt);
  if (!page || typeof page.evaluate !== 'function') {
    return { ...unknown, status: 'error', error: 'page unavailable' };
  }
  try {
    const result = await page.evaluate(async () => {
      if (typeof navigator.getBattery !== 'function') {
        return { status: 'unsupported', supported: false, reason: 'navigator.getBattery unavailable' };
      }
      let timeoutId = null;
      try {
        const battery = await Promise.race([
          navigator.getBattery(),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('navigator.getBattery timed out')), 1_000);
          }),
        ]);
        const finite = (value) => Number.isFinite(value) ? value : null;
        return {
          status: 'supported',
          supported: true,
          charging: typeof battery.charging === 'boolean' ? battery.charging : null,
          level: finite(battery.level),
          chargingTime: finite(battery.chargingTime),
          dischargingTime: finite(battery.dischargingTime),
        };
      } catch (error) {
        return { status: 'error', supported: null, error: String(error?.message || error || 'battery read failed').slice(0, 500) };
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
      }
    });
    return { ...unknown, ...(result && typeof result === 'object' ? result : { status: 'error', error: 'invalid battery result' }) };
  } catch (error) {
    return { ...unknown, status: 'error', error: errorText(error) };
  }
}
