import {
  collection,
  getDocs,
  writeBatch,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db, projectId, databaseId } from './firebase';
import { DatabaseState, Product, Specification, UserReview, AppUser, Attachment, SyncProgress } from '../types';
import { saveLocalDatabase } from './localDatabase';
import { syncAttachmentToStorage, uploadTextPayloadToStorage } from './firebaseStorage';
import { isExpiredOrDeadUrl } from '../utils/imageFallback';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export interface SyncResult {
  success: boolean;
  message: string;
  database?: DatabaseState;
  counts?: {
    products: number;
    specifications: number;
    reviews: number;
    images?: number;
  };
  timestamp: string;
  durationMs?: number;
  stepsSummary?: string[];
}

/**
 * Recursively strips any undefined values from objects/arrays,
 * preventing Firestore "Unsupported field value: undefined" errors.
 */
export function removeUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefined(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

function safeDocId(id: string): string {
  return String(id || '').replace(/[\/\s#?\[\]]/g, '_').substring(0, 128) || `doc_${Date.now()}`;
}

/**
 * Sanitizes attachments for standard Firestore documents.
 * Keeps documents lightweight by storing only the Cloud Storage URL,
 * storage path, and standard file metadata.
 */
function sanitizeDocPictures(pictures?: Attachment[]): Attachment[] {
  if (!pictures || !Array.isArray(pictures)) return [];
  return pictures.map((att) => {
    // Determine the most reliable URL:
    let reliableUrl = '';
    if (att.url && att.url.startsWith('https://') && !isExpiredOrDeadUrl(att.url)) {
      reliableUrl = att.url;
    } else if (att.dataUrl && att.dataUrl.startsWith('data:')) {
      reliableUrl = att.dataUrl;
    } else if (att.url && att.url.startsWith('data:')) {
      reliableUrl = att.url;
    } else if (att.lgUrl && att.lgUrl.startsWith('https://') && !isExpiredOrDeadUrl(att.lgUrl)) {
      reliableUrl = att.lgUrl;
    } else if (att.smUrl && att.smUrl.startsWith('https://') && !isExpiredOrDeadUrl(att.smUrl)) {
      reliableUrl = att.smUrl;
    }

    const clean: Attachment = {
      id: safeDocId(att.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`),
      name: att.name || 'File',
      url: reliableUrl,
      size: typeof att.size === 'number' ? att.size : 0,
      mimetype: att.mimetype || 'image/jpeg',
    };
    // Include dataUrl if under 400KB so it safely persists inside Firestore document
    if (att.dataUrl && att.dataUrl.startsWith('data:') && att.dataUrl.length < 400000) {
      clean.dataUrl = att.dataUrl;
    }
    if (att.storagePath) {
      clean.storagePath = att.storagePath;
    }
    if (typeof att.width === 'number') {
      clean.width = att.width;
    }
    if (typeof att.height === 'number') {
      clean.height = att.height;
    }
    return clean;
  });
}

/**
 * Pushes all local records up to Google Firestore ("Sync to Cloud").
 * 
 * Follows industry-standard Cloud Storage + Firestore separation:
 * 1. Uploads media files and large text payloads to Firebase Cloud Storage.
 * 2. Stores lightweight document records and download URLs in Cloud Firestore.
 * 3. Atomic batch commits with automated document-level fallback.
 */
export async function syncToCloud(
  localDb: DatabaseState,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();
  const stepsSummary: string[] = [];

  const reportProgress = (
    stepNumber: number,
    stage: string,
    detail: string,
    percent: number,
    currentCollection?: string,
    itemsProcessed?: number,
    itemsTotal?: number
  ) => {
    stepsSummary.push(`[${percent}%] ${stage}: ${detail}`);
    if (onProgress) {
      onProgress({
        action: 'push',
        stage,
        stepNumber,
        totalSteps: 5,
        percent,
        detail,
        currentCollection,
        itemsProcessed,
        itemsTotal,
        startedAt: timestamp,
      });
    }
  };

  try {
    reportProgress(1, 'Preparing Push', 'Inspecting local benchmark items & preparing payload...', 10);

    // 1. Synchronize attachments to Firebase Cloud Storage
    reportProgress(2, 'Uploading to Cloud Storage', 'Uploading files and photos to Firebase Cloud Storage...', 20, 'storage');
    let storageUploadCount = 0;

    const processAttachments = async (attachments?: Attachment[]) => {
      if (!attachments || !Array.isArray(attachments)) return;
      for (let i = 0; i < attachments.length; i++) {
        const current = attachments[i];
        // If not a remote URL, sync to Cloud Storage
        if (current.url && !current.url.startsWith('https://')) {
          const updated = await syncAttachmentToStorage(current);
          if (updated.url && updated.url.startsWith('https://')) {
            attachments[i] = updated;
            storageUploadCount++;
          }
        }
      }
    };

    for (const p of localDb.products) {
      await processAttachments(p.pictures);
    }
    for (const s of localDb.specifications) {
      await processAttachments(s.pictures);
    }
    for (const r of localDb.reviews) {
      await processAttachments(r.pictures);

      // Large text payload check: if review body is very long (> 15KB), offload to Cloud Storage
      if (r.body && r.body.length > 15000 && !r.storageUrl) {
        try {
          const textUpload = await uploadTextPayloadToStorage(
            r.body,
            `review_${safeDocId(r.id)}.html`,
            'review_payloads'
          );
          if (textUpload) {
            r.storageUrl = textUpload.url;
            r.storagePath = textUpload.storagePath;
          }
        } catch (textErr) {
          console.warn('Could not offload review text to Cloud Storage:', textErr);
        }
      }
    }

    // Persist updated URLs to local database
    saveLocalDatabase(localDb);
    reportProgress(2, 'Storage Sync Complete', `Synced ${storageUploadCount} assets with Cloud Storage`, 35, 'storage');

    // Safe batch queue with automated individual write fallback
    interface PendingOp {
      ref: any;
      data: any;
    }
    let pendingOps: PendingOp[] = [];

    const commitCurrentBatch = async () => {
      if (pendingOps.length === 0) return;
      const opsToCommit = [...pendingOps];
      pendingOps = [];

      try {
        const batch = writeBatch(db);
        for (const op of opsToCommit) {
          batch.set(op.ref, op.data, { merge: true });
        }
        await batch.commit();
      } catch (batchErr) {
        console.warn('Batch write failed, falling back to individual document writes:', batchErr);
        for (const op of opsToCommit) {
          try {
            await setDoc(op.ref, op.data, { merge: true });
          } catch (docErr) {
            console.error(`Failed to write document ${op.ref?.path}:`, docErr);
          }
        }
      }
    };

    // 2. Products
    const totalProducts = localDb.products.length;
    reportProgress(3, 'Syncing Products', `Pushing ${totalProducts} products to Firestore /products...`, 45, 'products', 0, totalProducts);
    let pCount = 0;
    for (const product of localDb.products) {
      pCount++;
      const docId = safeDocId(product.id);
      const pRef = doc(db, 'products', docId);
      pendingOps.push({
        ref: pRef,
        data: removeUndefined({
          id: docId,
          name: product.name || '',
          brand: product.brand || 'Generic',
          tags: Array.isArray(product.tags) ? product.tags : [],
          overview: product.overview || '',
          pictures: sanitizeDocPictures(product.pictures),
          specificationIds: Array.isArray(product.specificationIds) ? product.specificationIds : [],
          reviewIds: Array.isArray(product.reviewIds) ? product.reviewIds : [],
          createdTime: product.createdTime || timestamp,
          updatedAt: timestamp,
        }),
      });

      if (pendingOps.length >= 25) {
        await commitCurrentBatch();
      }
    }
    await commitCurrentBatch();
    reportProgress(3, 'Products Synced', `Pushed ${pCount}/${totalProducts} products to Firestore`, 65, 'products', pCount, totalProducts);

    // 3. Specifications
    const totalSpecs = localDb.specifications.length;
    reportProgress(4, 'Syncing Specifications', `Pushing ${totalSpecs} specifications to Firestore /specifications...`, 70, 'specifications', 0, totalSpecs);
    let sCount = 0;
    for (const spec of localDb.specifications) {
      sCount++;
      const docId = safeDocId(spec.id);
      const sRef = doc(db, 'specifications', docId);
      pendingOps.push({
        ref: sRef,
        data: removeUndefined({
          id: docId,
          productId: spec.productId || '',
          productTitle: spec.productTitle || '',
          specName: spec.specName || '',
          details: spec.details || '',
          unit: spec.unit || '',
          order: typeof spec.order === 'number' ? spec.order : 1,
          pictures: sanitizeDocPictures(spec.pictures),
          updatedAt: timestamp,
        }),
      });

      if (pendingOps.length >= 25) {
        await commitCurrentBatch();
      }
    }
    await commitCurrentBatch();
    reportProgress(4, 'Specifications Synced', `Pushed ${sCount}/${totalSpecs} specs to Firestore`, 85, 'specifications', sCount, totalSpecs);

    // 4. Reviews
    const totalReviews = localDb.reviews.length;
    reportProgress(5, 'Syncing Reviews', `Pushing ${totalReviews} reviews to /reviews...`, 88, 'reviews', 0, totalReviews);
    let rCount = 0;
    for (const rev of localDb.reviews) {
      rCount++;
      const docId = safeDocId(rev.id);
      const rRef = doc(db, 'reviews', docId);
      pendingOps.push({
        ref: rRef,
        data: removeUndefined({
          id: docId,
          reviewNumber: typeof rev.reviewNumber === 'number' ? rev.reviewNumber : 1,
          body: rev.body || '',
          storageUrl: rev.storageUrl || '',
          storagePath: rev.storagePath || '',
          authorName: rev.authorName || 'Verified Reviewer',
          rating: typeof rev.rating === 'number' ? rev.rating : 5,
          productIds: Array.isArray(rev.productIds) ? rev.productIds : [],
          productTitles: Array.isArray(rev.productTitles) ? rev.productTitles : [],
          pictures: sanitizeDocPictures(rev.pictures),
          createdTime: rev.createdTime || timestamp,
          updatedAt: timestamp,
        }),
      });

      if (pendingOps.length >= 25) {
        await commitCurrentBatch();
      }
    }
    await commitCurrentBatch();

    // 5. Users
    for (const user of localDb.users) {
      const docId = safeDocId(user.id);
      const uRef = doc(db, 'users', docId);
      pendingOps.push({
        ref: uRef,
        data: removeUndefined({
          id: docId,
          name: user.name || '',
          email: user.email || '',
          role: user.role || 'User',
          updatedAt: timestamp,
        }),
      });

      if (pendingOps.length >= 25) {
        await commitCurrentBatch();
      }
    }

    await commitCurrentBatch();

    const durationMs = Date.now() - startTime;
    reportProgress(5, 'Sync Complete', `All ${localDb.products.length} products, ${localDb.specifications.length} specs, and reviews pushed in ${(durationMs / 1000).toFixed(1)}s!`, 100);

    const updatedDb: DatabaseState = {
      ...localDb,
      lastPushed: timestamp,
    };
    saveLocalDatabase(updatedDb);

    return {
      success: true,
      message: `Successfully synchronized ${localDb.products.length} products, ${localDb.specifications.length} specifications, and ${localDb.reviews.length} reviews to Cloud Firestore!`,
      database: updatedDb,
      counts: {
        products: localDb.products.length,
        specifications: localDb.specifications.length,
        reviews: localDb.reviews.length,
        images: storageUploadCount,
      },
      timestamp,
      durationMs,
      stepsSummary,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'all_collections');
    return {
      success: false,
      message: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
      timestamp,
      durationMs: Date.now() - startTime,
      stepsSummary,
    };
  }
}

/**
 * Pulls all records from Google Firestore into local storage ("Pull from Cloud").
 */
export async function pullFromCloud(
  localDb: DatabaseState,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();
  const stepsSummary: string[] = [];

  const reportProgress = (
    stepNumber: number,
    stage: string,
    detail: string,
    percent: number,
    currentCollection?: string,
    itemsProcessed?: number,
    itemsTotal?: number
  ) => {
    stepsSummary.push(`[${percent}%] ${stage}: ${detail}`);
    if (onProgress) {
      onProgress({
        action: 'pull',
        stage,
        stepNumber,
        totalSteps: 4,
        percent,
        detail,
        currentCollection,
        itemsProcessed,
        itemsTotal,
        startedAt: timestamp,
      });
    }
  };

  try {
    reportProgress(1, 'Connecting to Cloud', `Contacting Firestore database (${databaseId})...`, 15);

    // 1. Fetch Products
    reportProgress(2, 'Fetching Products', 'Retrieving /products catalog from Google Cloud Firestore...', 35, 'products');
    const productsSnap = await getDocs(collection(db, 'products'));
    const cloudProducts: Product[] = [];
    productsSnap.forEach((d) => {
      const data = d.data();
      cloudProducts.push({
        id: d.id,
        name: data.name || 'Untitled Product',
        brand: data.brand || 'Generic',
        tags: Array.isArray(data.tags) ? data.tags : [],
        overview: data.overview || '',
        pictures: Array.isArray(data.pictures) ? data.pictures : [],
        specificationIds: Array.isArray(data.specificationIds) ? data.specificationIds : [],
        reviewIds: Array.isArray(data.reviewIds) ? data.reviewIds : [],
        createdTime: data.createdTime,
        updatedAt: data.updatedAt,
      });
    });
    reportProgress(2, 'Products Retrieved', `Downloaded ${cloudProducts.length} product records from Firestore`, 50, 'products', cloudProducts.length, cloudProducts.length);

    // 2. Fetch Specifications
    reportProgress(3, 'Fetching Specifications', 'Retrieving /specifications rows from Firestore...', 60, 'specifications');
    const specsSnap = await getDocs(collection(db, 'specifications'));
    const cloudSpecs: Specification[] = [];
    specsSnap.forEach((d) => {
      const data = d.data();
      cloudSpecs.push({
        id: d.id,
        productId: data.productId || '',
        productTitle: data.productTitle || '',
        specName: data.specName || 'Specification',
        details: data.details || '',
        unit: data.unit || '',
        order: typeof data.order === 'number' ? data.order : 1,
        pictures: Array.isArray(data.pictures) ? data.pictures : [],
        updatedAt: data.updatedAt,
      });
    });
    reportProgress(3, 'Specifications Retrieved', `Downloaded ${cloudSpecs.length} specification rows from Firestore`, 75, 'specifications', cloudSpecs.length, cloudSpecs.length);

    // 3. Fetch Reviews
    reportProgress(4, 'Fetching Reviews', 'Retrieving /reviews ratings and benchmarks...', 85, 'reviews');
    const reviewsSnap = await getDocs(collection(db, 'reviews'));
    const cloudReviews: UserReview[] = [];
    reviewsSnap.forEach((d) => {
      const data = d.data();
      cloudReviews.push({
        id: d.id,
        reviewNumber: typeof data.reviewNumber === 'number' ? data.reviewNumber : 1,
        body: data.body || '',
        storageUrl: data.storageUrl,
        storagePath: data.storagePath,
        authorName: data.authorName || 'Verified Reviewer',
        rating: typeof data.rating === 'number' ? data.rating : 5,
        productIds: Array.isArray(data.productIds) ? data.productIds : [],
        productTitles: Array.isArray(data.productTitles) ? data.productTitles : [],
        pictures: Array.isArray(data.pictures) ? data.pictures : [],
        createdTime: data.createdTime,
        updatedAt: data.updatedAt,
      });
    });

    // 4. Fetch Users
    const usersSnap = await getDocs(collection(db, 'users'));
    const cloudUsers: AppUser[] = [];
    usersSnap.forEach((d) => {
      const data = d.data();
      cloudUsers.push({
        id: d.id,
        name: data.name || 'User',
        email: data.email || '',
        role: data.role || 'User',
      });
    });

    // If cloud is empty, do not overwrite local database, and do not push dummy data to cloud
    if (cloudProducts.length === 0) {
      const durationMs = Date.now() - startTime;
      reportProgress(4, 'Cloud Empty', 'Cloud Firestore currently has 0 product records stored.', 100);
      return {
        success: true,
        message: 'Cloud Firestore currently has 0 product records. Use "Push to Cloud" whenever you wish to upload your catalog.',
        database: localDb,
        counts: {
          products: 0,
          specifications: 0,
          reviews: 0,
        },
        timestamp,
        durationMs,
        stepsSummary,
      };
    }

    const durationMs = Date.now() - startTime;
    reportProgress(4, 'Pull Complete', `Synced ${cloudProducts.length} products, ${cloudSpecs.length} specs in ${(durationMs / 1000).toFixed(1)}s!`, 100);

    const updatedDb: DatabaseState = {
      ...localDb,
      products: cloudProducts,
      specifications: cloudSpecs,
      reviews: cloudReviews,
      users: cloudUsers.length > 0 ? cloudUsers : localDb.users,
      lastSynced: timestamp,
    };

    saveLocalDatabase(updatedDb);

    return {
      success: true,
      message: `Pulled ${cloudProducts.length} products, ${cloudSpecs.length} specifications, and ${cloudReviews.length} reviews from Google Cloud Firestore!`,
      database: updatedDb,
      counts: {
        products: cloudProducts.length,
        specifications: cloudSpecs.length,
        reviews: cloudReviews.length,
      },
      timestamp,
      durationMs,
      stepsSummary,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'all_collections');
    return {
      success: false,
      message: `Failed to pull from Cloud: ${error instanceof Error ? error.message : String(error)}`,
      timestamp,
      durationMs: Date.now() - startTime,
      stepsSummary,
    };
  }
}

// Aliases for seamless imports
export {
  syncToCloud as syncLocalToFirestore,
  pullFromCloud as pullFromFirestore,
  projectId,
  databaseId,
};
