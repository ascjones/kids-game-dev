import { openDB, type IDBPDatabase } from 'idb';

// KTD5: IndexedDB is the working store; the export file (exportImport.ts) is
// the durable copy, since browsers can evict IndexedDB.

const DB_NAME = 'kids-game-dev';
const DB_VERSION = 1;
export const PROJECT_STORE = 'projects';

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE);
      }
    },
  });
  return dbPromise;
}

/** Test hook: drop the cached connection so a fresh fake DB can take over. */
export function resetDbForTests(): void {
  dbPromise = null;
}
