const root = new URL('./', import.meta.url);
export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  if (resolved.url === new URL('../latch-nine-route-integration/src/core/dockIntent.js', root).href)
    return { ...resolved, url: new URL('src/core/dockIntent.js', root).href };
  return resolved;
}
