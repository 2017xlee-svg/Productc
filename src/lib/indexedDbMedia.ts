/**
 * High-capacity IndexedDB storage for local binary media blobs (photos, PDFs, documents).
 * 
 * Bypasses the strict 5MB localStorage limit in browsers (especially iOS Safari),
 * allowing high-resolution photos (5MB - 50MB+) to be safely cached on device
 * without quota errors or lossy canvas compression.
 */

const DB_NAME = 'ProductCompareMediaDB';
const DB_VERSION = 2;
const STORE_NAME = 'media_blobs';
const DOCS_STORE_NAME = 'app_state';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not supported in this environment'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(DOCS_STORE_NAME)) {
          db.createObjectStore(DOCS_STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  return dbPromise;
}

export interface CachedMediaRecord {
  id: string;
  blob: Blob;
  name: string;
  mimetype: string;
  updatedAt: string;
}

/**
 * Saves a binary Blob/File to IndexedDB.
 */
export async function saveMediaBlob(
  id: string,
  blob: Blob,
  name: string,
  mimetype: string
): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const record: CachedMediaRecord = {
        id,
        blob,
        name,
        mimetype,
        updatedAt: new Date().toISOString(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to cache media blob in IndexedDB:', err);
  }
}

/**
 * Retrieves a binary Blob from IndexedDB by attachment ID.
 */
export async function getMediaBlob(id: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as CachedMediaRecord | undefined;
        resolve(record ? record.blob : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to retrieve media blob from IndexedDB:', err);
    return null;
  }
}

/**
 * Creates an in-memory object URL from IndexedDB cache if available.
 */
export async function getMediaObjectUrl(id: string): Promise<string | null> {
  const blob = await getMediaBlob(id);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  return null;
}

/**
 * Deletes a media record from IndexedDB.
 */
export async function deleteMediaBlob(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to delete media blob from IndexedDB:', err);
  }
}

/**
 * Persists the entire database state directly into IndexedDB without 5MB limits.
 */
export async function saveDatabaseToIndexedDB<T>(data: T): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCS_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(DOCS_STORE_NAME);
      const req = store.put({ key: 'master_database', data, updatedAt: new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save database state to IndexedDB:', err);
  }
}

/**
 * Loads the database state directly from IndexedDB.
 */
export async function loadDatabaseFromIndexedDB<T>(): Promise<T | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DOCS_STORE_NAME, 'readonly');
      const store = transaction.objectStore(DOCS_STORE_NAME);
      const req = store.get('master_database');
      req.onsuccess = () => {
        const result = req.result;
        resolve(result ? (result.data as T) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load database state from IndexedDB:', err);
    return null;
  }
}

/**
 * Clears all cached media records from IndexedDB.
 */
export async function clearAllMediaBlobs(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to clear media records from IndexedDB:', err);
  }
}

/**
 * Retrieves all stored media records from IndexedDB for packaging into a full ZIP archive.
 */
export async function getAllMediaRecords(): Promise<CachedMediaRecord[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve((req.result as CachedMediaRecord[]) || []);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to retrieve all media records from IndexedDB:', err);
    return [];
  }
}
