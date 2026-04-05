import type { Tile } from '../types';

const DB_NAME = 'TilesDB';
const STORE_NAME = 'tiles';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

let openDBPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (openDBPromise) return openDBPromise;

  openDBPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      openDBPromise = null;
      reject(new Error('IndexedDB open timed out'));
    }, 8000);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'H3ID' });
        store.createIndex('TileName', 'TileName', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      clearTimeout(timer);
      dbInstance = (e.target as IDBOpenDBRequest).result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
        openDBPromise = null;
      };
      resolve(dbInstance);
    };

    req.onerror = () => {
      clearTimeout(timer);
      openDBPromise = null;
      reject(req.error);
    };

    req.onblocked = () => {
      clearTimeout(timer);
      openDBPromise = null;
      reject(new Error('IndexedDB open blocked by another tab'));
    };
  });

  return openDBPromise;
}

export async function upsertTiles(tiles: Tile[]): Promise<void> {
  if (tiles.length === 0) return;

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    for (const tile of tiles) {
      store.put(tile);
    }
  });
}

export async function getAllTiles(): Promise<Tile[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as Tile[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getTileCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllTiles(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getTilesInViewport(
  north: number,
  south: number,
  east: number,
  west: number,
  limit = 5000
): Promise<Tile[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const all = req.result as Tile[];
      const filtered = all
        .filter((t) => {
          const [lng, lat] = t.TileCenterLongLat;
          return lat >= south && lat <= north && lng >= west && lng <= east;
        })
        .sort((a, b) => {
          const pa = a.TileFeatures.hasRoads ? 2 : a.TileFeatures.hasBuildings ? 1 : 0;
          const pb = b.TileFeatures.hasRoads ? 2 : b.TileFeatures.hasBuildings ? 1 : 0;
          return pb - pa;
        })
        .slice(0, limit);
      resolve(filtered);
    };

    req.onerror = () => reject(req.error);
  });
}
