// Retained index into the existing particle pool. Lowest priority, then oldest serial,
// then active-list position matches the original linear replacement scan exactly.
export function createParticlePriorityIndex(capacity, priorities, serials, activePositions) {
  const heap = new Int32Array(capacity);
  const positions = new Int32Array(capacity);
  positions.fill(-1);
  let count = 0;
  const less = (a, b) => priorities[a] < priorities[b]
    || (priorities[a] === priorities[b] && (serials[a] < serials[b]
      || (serials[a] === serials[b] && activePositions[a] < activePositions[b])));
  function swap(a, b) {
    const slot = heap[a]; heap[a] = heap[b]; heap[b] = slot;
    positions[heap[a]] = a; positions[heap[b]] = b;
  }
  function up(at) {
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!less(heap[at], heap[parent])) break;
      swap(at, parent); at = parent;
    }
    return at;
  }
  function down(at) {
    for (;;) {
      const left = at * 2 + 1;
      if (left >= count) return;
      const right = left + 1;
      const child = right < count && less(heap[right], heap[left]) ? right : left;
      if (!less(heap[child], heap[at])) return;
      swap(at, child); at = child;
    }
  }
  function changed(slot) {
    const at = positions[slot];
    if (at >= 0) down(up(at));
  }
  return {
    peek() { return count ? heap[0] : -1; },
    add(slot) {
      if (positions[slot] >= 0) { changed(slot); return; }
      positions[slot] = count; heap[count++] = slot; up(count - 1);
    },
    remove(slot) {
      const at = positions[slot];
      if (at < 0) return;
      positions[slot] = -1;
      const tail = heap[--count];
      if (at < count) { heap[at] = tail; positions[tail] = at; down(up(at)); }
    },
    changed,
  };
}
