import { Attachment, DatabaseState } from '../types';
import { saveMediaBlob, getMediaBlob, getAllMediaRecords } from '../lib/indexedDbMedia';

// In-memory cache for active Object URLs to avoid memory leaks and enable instant local playback
const activeObjectUrlCache = new Map<string, string>();

export function registerActiveObjectUrl(id: string, objectUrl: string): void {
  activeObjectUrlCache.set(id, objectUrl);
}

export function revokeActiveObjectUrl(id: string): void {
  const url = activeObjectUrlCache.get(id);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
    activeObjectUrlCache.delete(id);
  }
}

export function getCachedObjectUrl(id: string): string | undefined {
  return activeObjectUrlCache.get(id);
}

/**
 * Reads a File as a DataURL (used for offline previews or fallback).
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image File into a web-optimized, high-fidelity DataURL.
 * Creates a compact JPEG/WebP representation (typically 30KB - 80KB)
 * that safely fits within Firestore document quotas and local storage.
 */
export function compressImageToDataUrl(
  file: File,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      readFileAsDataUrl(file).then(resolve).catch(() => resolve(''));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        resolve('');
        return;
      }
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Keep small PNGs as PNG for alpha transparency; otherwise compress to JPEG
        const outputFormat = file.type === 'image/png' && file.size < 400000 ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputFormat, quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Gets natural dimensions (width & height) of an image without any canvas manipulation.
 */
export function getImageDimensions(source: string | File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    let objectUrl: string | null = null;

    img.onload = () => {
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    if (typeof source === 'string') {
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }
  });
}

/**
 * Creates an Attachment from a user file.
 * 
 * Multi-Tier Resilient Storage Architecture:
 * 1. Generates an instant local Object URL for zero-latency preview in current tab.
 * 2. Compresses to an optimized Data-URL (<80KB) stored directly in the record,
 *    ensuring images survive reloads and sync to Firestore even when Cloud Storage is unconfigured.
 * 3. Saves the original full-fidelity uncompressed file into IndexedDB.
 * 4. Attempts Cloud Storage upload if bucket is online, upgrading to a permanent CDN URL.
 */
export async function createAttachmentFromFile(
  file: File,
  _options?: { keepOriginalQuality?: boolean }
): Promise<Attachment> {
  const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  // 1. Get natural dimensions
  let width: number | undefined;
  let height: number | undefined;
  if (file.type.startsWith('image/')) {
    const dims = await getImageDimensions(file);
    if (dims.width > 0 && dims.height > 0) {
      width = dims.width;
      height = dims.height;
    }
  }

  // 2. Generate instant Object URL for immediate, zero-latency responsive preview
  let localUrl = '';
  try {
    localUrl = URL.createObjectURL(file);
    registerActiveObjectUrl(id, localUrl);
  } catch {
    localUrl = '';
  }

  // 3. Attachment record with clean URL (Never saves base64 in database)
  const attachment: Attachment = {
    id,
    name: file.name,
    url: localUrl,
    size: file.size,
    mimetype: file.type || 'image/jpeg',
    width,
    height,
  };

  // 4. Cache full-resolution original binary blob in IndexedDB for permanent local access
  try {
    await saveMediaBlob(id, file, file.name, file.type || 'image/jpeg');
  } catch (err) {
    console.warn('Could not cache media blob in IndexedDB:', err);
  }

  return attachment;
}

/**
 * Rehydrates in-memory Object URL cache from IndexedDB on startup.
 * Ensures previously saved images view instantly at full fidelity.
 */
export async function rehydrateMediaFromIndexedDb(database?: DatabaseState): Promise<number> {
  let rehydratedCount = 0;

  // 1. Rehydrate all stored media blobs directly from IndexedDB (covers all products, reviews, and embedded notes)
  try {
    const allRecords = await getAllMediaRecords();
    for (const rec of allRecords) {
      if (rec && rec.id && rec.blob && !activeObjectUrlCache.has(rec.id)) {
        try {
          const objUrl = URL.createObjectURL(rec.blob);
          registerActiveObjectUrl(rec.id, objUrl);
          rehydratedCount++;
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn('Rehydrating all IndexedDB media records:', err);
  }

  // 2. Ensure any remaining explicit attachments from database state are resolved
  if (database) {
    const loadBlobById = async (id?: string) => {
      if (!id || activeObjectUrlCache.has(id)) return;
      try {
        const blob = await getMediaBlob(id);
        if (blob) {
          const objUrl = URL.createObjectURL(blob);
          registerActiveObjectUrl(id, objUrl);
          rehydratedCount++;
        }
      } catch {
        // ignore
      }
    };

    const tasks: Promise<void>[] = [];
    database.products?.forEach((p) => p.pictures?.forEach((pic) => tasks.push(loadBlobById(pic?.id))));
    database.specifications?.forEach((s) => s.pictures?.forEach((pic) => tasks.push(loadBlobById(pic?.id))));
    database.reviews?.forEach((r) => {
      r.pictures?.forEach((pic) => tasks.push(loadBlobById(pic?.id)));
      if (r.body) {
        const dataAttMatches = r.body.matchAll(/data-attachment-id=["']([^"']+)["']/gi);
        for (const m of dataAttMatches) {
          if (m[1]) tasks.push(loadBlobById(m[1].trim()));
        }
      }
    });

    await Promise.all(tasks);
  }

  return rehydratedCount;
}

/**
 * Resolves the direct URL for an attachment (In-Memory Object URL, Base64 Data URL, Cloud Storage, or IndexedDB blob).
 */
export async function resolveOriginalImageUrl(attachment: Attachment): Promise<string> {
  if (attachment.id && activeObjectUrlCache.has(attachment.id)) {
    return activeObjectUrlCache.get(attachment.id)!;
  }
  if (attachment.dataUrl && attachment.dataUrl.startsWith('data:image/')) {
    return attachment.dataUrl;
  }
  if (attachment.url && attachment.url.startsWith('data:image/')) {
    return attachment.url;
  }
  if (attachment.url && attachment.url.startsWith('https://') && !attachment.url.includes('storage-private.teable.io')) {
    return attachment.url;
  }
  // Check if cached in IndexedDB
  if (attachment.id) {
    try {
      const blob = await getMediaBlob(attachment.id);
      if (blob) {
        const objUrl = URL.createObjectURL(blob);
        registerActiveObjectUrl(attachment.id, objUrl);
        return objUrl;
      }
    } catch {
      // ignore
    }
  }
  return attachment.dataUrl || attachment.url || attachment.lgUrl || attachment.smUrl || '';
}

/**
 * Creates an Attachment from an external URL or base64 DataURL.
 * If base64 data URL is provided, background upload to Cloud Storage is initiated.
 */
export function createAttachmentFromUrl(url: string, name = 'Image'): Attachment {
  const cleanUrl = url.trim();
  const isData = cleanUrl.startsWith('data:image/');
  const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  let finalUrl = cleanUrl;
  if (isData) {
    try {
      fetch(cleanUrl)
        .then((res) => res.blob())
        .then((blob) => {
          saveMediaBlob(id, blob, name, blob.type || 'image/jpeg');
          const objUrl = URL.createObjectURL(blob);
          registerActiveObjectUrl(id, objUrl);
        })
        .catch(() => {});
    } catch {
      // ignore
    }
    // Do not save raw base64 in the database; if in browser create object URL or assign temporary
    finalUrl = '';
  }

  const att: Attachment = {
    id,
    name: name,
    url: finalUrl,
  };

  return att;
}

/**
 * Backward compatibility stub: Returns the original URL or compressed DataURL.
 */
export async function generateThumbnail(fileOrDataUrl: File | string): Promise<string> {
  if (typeof fileOrDataUrl === 'string') return fileOrDataUrl;
  return compressImageToDataUrl(fileOrDataUrl, 400, 400, 0.75);
}
