export async function finalizeVisualProbeResources({
  browser = null,
  server = null,
  primaryError = null,
  logError = console.error,
} = {}) {
  const cleanupFailures = [];
  await attemptClose('browser', browser, cleanupFailures);
  await attemptClose('server', server, cleanupFailures);

  for (const failure of cleanupFailures) {
    logError(`[ship-stability] ${failure.resource} cleanup failed: ${formatError(failure.error)}`);
  }

  if (primaryError !== null) throw primaryError;
  if (cleanupFailures.length) {
    throw new AggregateError(
      cleanupFailures.map((failure) => failure.error),
      'visual probe resource cleanup failed',
    );
  }
}

async function attemptClose(resourceName, resource, failures) {
  if (!resource || typeof resource.close !== 'function') return;
  try {
    await resource.close();
  } catch (error) {
    failures.push({ resource: resourceName, error });
  }
}

function formatError(error) {
  return error && error.message ? error.message : String(error);
}
