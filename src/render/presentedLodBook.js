// Entity-scoped LOD swap timestamps.
//
// Each family root owns a resolver. adopt() copies that resolver's book, which
// stays empty when resolve() records into this shared array, and a fresh
// resolver's first commit used to be free. One array per entity id is the cap
// the player sees: at most LOD_SWAP_CAP level changes per window, including
// the first commit and any root rebind.

const books = new Map();
const MAX_BOOKS = 4096;

export function presentedLodBook(entityId) {
  const key = String(entityId);
  let book = books.get(key);
  if (book) {
    books.delete(key);
    books.set(key, book);
    return book;
  }
  if (books.size >= MAX_BOOKS) {
    const oldest = books.keys().next().value;
    books.delete(oldest);
  }
  book = [];
  books.set(key, book);
  return book;
}

export function resetPresentedLodBooks() {
  books.clear();
}
