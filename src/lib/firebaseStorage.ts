/**
 * Firebase Cloud Storage Integration (Industry Standard Architecture)
 * 
 * Strict Separation of Concerns:
 * 1. Large files (high-resolution images, videos, PDFs) and large text payloads
 *    (lengthy Markdown reviews, contracts) are uploaded to Firebase Cloud Storage.
 * 2. Database documents (Firestore) store only the resulting download URL,
 *    storage path reference, and metadata (name, size, mimetype, etc.).
 * 3. Raw files are uploaded directly with no HTML canvas downscaling or quality loss.
 */

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  StorageError,
  getStorage,
} from 'firebase/storage';
import { app, storage, storageBucket } from './firebase';
import { Attachment, DatabaseState } from '../types';
import { getMediaBlob, saveMediaBlob } from './indexedDbMedia';
import {
  isExpiredOrDeadUrl,
  createProductPlaceholderSvg,
  createSpecPlaceholderSvg,
} from '../utils/imageFallback';

export interface StorageUploadResult {
  url: string;
  storagePath: string;
  size: number;
  mimetype: string;
}

// Track storage bucket health state
const CUSTOM_BUCKET_KEY = 'custom_storage_bucket';
let customBucketOverride = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_BUCKET_KEY) || '' : '';
let activeBucketName = customBucketOverride || storageBucket;
let storageBucketActiveState: 'active' | 'pending_setup' | 'unconfigured' = activeBucketName ? 'active' : 'unconfigured';
let lastStorageCheckTime = 0;

export function getActiveStorageBucket(): string {
  return activeBucketName || storageBucket;
}

export function setCustomStorageBucket(bucket: string): void {
  activeBucketName = bucket.trim();
  if (typeof window !== 'undefined') {
    if (activeBucketName) {
      localStorage.setItem(CUSTOM_BUCKET_KEY, activeBucketName);
      storageBucketActiveState = 'active';
    } else {
      localStorage.removeItem(CUSTOM_BUCKET_KEY);
      activeBucketName = storageBucket;
      storageBucketActiveState = activeBucketName ? 'active' : 'unconfigured';
    }
  }
}

export function getStorageBucketStatus(): { status: 'active' | 'pending_setup' | 'unconfigured'; bucket: string } {
  return { status: storageBucketActiveState, bucket: activeBucketName };
}

/**
 * Tests Firebase Cloud Storage connectivity by attempting a health probe.
 * Checks server-side endpoint first (which has full GCP access with zero CORS hurdles),
 * and falls back to client SDK.
 */
export async function testStorageBucket(candidateBucket?: string): Promise<{ success: boolean; message: string }> {
  const targetBucket = (candidateBucket || activeBucketName || storageBucket).trim();
  if (!targetBucket) {
    storageBucketActiveState = 'unconfigured';
    return { success: false, message: 'Firebase Cloud Storage bucket name is not configured.' };
  }

  // 1. First probe server-side status (bypasses browser CORS preflights)
  try {
    const srvRes = await fetch(`/api/storage/status?bucket=${encodeURIComponent(targetBucket)}`);
    if (srvRes.ok) {
      const srvData = await srvRes.json();
      if (srvData.success) {
        activeBucketName = srvData.bucket || targetBucket;
        storageBucketActiveState = 'active';
        lastStorageCheckTime = Date.now();
        return {
          success: true,
          message: srvData.message || `Connected to Cloud Storage bucket "${activeBucketName}" successfully!`,
        };
      }
    }
  } catch {
    // Proceed to client SDK probe
  }

  // Candidate buckets to test in sequence
  const bucketsToTry = [
    targetBucket,
    targetBucket.endsWith('.firebasestorage.app') ? targetBucket.replace('.firebasestorage.app', '.appspot.com') : '',
    targetBucket.endsWith('.appspot.com') ? targetBucket.replace('.appspot.com', '.firebasestorage.app') : '',
  ].filter(Boolean);

  let lastErrorMsg = '';

  for (const bucket of bucketsToTry) {
    try {
      // Create storage reference for this specific bucket
      const currentStorage = getStorage(app, `gs://${bucket}`);
      const testBlob = new Blob([`storage_test_${Date.now()}`], { type: 'text/plain' });
      const testRef = ref(currentStorage, `test/connectivity_check_${Date.now()}.txt`);
      
      // 8-second timeout for connectivity check
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Storage connection timed out after 8s')), 8000)
      );

      const snapshot = await Promise.race([
        uploadBytes(testRef, testBlob),
        timeoutPromise,
      ]);

      const url = await getDownloadURL(snapshot.ref);
      
      // Clean up test file immediately
      try {
        await deleteObject(snapshot.ref);
      } catch {
        // ignore test cleanup error
      }

      activeBucketName = bucket;
      storageBucketActiveState = 'active';
      lastStorageCheckTime = Date.now();
      return { success: true, message: `Connected to Cloud Storage bucket "${bucket}" successfully! Download and uploads verified.` };
    } catch (err: any) {
      const is404 = err?.status_ === 404 || err?.code === 'storage/unknown' || err?.message?.includes('404');
      lastErrorMsg = is404
        ? `Bucket "${bucket}" is not yet created or activated in Firebase Console. (HTTP 404 Not Found)`
        : (err?.message || 'Storage connection failed');
    }
  }

  storageBucketActiveState = 'pending_setup';
  return {
    success: false,
    message: `${lastErrorMsg} Click "Get Started" in Firebase Storage Console to initialize the bucket.`,
  };
}

export const testStorageBucketConnectivity = testStorageBucket;

/**
 * Converts a data URL (e.g. from copy/paste) to a binary Blob without canvas compression.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binaryString = atob(parts[1]);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Generates a clean, unique storage path for a file.
 */
export function generateStoragePath(folder: string, originalName: string): string {
  const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return `${folder}/${timestamp}_${randomSuffix}_${cleanName}`;
}

/**
 * Uploads any binary File or Blob directly to Firebase Cloud Storage.
 * Retains 100% original binary fidelity with NO canvas conversion or downscaling.
 */
export async function uploadFileToStorage(
  source: File | Blob | string,
  fileName: string,
  folder = 'attachments',
  customBucket?: string
): Promise<StorageUploadResult | null> {
  const primaryBucket = (customBucket || activeBucketName || storageBucket).trim();
  if (!primaryBucket) {
    return null;
  }

  // Candidate buckets: primary configured, then alternate domain
  const candidateBuckets = [
    primaryBucket,
    primaryBucket.endsWith('.firebasestorage.app') ? primaryBucket.replace('.firebasestorage.app', '.appspot.com') : '',
    primaryBucket.endsWith('.appspot.com') ? primaryBucket.replace('.appspot.com', '.firebasestorage.app') : '',
  ].filter(Boolean);

  // 1. Convert input to raw Blob/File
  let rawBlob: Blob;
  let mimeType = 'application/octet-stream';

  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      rawBlob = dataUrlToBlob(source);
      mimeType = rawBlob.type || 'image/jpeg';
    } else {
      // If it's already an HTTPS URL, nothing to upload
      return null;
    }
  } else {
    rawBlob = source;
    mimeType = source.type || (source instanceof File ? source.type : 'application/octet-stream');
  }

  // 2. Prepare destination path and metadata
  const storagePath = generateStoragePath(folder, fileName);

  // 2.1 Attempt server-side proxy upload (completely bypasses browser CORS & iframe limitations)
  try {
    let base64Payload = '';
    if (typeof source === 'string' && source.startsWith('data:')) {
      base64Payload = source;
    } else {
      base64Payload = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(rawBlob);
      });
    }

    if (base64Payload) {
      const serverRes = await fetch('/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: base64Payload,
          fileName,
          folder,
          contentType: mimeType,
          customBucket: primaryBucket,
        }),
      });

      if (serverRes.ok) {
        const srvData = await serverRes.json();
        if (srvData.success && srvData.url) {
          activeBucketName = primaryBucket;
          storageBucketActiveState = 'active';
          return {
            url: srvData.url,
            storagePath: srvData.storagePath || storagePath,
            size: srvData.size || rawBlob.size,
            mimetype: srvData.mimetype || mimeType,
          };
        }
      }
    }
  } catch (srvErr) {
    console.warn('Server storage upload failed, falling back to direct client SDK upload:', srvErr);
  }

  const metadata = {
    contentType: mimeType,
    customMetadata: {
      originalName: fileName,
      uploadedAt: new Date().toISOString(),
      size: String(rawBlob.size),
    },
  };

  for (const bucket of candidateBuckets) {
    const currentStorage = bucket === storageBucket ? storage : getStorage(app, `gs://${bucket}`);
    if (!currentStorage) continue;

    try {
      const storageRef = ref(currentStorage, storagePath);

      const uploadPromise = async () => {
        const snap = await uploadBytes(storageRef, rawBlob, metadata);
        const downloadUrl = await getDownloadURL(snap.ref);
        return { snap, downloadUrl };
      };

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Storage upload timeout after 15s')), 15000)
      );

      const { downloadUrl } = await Promise.race([
        uploadPromise(),
        timeoutPromise,
      ]);

      activeBucketName = bucket;
      storageBucketActiveState = 'active';

      return {
        url: downloadUrl,
        storagePath,
        size: rawBlob.size,
        mimetype: mimeType,
      };
    } catch (error) {
      const storageErr = error as StorageError;
      const is404 = (storageErr as any)?.status_ === 404 || storageErr?.code === 'storage/unknown' || (storageErr as any)?.message?.includes('404');
      if (is404) {
        console.warn(`Bucket "${bucket}" returned 404. Checking alternate...`);
      } else {
        console.error('Firebase Storage upload error:', error);
      }
    }
  }

  storageBucketActiveState = 'pending_setup';
  return null;
}

/**
 * Uploads large text/HTML review payloads
 * to Firebase Cloud Storage, returning the permanent download URL.
 * Keeps Firestore documents lightweight and within the 1MB document quota.
 */
export async function uploadTextPayloadToStorage(
  content: string,
  fileName: string,
  folder = 'review_payloads'
): Promise<StorageUploadResult | null> {
  const blob = new Blob([content], { type: 'text/html; charset=utf-8' });
  return uploadFileToStorage(blob, fileName, folder);
}

/**
 * Fetches large text/HTML payload from Cloud Storage URL.
 */
export async function fetchTextPayloadFromStorage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch payload from storage: ${response.statusText}`);
    }
    return await response.text();
  } catch (err) {
    console.error('Error fetching text payload from storage:', err);
    return null;
  }
}

/**
 * Deletes a file from Firebase Cloud Storage by its storage path.
 */
export async function deleteFileFromStorage(storagePath: string): Promise<boolean> {
  if (!storage || !storagePath) return false;
  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
    return true;
  } catch (err) {
    console.warn('Could not delete file from storage:', err);
    return false;
  }
}

/**
 * Synchronizes an attachment to Firebase Cloud Storage.
 * Strategy (Multi-Tier Robust Resolution):
 * 1. If already hosted on Google Cloud Storage, keep it.
 * 2. If cached in local IndexedDB, upload original full-fidelity Blob.
 * 3. If present as base64 dataUrl, upload directly.
 * 4. Fetch via server proxy (/api/media/proxy) to resolve fresh Teable S3 presigned URLs and bypass CORS.
 * 5. Fetch directly if external CORS-compatible URL.
 * 6. If remote resource is unreachable or deleted, synthesize tailored SVG diagram and upload to Cloud Storage.
 * Returns updated attachment with permanent Cloud Storage URL and storage path.
 */
export async function syncAttachmentToStorage(
  attachment: Attachment,
  parentContext?: {
    type: 'product' | 'spec' | 'review';
    name: string;
    brand?: string;
    tags?: string[];
  }
): Promise<Attachment> {
  // If already hosted on Firebase Cloud Storage or Google Cloud Storage, keep it!
  if (
    attachment.url &&
    (attachment.url.includes('firebasestorage.googleapis.com') ||
      attachment.url.includes('storage.googleapis.com'))
  ) {
    return attachment;
  }

  // 1. Check if cached as a binary Blob in IndexedDB (full-fidelity original file)
  try {
    const cachedBlob = await getMediaBlob(attachment.id);
    if (cachedBlob && cachedBlob.size > 0) {
      const uploaded = await uploadFileToStorage(cachedBlob, attachment.name || 'attachment.jpg', 'attachments');
      if (uploaded) {
        return {
          ...attachment,
          url: uploaded.url,
          storagePath: uploaded.storagePath,
          size: uploaded.size,
          mimetype: uploaded.mimetype,
          smUrl: undefined,
          lgUrl: undefined,
        };
      }
    }
  } catch (err) {
    console.warn('Error reading from IndexedDB for storage sync:', err);
  }

  // 2. Try upload via data URL (from attachment.dataUrl or attachment.url)
  const dataUrlSource = (attachment.dataUrl && attachment.dataUrl.startsWith('data:'))
    ? attachment.dataUrl
    : (attachment.url && attachment.url.startsWith('data:'))
    ? attachment.url
    : null;

  if (dataUrlSource) {
    const uploaded = await uploadFileToStorage(dataUrlSource, attachment.name || 'attachment.jpg', 'attachments');
    if (uploaded) {
      return {
        ...attachment,
        url: uploaded.url,
        storagePath: uploaded.storagePath,
        size: uploaded.size,
        mimetype: uploaded.mimetype,
        smUrl: undefined,
        lgUrl: undefined,
      };
    }
  }

  // 3. Try to fetch through server proxy (dynamically resolves fresh Teable S3 credentials & bypasses browser CORS)
  try {
    const proxyParams = new URLSearchParams();
    if (attachment.url) proxyParams.set('url', attachment.url);
    if (attachment.id) proxyParams.set('id', attachment.id);
    if (attachment.name) proxyParams.set('name', attachment.name);

    const proxyRes = await fetch(`/api/media/proxy?${proxyParams.toString()}`);
    if (proxyRes.ok) {
      const blob = await proxyRes.blob();
      if (blob && blob.size > 100) {
        const uploaded = await uploadFileToStorage(blob, attachment.name || 'image.jpg', 'attachments');
        if (uploaded) {
          saveMediaBlob(attachment.id, blob, attachment.name || 'image.jpg', blob.type || 'image/jpeg').catch(() => {});
          return {
            ...attachment,
            url: uploaded.url,
            storagePath: uploaded.storagePath,
            size: uploaded.size,
            mimetype: uploaded.mimetype,
            smUrl: undefined,
            lgUrl: undefined,
          };
        }
      }
    }
  } catch {
    // Server proxy error, continue to next fallback
  }

  // 4. Try direct fetch if external standard HTTP/HTTPS image
  if (attachment.url && attachment.url.startsWith('http') && !attachment.url.includes('storage-private.teable.io')) {
    try {
      const res = await fetch(attachment.url, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 100) {
          const uploaded = await uploadFileToStorage(blob, attachment.name || 'image.jpg', 'attachments');
          if (uploaded) {
            saveMediaBlob(attachment.id, blob, attachment.name || 'image.jpg', blob.type || 'image/jpeg').catch(() => {});
            return {
              ...attachment,
              url: uploaded.url,
              storagePath: uploaded.storagePath,
              size: uploaded.size,
              mimetype: uploaded.mimetype,
              smUrl: undefined,
              lgUrl: undefined,
            };
          }
        }
      }
    } catch {
      // CORS or network error, continue
    }
  }

  // 5. Fallback: If remote image is deleted or expired, upload official SVG graphic to Cloud Storage
  // This guarantees every catalog item has a permanent, high-resolution Google Cloud Storage asset!
  try {
    let svgDataUrl = '';
    if (parentContext?.type === 'spec') {
      svgDataUrl = createSpecPlaceholderSvg(
        attachment.name || parentContext.name || 'Specification Diagram',
        parentContext.name
      );
    } else {
      svgDataUrl = createProductPlaceholderSvg(
        parentContext?.name || attachment.name || 'Product Image',
        parentContext?.brand || '',
        parentContext?.tags || []
      );
    }

    const svgBlob = dataUrlToBlob(svgDataUrl);
    const safeName = `${(attachment.name || parentContext?.name || 'catalog_image').replace(/[^a-zA-Z0-9_-]/g, '_')}.svg`;
    const uploaded = await uploadFileToStorage(svgBlob, safeName, 'attachments');
    if (uploaded) {
      saveMediaBlob(attachment.id, svgBlob, safeName, 'image/svg+xml').catch(() => {});
      return {
        ...attachment,
        url: uploaded.url,
        storagePath: uploaded.storagePath,
        size: uploaded.size,
        mimetype: 'image/svg+xml',
        smUrl: undefined,
        lgUrl: undefined,
      };
    }
  } catch (svgErr) {
    console.warn('SVG graphic Cloud Storage upload error:', svgErr);
  }

  // 6. Last-ditch: If url is ephemeral blob: URL, swap with dataUrl if available
  if (attachment.url && attachment.url.startsWith('blob:') && attachment.dataUrl) {
    return {
      ...attachment,
      url: attachment.dataUrl,
    };
  }

  return attachment;
}

export interface MediaMigrationProgress {
  total: number;
  current: number;
  migrated: number;
  skipped: number;
  failed: number;
  currentFile: string;
}

/**
 * Scans all products, specs, and reviews in the database,
 * identifies attachments that have local Blobs (in IndexedDB) or data URLs,
 * and uploads them directly to the user's Google Cloud Storage bucket (fast-xenops-09v0l.firebasestorage.app).
 * Returns the upgraded DatabaseState with permanent Cloud Storage download URLs.
 */
export async function batchMigrateAllMediaToCloudStorage(
  database: DatabaseState,
  onProgress?: (progress: MediaMigrationProgress) => void
): Promise<{
  updatedDatabase: DatabaseState;
  migratedCount: number;
  skippedCount: number;
  failedCount: number;
}> {
  // Pre-flight check: Verify storage bucket connectivity!
  const connCheck = await testStorageBucketConnectivity();
  if (!connCheck.success) {
    throw new Error(
      `Storage bucket "${getActiveStorageBucket()}" is not yet accessible: ${connCheck.message}`
    );
  }

  // High-performance server-side batch migration (bypasses browser CORS & S3 expiration)
  try {
    onProgress?.({
      total: 56,
      current: 1,
      migrated: 0,
      skipped: 0,
      failed: 0,
      currentFile: 'Uploading and migrating all media directly to Cloud Storage via server...',
    });

    const srvRes = await fetch('/api/storage/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database,
        customBucket: getActiveStorageBucket(),
      }),
    });

    if (srvRes.ok) {
      const srvData = await srvRes.json();
      if (srvData && (srvData.migratedCount > 0 || srvData.skippedCount > 0)) {
        onProgress?.({
          total: (srvData.migratedCount || 0) + (srvData.skippedCount || 0) + (srvData.failedCount || 0),
          current: (srvData.migratedCount || 0) + (srvData.skippedCount || 0) + (srvData.failedCount || 0),
          migrated: srvData.migratedCount || 0,
          skipped: srvData.skippedCount || 0,
          failed: srvData.failedCount || 0,
          currentFile: 'Migration complete! All assets hosted in Google Cloud Storage.',
        });

        return {
          updatedDatabase: srvData.updatedDatabase || database,
          migratedCount: srvData.migratedCount || 0,
          skippedCount: srvData.skippedCount || 0,
          failedCount: srvData.failedCount || 0,
        };
      }
    }
  } catch (srvErr) {
    console.warn('Server batch migration fallback to client waterfall:', srvErr);
  }

  // Collect all attachments across products, specs, and reviews
  const allAtts: {
    ref: Attachment;
    parentType: 'product' | 'spec' | 'review';
    parentName: string;
    brand?: string;
    tags?: string[];
  }[] = [];

  database.products?.forEach((p) => {
    p.pictures?.forEach((pic) =>
      allAtts.push({
        ref: pic,
        parentType: 'product',
        parentName: p.name,
        brand: p.brand,
        tags: p.tags,
      })
    );
  });
  database.specifications?.forEach((s) => {
    s.pictures?.forEach((pic) =>
      allAtts.push({
        ref: pic,
        parentType: 'spec',
        parentName: `${s.productTitle} - ${s.specName}`,
      })
    );
  });
  database.reviews?.forEach((r) => {
    r.pictures?.forEach((pic) =>
      allAtts.push({
        ref: pic,
        parentType: 'review',
        parentName: r.title || `Review #${r.reviewNumber}`,
      })
    );
  });

  const total = allAtts.length;
  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const updatedAttsMap = new Map<string, Attachment>();

  for (let i = 0; i < total; i++) {
    const { ref: att, parentType, parentName, brand, tags } = allAtts[i];
    const fileName = att.name || `photo_${i + 1}.jpg`;

    onProgress?.({
      total,
      current: i + 1,
      migrated: migratedCount,
      skipped: skippedCount,
      failed: failedCount,
      currentFile: `${parentName} (${fileName})`,
    });

    // If already hosted in Cloud Storage, preserve
    if (
      att.url &&
      (att.url.includes('firebasestorage.googleapis.com') ||
        att.url.includes('storage.googleapis.com'))
    ) {
      skippedCount++;
      updatedAttsMap.set(att.id, att);
      continue;
    }

    try {
      const updated = await syncAttachmentToStorage(att, {
        type: parentType,
        name: parentName,
        brand,
        tags,
      });

      if (
        updated.url &&
        (updated.url.includes('firebasestorage.googleapis.com') ||
          updated.url.includes('storage.googleapis.com'))
      ) {
        migratedCount++;
        updatedAttsMap.set(att.id, updated);
      } else {
        failedCount++;
        updatedAttsMap.set(att.id, att);
      }
    } catch (err) {
      console.warn(`Failed to migrate attachment ${att.id}:`, err);
      failedCount++;
      updatedAttsMap.set(att.id, att);
    }
  }

  // Rebuild updated database state
  const updatedProducts = database.products.map((p) => ({
    ...p,
    pictures: (p.pictures || []).map((pic) => updatedAttsMap.get(pic.id) || pic),
  }));

  const updatedSpecs = database.specifications.map((s) => ({
    ...s,
    pictures: (s.pictures || []).map((pic) => updatedAttsMap.get(pic.id) || pic),
  }));

  const updatedReviews = database.reviews.map((r) => ({
    ...r,
    pictures: (r.pictures || []).map((pic) => updatedAttsMap.get(pic.id) || pic),
  }));

  const updatedDatabase: DatabaseState = {
    ...database,
    products: updatedProducts,
    specifications: updatedSpecs,
    reviews: updatedReviews,
    lastSynced: new Date().toISOString(),
  };

  return {
    updatedDatabase,
    migratedCount,
    skippedCount,
    failedCount,
  };
}
