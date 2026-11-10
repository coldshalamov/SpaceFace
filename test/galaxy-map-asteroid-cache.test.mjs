import assert from 'node:assert/strict';
import test from 'node:test';

const {
  ASTEROID_GLYPH_CACHE_LIMIT,
  drawAsteroidMark,
  galaxyMapScreen,
} = await import('../src/ui/galaxyMap.js');

class FakePath2D {
  static instances = [];

  constructor() {
    this.commands = [];
    FakePath2D.instances.push(this);
  }

  moveTo(x, y) { this.commands.push(['M', x, y]); }
  lineTo(x, y) { this.commands.push(['L', x, y]); }
  closePath() { this.commands.push(['Z']); }
}

function createPathContext() {
  return {
    fills: [],
    strokes: [],
    translations: [],
    save() {},
    restore() {},
    translate(x, y) { this.translations.push([x, y]); },
    fill(path) { this.fills.push(path); },
    stroke(path) { this.strokes.push(path); },
  };
}

function createImmediateContext() {
  return {
    path: [],
    save() {},
    restore() {},
    beginPath() { this.path = []; },
    moveTo(x, y) { this.path.push(['M', x, y]); },
    lineTo(x, y) { this.path.push(['L', x, y]); },
    closePath() { this.path.push(['Z']); },
    fill() {},
    stroke() {},
  };
}

test('asteroid marks reuse bounded exact geometry and preserve the immediate fallback', () => {
  const previousPath2D = globalThis.Path2D;
  try {
    FakePath2D.instances = [];
    globalThis.Path2D = FakePath2D;

    const cachedContext = createPathContext();
    drawAsteroidMark(cachedContext, 10, 20, 'asteroid-cache-geometry');
    drawAsteroidMark(cachedContext, 100, 200, 'asteroid-cache-geometry');

    assert.equal(FakePath2D.instances.length, 1, 'same asteroid id builds one Path2D');
    assert.strictEqual(cachedContext.fills[0], cachedContext.fills[1],
      'same asteroid id reuses the exact path object');
    assert.strictEqual(cachedContext.strokes[0], cachedContext.strokes[1],
      'fill and stroke share the cached geometry');
    assert.deepEqual(cachedContext.translations, [[10, 20], [100, 200]],
      'cached geometry is translated at each mark position');

    const firstPathCommands = FakePath2D.instances[0].commands;
    const countBeforeBoundedFill = FakePath2D.instances.length;
    for (let i = 0; i < ASTEROID_GLYPH_CACHE_LIMIT; i += 1) {
      drawAsteroidMark(createPathContext(), 0, 0, `asteroid-cache-${i}`);
    }
    assert.equal(FakePath2D.instances.length, countBeforeBoundedFill + ASTEROID_GLYPH_CACHE_LIMIT,
      'each new id builds one path until the bounded cache is filled');

    // The first inserted id is evicted when the cap is exceeded, proving the cache cannot retain an
    // unbounded contact stream and that eviction never changes the seeded shape.
    drawAsteroidMark(createPathContext(), 0, 0, 'asteroid-cache-overflow');
    const countAfterOverflow = FakePath2D.instances.length;
    drawAsteroidMark(createPathContext(), 0, 0, 'asteroid-cache-0');
    assert.equal(FakePath2D.instances.length, countAfterOverflow + 1,
      'an evicted id is rebuilt after the fixed cache cap is reached');

    globalThis.Path2D = undefined;
    const immediateContext = createImmediateContext();
    drawAsteroidMark(immediateContext, 10, 20, 'asteroid-cache-geometry');
    const translatedPath = firstPathCommands.map((command) => command[0] === 'Z'
      ? command
      : [command[0], command[1] + 10, command[2] + 20]);
    assert.deepEqual(immediateContext.path, translatedPath,
      'without Path2D the original seeded polygon geometry is preserved exactly');
  } finally {
    if (previousPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previousPath2D;
  }
});

test('galaxy map panel refresh consumes one invalidation and then sleeps', () => {
  const originalPending = galaxyMapScreen._domRefreshPending;
  const originalRail = galaxyMapScreen._updateRailSections;
  const originalWeather = galaxyMapScreen._updateHeaderWeather;
  const originalCargo = galaxyMapScreen._updateCargoDeck;
  const calls = [];
  try {
    galaxyMapScreen._updateRailSections = () => calls.push('rail');
    galaxyMapScreen._updateHeaderWeather = () => calls.push('weather');
    galaxyMapScreen._updateCargoDeck = () => calls.push('cargo');

    galaxyMapScreen._domRefreshPending = false;
    galaxyMapScreen._refreshDomPanels({});
    assert.deepEqual(calls, [], 'canvas-only animation does not rebuild deferred panels');

    galaxyMapScreen._domRefreshPending = true;
    galaxyMapScreen._refreshDomPanels({});
    assert.deepEqual(calls, ['rail', 'weather', 'cargo'],
      'one invalidation refreshes each deferred panel once');
    assert.equal(galaxyMapScreen._domRefreshPending, false,
      'the panel invalidation is consumed after a successful refresh');

    galaxyMapScreen._refreshDomPanels({});
    assert.deepEqual(calls, ['rail', 'weather', 'cargo'],
      'a sleeping chart does not repeat panel work without another invalidation');
  } finally {
    galaxyMapScreen._domRefreshPending = originalPending;
    galaxyMapScreen._updateRailSections = originalRail;
    galaxyMapScreen._updateHeaderWeather = originalWeather;
    galaxyMapScreen._updateCargoDeck = originalCargo;
  }
});
