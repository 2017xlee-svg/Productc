import { INITIAL_DATABASE } from '../data/seedData';
import { DatabaseState, Product, Specification, UserReview, AppUser, Attachment } from '../types';
import { saveDatabaseToIndexedDB, loadDatabaseFromIndexedDB } from './indexedDbMedia';

const STORAGE_KEY = 'productcompare_local_database_v4';
const INITIALIZED_KEY = 'productcompare_initialized_v4';
let memoryDatabaseCache: DatabaseState | null = null;

const DEFAULT_USERS: AppUser[] = [
  {
    id: 'usr-admin-default',
    name: 'Admin User',
    email: 'admin@local.app',
    role: 'Admin',
  },
];

function sanitizeAttachmentToUrlOnly(att: any): Attachment {
  if (!att || typeof att !== 'object') return att;
  const isDataUrl = typeof att.url === 'string' && att.url.startsWith('data:image/');
  return {
    ...att,
    url: isDataUrl ? '' : att.url,
    dataUrl: undefined, // Never store base64 in the database
  };
}

function sanitizeReviewBodyBase64(body = ''): string {
  if (!body || !body.includes('data:image/')) return body;
  // Replace inline base64 src in img tags with empty or data-attachment-id reference
  return body.replace(/src="data:image\/[^"]+"/gi, 'src=""');
}

/**
 * Normalizes any database object so that products, specifications, reviews,
 * and users are ALWAYS guaranteed non-null arrays. Prevents null pointer errors.
 */
export function normalizeDatabaseState(db?: any): DatabaseState {
  if (!db || typeof db !== 'object') {
    return {
      products: [],
      specifications: [],
      reviews: [],
      users: DEFAULT_USERS,
      sourceUrl: 'local',
      shareId: '',
      baseId: '',
      lastSynced: new Date().toISOString(),
    };
  }

  return {
    products: (Array.isArray(db.products) ? db.products : []).map((p: any) => ({
      ...p,
      tags: Array.isArray(p?.tags) ? p.tags : [],
      pictures: (Array.isArray(p?.pictures) ? p.pictures : []).map(sanitizeAttachmentToUrlOnly),
      specificationIds: Array.isArray(p?.specificationIds) ? p.specificationIds : [],
      reviewIds: Array.isArray(p?.reviewIds) ? p.reviewIds : [],
    })),
    specifications: (Array.isArray(db.specifications) ? db.specifications : []).map((s: any) => ({
      ...s,
      pictures: (Array.isArray(s?.pictures) ? s.pictures : []).map(sanitizeAttachmentToUrlOnly),
    })),
    reviews: (Array.isArray(db.reviews) ? db.reviews : []).map((r: any) => {
      const cleanPictures = (Array.isArray(r?.pictures) ? r.pictures : []).map(sanitizeAttachmentToUrlOnly);
      const cleanBody = sanitizeReviewBodyBase64(r?.body || '');

      return {
        ...r,
        body: cleanBody,
        productIds: Array.isArray(r?.productIds) ? r.productIds : [],
        productTitles: Array.isArray(r?.productTitles) ? r.productTitles : [],
        pictures: cleanPictures,
      };
    }),
    users: Array.isArray(db.users) && db.users.length > 0 ? db.users : DEFAULT_USERS,
    sourceUrl: 'local',
    shareId: db.shareId || '',
    baseId: db.baseId || '',
    lastSynced: db.lastSynced || new Date().toISOString(),
    lastPushed: db.lastPushed,
  };
}

export function isDefaultSeedDatabase(db: DatabaseState): boolean {
  if (!db || !Array.isArray(db.products) || db.products.length === 0) return false;
  const seedIds = new Set(['recSonyPx470Benchmark', 'recyjZnFD30NiXoRwjF', 'recQRftAV957mVdyRwD']);
  const seedNames = new Set(['sony px470', 'Plaud note', 'Samsung fold 8']);
  const hasUserProduct = db.products.some(
    (p) => !seedIds.has(p.id) && !seedNames.has(p.name) && !p.id.startsWith('rec')
  );
  return !hasUserProduct;
}

/**
 * Initializes database from IndexedDB (first priority) or localStorage.
 * NEVER resets to seed data if the database was already initialized.
 */
export async function initDatabaseFromIndexedDB(): Promise<DatabaseState> {
  try {
    const fromIdb = await loadDatabaseFromIndexedDB<DatabaseState>();
    if (fromIdb && typeof fromIdb === 'object') {
      const normalized = normalizeDatabaseState(fromIdb);
      memoryDatabaseCache = normalized;
      try {
        saveLocalDatabase(normalized);
      } catch {
        // ignore
      }
      return normalized;
    }
  } catch (err) {
    console.warn('IndexedDB initial load note:', err);
  }

  return loadLocalDatabase();
}

/**
 * Loads the database state from local cache or storage.
 * If user already initialized the app, their exact data (even if empty) is respected.
 * Seed data is ONLY loaded on the very first visit if no database has ever been saved.
 */
export function loadLocalDatabase(): DatabaseState {
  if (memoryDatabaseCache) {
    return normalizeDatabaseState(memoryDatabaseCache);
  }

  const isInitialized = typeof window !== 'undefined' && localStorage.getItem(INITIALIZED_KEY) === 'true';

  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const normalized = normalizeDatabaseState(parsed);
        memoryDatabaseCache = normalized;
        return normalized;
      }
    }
  } catch (err) {
    console.warn('Failed to parse local database storage:', err);
  }

  // If already initialized by user but storage was empty array, keep it empty! Do not reseed!
  if (isInitialized) {
    const blank = normalizeDatabaseState();
    memoryDatabaseCache = blank;
    return blank;
  }

  // Very first visit: initialize with seed dataset once
  const initial = normalizeDatabaseState({
    ...INITIAL_DATABASE,
    sourceUrl: 'local',
    shareId: '',
    baseId: '',
    lastSynced: new Date().toISOString(),
  });

  memoryDatabaseCache = initial;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      localStorage.setItem(INITIALIZED_KEY, 'true');
    } catch {
      // ignore
    }
  }
  return initial;
}

/**
 * Explicitly loads or resets to the sample/seed benchmark catalog.
 * Triggered ONLY by user pressing the "Load Sample Catalog" button.
 */
export function loadSeedCatalog(): DatabaseState {
  const seedState = normalizeDatabaseState({
    ...INITIAL_DATABASE,
    sourceUrl: 'local',
    lastSynced: new Date().toISOString(),
  });

  saveLocalDatabase(seedState);
  if (typeof window !== 'undefined') {
    localStorage.setItem(INITIALIZED_KEY, 'true');
  }
  return seedState;
}

/**
 * Explicitly clears all catalog products, specifications, and reviews.
 * Triggered ONLY by user pressing the "Clear All Data" button.
 */
export function clearLocalDatabase(): DatabaseState {
  const emptyState = normalizeDatabaseState({
    products: [],
    specifications: [],
    reviews: [],
    users: DEFAULT_USERS,
    sourceUrl: 'local',
    lastSynced: new Date().toISOString(),
  });

  saveLocalDatabase(emptyState);
  if (typeof window !== 'undefined') {
    localStorage.setItem(INITIALIZED_KEY, 'true');
  }
  return emptyState;
}

/**
 * Strips high-resolution Base64 data from attachments before saving to localStorage.
 * Full binary images and state are safely stored in IndexedDB (which has hundreds of MBs quota).
 */
function cleanAttachmentForLocalStorage(att: Attachment): Attachment {
  let safeUrl = '';
  // Only keep small external URLs or clean identifiers
  if (att.url && (att.url.startsWith('https://') || att.url.startsWith('http://'))) {
    safeUrl = att.url;
  } else if (att.lgUrl && att.lgUrl.startsWith('https://')) {
    safeUrl = att.lgUrl;
  } else if (att.smUrl && att.smUrl.startsWith('https://')) {
    safeUrl = att.smUrl;
  }

  return {
    ...att,
    url: safeUrl,
    dataUrl: undefined, // Never store base64 in 5MB localStorage; IndexedDB handles all binary blobs
  };
}

/**
 * Strips embedded base64 DataURLs from review HTML bodies to avoid blowing localStorage quota.
 * Matches img src="data:image/..." and replaces with data-attachment-id or placeholder.
 */
function sanitizeReviewBodyForLocalStorage(body = ''): string {
  if (!body) return '';
  // If no base64 images exist in the HTML, return as is
  if (!body.includes('data:image/')) return body;

  // Replace bulky inline base64 src with clean empty/id attribute for localStorage cache
  return body.replace(/src="data:image\/[^"]+"/gi, 'src=""');
}

export function saveLocalDatabase(database: DatabaseState): void {
  const normalized = normalizeDatabaseState(database);
  memoryDatabaseCache = normalized;

  // 1. ALWAYS persist the complete, pristine state into IndexedDB first (no 5MB quota limit)
  if (typeof window !== 'undefined' && window.indexedDB) {
    saveDatabaseToIndexedDB(normalized).catch((err) => {
      console.warn('IndexedDB auto-save background note:', err);
    });
  }

  if (typeof window === 'undefined' || !window.localStorage) return;

  // 2. Persist a lightweight copy into localStorage (with media blobs stripped out)
  try {
    const sanitized: DatabaseState = {
      ...normalized,
      products: normalized.products.map((p) => ({
        ...p,
        pictures: p.pictures?.map(cleanAttachmentForLocalStorage),
      })),
      specifications: normalized.specifications.map((s) => ({
        ...s,
        pictures: s.pictures?.map(cleanAttachmentForLocalStorage),
      })),
      reviews: normalized.reviews.map((r) => ({
        ...r,
        body: sanitizeReviewBodyForLocalStorage(r.body),
        pictures: r.pictures?.map(cleanAttachmentForLocalStorage),
      })),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    localStorage.setItem(INITIALIZED_KEY, 'true');
  } catch (quotaErr) {
    // If quota still exceeded, fall back to setting initialized flag and trust IndexedDB
    try {
      localStorage.setItem(INITIALIZED_KEY, 'true');
      // Remove the bloated item from localStorage so it no longer triggers quota errors
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore fallback error
    }
  }
}

/**
 * Resets local database back to default initial dataset.
 */
export function resetLocalDatabase(): DatabaseState {
  return loadSeedCatalog();
}

// ---------------- Product Operations ----------------

export function localAddProduct(
  db: DatabaseState,
  productData: {
    name: string;
    brand: string;
    tags: string[];
    overview: string;
    pictures?: Attachment[];
    specs?: { name: string; details: string; unit?: string; order?: number; pictures?: Attachment[] }[];
  }
): { database: DatabaseState; product: Product } {
  const productId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const specIds: string[] = [];
  const newSpecs: Specification[] = [];

  if (Array.isArray(productData.specs)) {
    productData.specs.forEach((s, idx) => {
      const specId = `spec_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
      specIds.push(specId);
      newSpecs.push({
        id: specId,
        specName: s.name,
        details: s.details,
        unit: s.unit || '',
        order: typeof s.order === 'number' ? s.order : idx + 1,
        productId,
        productTitle: productData.name,
        pictures: Array.isArray(s.pictures) ? s.pictures : [],
      });
    });
  }

  const newProduct: Product = {
    id: productId,
    name: productData.name,
    brand: productData.brand || 'Generic',
    tags: Array.isArray(productData.tags) ? productData.tags : [],
    overview: productData.overview || '',
    pictures: Array.isArray(productData.pictures) ? productData.pictures : [],
    specificationIds: specIds,
    reviewIds: [],
    createdTime: new Date().toISOString(),
  };

  const updated: DatabaseState = {
    ...db,
    products: [newProduct, ...db.products],
    specifications: [...db.specifications, ...newSpecs],
  };

  saveLocalDatabase(updated);
  return { database: updated, product: newProduct };
}

export function localUpdateProduct(
  db: DatabaseState,
  productId: string,
  updates: {
    name?: string;
    brand?: string;
    tags?: string[];
    overview?: string;
    pictures?: Attachment[];
    specs?: { id?: string; name?: string; specName?: string; details?: string; unit?: string; order?: number; pictures?: Attachment[] }[];
    specifications?: { id?: string; specName?: string; name?: string; details?: string; unit?: string; order?: number; pictures?: Attachment[] }[];
  }
): DatabaseState {
  const productIndex = db.products.findIndex((p) => p.id === productId);
  if (productIndex === -1) return db;

  const existing = db.products[productIndex];
  const rawSpecs = updates.specifications || updates.specs;

  let currentSpecs = [...db.specifications];
  let updatedSpecIds = [...existing.specificationIds];

  if (Array.isArray(rawSpecs)) {
    // Retain only specs for other products or incoming ids
    const incomingIds = rawSpecs.map((s) => s.id).filter(Boolean);
    currentSpecs = currentSpecs.filter(
      (s) => s.productId !== productId || incomingIds.includes(s.id)
    );

    updatedSpecIds = [];
    rawSpecs.forEach((s, idx) => {
      const targetName = s.specName || s.name || `Spec ${idx + 1}`;
      if (s.id && !s.id.startsWith('spec_init_') && !s.id.startsWith('spec_new_')) {
        const specIdx = currentSpecs.findIndex((sp) => sp.id === s.id);
        if (specIdx !== -1) {
          currentSpecs[specIdx] = {
            ...currentSpecs[specIdx],
            specName: targetName,
            details: s.details || '',
            unit: s.unit !== undefined ? s.unit : currentSpecs[specIdx].unit,
            order: typeof s.order === 'number' ? s.order : idx + 1,
            pictures: s.pictures || [],
          };
          updatedSpecIds.push(s.id);
        } else {
          const newSpecId = `spec_${Date.now()}_${idx}`;
          currentSpecs.push({
            id: newSpecId,
            specName: targetName,
            details: s.details || '',
            unit: s.unit || '',
            order: typeof s.order === 'number' ? s.order : idx + 1,
            productId,
            productTitle: updates.name || existing.name,
            pictures: s.pictures || [],
          });
          updatedSpecIds.push(newSpecId);
        }
      } else {
        const newSpecId = `spec_${Date.now()}_${idx}`;
        currentSpecs.push({
          id: newSpecId,
          specName: targetName,
          details: s.details || '',
          unit: s.unit || '',
          order: typeof s.order === 'number' ? s.order : idx + 1,
          productId,
          productTitle: updates.name || existing.name,
          pictures: s.pictures || [],
        });
        updatedSpecIds.push(newSpecId);
      }
    });
  }

  const updatedProduct: Product = {
    ...existing,
    name: updates.name !== undefined ? updates.name : existing.name,
    brand: updates.brand !== undefined ? updates.brand : existing.brand,
    tags: updates.tags !== undefined ? updates.tags : existing.tags,
    overview: updates.overview !== undefined ? updates.overview : existing.overview,
    pictures: updates.pictures !== undefined ? updates.pictures : existing.pictures,
    specificationIds: updatedSpecIds,
  };

  const updatedProducts = [...db.products];
  updatedProducts[productIndex] = updatedProduct;

  const updated: DatabaseState = {
    ...db,
    products: updatedProducts,
    specifications: currentSpecs,
  };

  saveLocalDatabase(updated);
  return updated;
}

export function localDeleteProduct(db: DatabaseState, productId: string): DatabaseState {
  const updated: DatabaseState = {
    ...db,
    products: db.products.filter((p) => p.id !== productId),
    specifications: db.specifications.filter((s) => s.productId !== productId),
    reviews: db.reviews.map((r) => ({
      ...r,
      productIds: r.productIds.filter((pid) => pid !== productId),
    })),
  };
  saveLocalDatabase(updated);
  return updated;
}

// ---------------- Specification Operations ----------------

export function localAddSpecification(
  db: DatabaseState,
  specData: {
    productId: string;
    specName: string;
    details: string;
    unit?: string;
    order?: number;
    pictures?: Attachment[];
  }
): DatabaseState {
  const product = db.products.find((p) => p.id === specData.productId);
  const specId = `spec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newSpec: Specification = {
    id: specId,
    productId: specData.productId,
    productTitle: product ? product.name : '',
    specName: specData.specName,
    details: specData.details || '',
    unit: specData.unit || '',
    order: typeof specData.order === 'number' ? specData.order : (product ? product.specificationIds.length + 1 : 1),
    pictures: Array.isArray(specData.pictures) ? specData.pictures : [],
  };

  const updatedProducts = db.products.map((p) => {
    if (p.id === specData.productId && !p.specificationIds.includes(specId)) {
      return { ...p, specificationIds: [...p.specificationIds, specId] };
    }
    return p;
  });

  const updated: DatabaseState = {
    ...db,
    specifications: [...db.specifications, newSpec],
    products: updatedProducts,
  };

  saveLocalDatabase(updated);
  return updated;
}

export function localUpdateSpecification(
  db: DatabaseState,
  specId: string,
  updates: {
    specName?: string;
    details?: string;
    unit?: string;
    order?: number;
    pictures?: Attachment[];
  }
): DatabaseState {
  const updatedSpecs = db.specifications.map((s) => {
    if (s.id === specId) {
      return {
        ...s,
        specName: updates.specName !== undefined ? updates.specName : s.specName,
        details: updates.details !== undefined ? updates.details : s.details,
        unit: updates.unit !== undefined ? updates.unit : s.unit,
        order: typeof updates.order === 'number' ? updates.order : s.order,
        pictures: updates.pictures !== undefined ? updates.pictures : s.pictures,
      };
    }
    return s;
  });

  const updated: DatabaseState = {
    ...db,
    specifications: updatedSpecs,
  };

  saveLocalDatabase(updated);
  return updated;
}

export function localDeleteSpecification(db: DatabaseState, specId: string): DatabaseState {
  const updatedProducts = db.products.map((p) => ({
    ...p,
    specificationIds: p.specificationIds.filter((id) => id !== specId),
  }));

  const updated: DatabaseState = {
    ...db,
    specifications: db.specifications.filter((s) => s.id !== specId),
    products: updatedProducts,
  };

  saveLocalDatabase(updated);
  return updated;
}

export function localReorderSpecifications(
  db: DatabaseState,
  reorders: { id: string; order: number }[]
): DatabaseState {
  const orderMap = new Map(reorders.map((r) => [r.id, r.order]));
  const updatedSpecs = db.specifications.map((s) => {
    if (orderMap.has(s.id)) {
      return { ...s, order: orderMap.get(s.id)! };
    }
    return s;
  });

  const updated: DatabaseState = {
    ...db,
    specifications: updatedSpecs,
  };

  saveLocalDatabase(updated);
  return updated;
}

// ---------------- Review Operations ----------------

export function localAddReview(
  db: DatabaseState,
  reviewData: {
    productId?: string;
    productIds?: string[];
    productTitles?: string[];
    title?: string;
    body: string;
    pros?: string[];
    cons?: string[];
    authorName?: string;
    authorAvatar?: string;
    rating?: number;
    pictures?: Attachment[];
  }
): DatabaseState {
  const chosenProductId = reviewData.productId || (reviewData.productIds && reviewData.productIds[0]) || '';
  const product = db.products.find((p) => p.id === chosenProductId);
  const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const resolvedProductIds = chosenProductId
    ? [chosenProductId]
    : Array.isArray(reviewData.productIds) && reviewData.productIds.length > 0
    ? reviewData.productIds
    : [];

  const resolvedProductTitles = product
    ? [product.name]
    : Array.isArray(reviewData.productTitles) && reviewData.productTitles.length > 0
    ? reviewData.productTitles
    : [];

  const newReview: UserReview = {
    id: reviewId,
    reviewNumber: db.reviews.length + 1,
    title: reviewData.title,
    body: reviewData.body,
    pros: reviewData.pros,
    cons: reviewData.cons,
    authorName: reviewData.authorName || 'Verified Reviewer',
    authorAvatar: reviewData.authorAvatar,
    rating: reviewData.rating || 5,
    productIds: resolvedProductIds,
    productTitles: resolvedProductTitles,
    pictures: Array.isArray(reviewData.pictures) ? reviewData.pictures : [],
    createdTime: new Date().toISOString(),
  };

  const updatedProducts = db.products.map((p) => {
    if (resolvedProductIds.includes(p.id) && !p.reviewIds.includes(reviewId)) {
      return { ...p, reviewIds: [reviewId, ...p.reviewIds] };
    }
    return p;
  });

  const updated: DatabaseState = {
    ...db,
    reviews: [newReview, ...db.reviews],
    products: updatedProducts,
  };

  saveLocalDatabase(updated);
  return updated;
}

export function localAddReviewsBatch(
  db: DatabaseState,
  reviewsDataList: Array<{
    productId?: string;
    productIds?: string[];
    productTitles?: string[];
    title?: string;
    body: string;
    pros?: string[];
    cons?: string[];
    authorName?: string;
    authorAvatar?: string;
    rating?: number;
    pictures?: Attachment[];
  }>
): DatabaseState {
  if (!Array.isArray(reviewsDataList) || reviewsDataList.length === 0) {
    return db;
  }

  const newReviews: UserReview[] = [];
  const productReviewMap = new Map<string, string[]>();
  let nextReviewNumber = db.reviews.length + 1;

  for (let i = 0; i < reviewsDataList.length; i++) {
    const data = reviewsDataList[i];
    const chosenProductId = data.productId || (data.productIds && data.productIds[0]) || '';
    const product = db.products.find((p) => p.id === chosenProductId);
    const reviewId = `rev_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

    const resolvedProductIds = chosenProductId
      ? [chosenProductId]
      : Array.isArray(data.productIds) && data.productIds.length > 0
      ? data.productIds
      : [];

    const resolvedProductTitles = product
      ? [product.name]
      : Array.isArray(data.productTitles) && data.productTitles.length > 0
      ? data.productTitles
      : [];

    const rev: UserReview = {
      id: reviewId,
      reviewNumber: nextReviewNumber++,
      title: data.title,
      body: data.body,
      pros: data.pros,
      cons: data.cons,
      authorName: data.authorName || 'Verified Reviewer',
      authorAvatar: data.authorAvatar,
      rating: data.rating || 5,
      productIds: resolvedProductIds,
      productTitles: resolvedProductTitles,
      pictures: Array.isArray(data.pictures) ? data.pictures : [],
      createdTime: new Date(Date.now() + i * 10).toISOString(),
    };

    newReviews.push(rev);

    for (const pid of resolvedProductIds) {
      const existing = productReviewMap.get(pid) || [];
      existing.push(reviewId);
      productReviewMap.set(pid, existing);
    }
  }

  const updatedProducts = db.products.map((p) => {
    const addedReviewIds = productReviewMap.get(p.id);
    if (addedReviewIds && addedReviewIds.length > 0) {
      const merged = Array.from(new Set([...addedReviewIds, ...p.reviewIds]));
      return { ...p, reviewIds: merged };
    }
    return p;
  });

  const updated: DatabaseState = {
    ...db,
    reviews: [...newReviews.reverse(), ...db.reviews],
    products: updatedProducts,
  };

  saveLocalDatabase(updated);
  return updated;
}

export function localUpdateReview(
  db: DatabaseState,
  reviewId: string,
  updates: {
    title?: string;
    body?: string;
    pros?: string[];
    cons?: string[];
    authorName?: string;
    authorAvatar?: string;
    rating?: number;
    productId?: string;
    productIds?: string[];
    productTitles?: string[];
    pictures?: Attachment[];
  }
): DatabaseState {
  const reviewIndex = db.reviews.findIndex((r) => r.id === reviewId);
  if (reviewIndex === -1) return db;

  const existing = db.reviews[reviewIndex];
  const oldProductIds = [...existing.productIds];
  const chosenProductId = updates.productId || (updates.productIds && updates.productIds[0]);
  const targetProduct = chosenProductId ? db.products.find((p) => p.id === chosenProductId) : null;

  const newProductIds = chosenProductId
    ? [chosenProductId]
    : updates.productIds !== undefined
    ? updates.productIds
    : existing.productIds;

  const newProductTitles = targetProduct
    ? [targetProduct.name]
    : updates.productTitles !== undefined
    ? updates.productTitles
    : existing.productTitles;

  const updatedReview: UserReview = {
    ...existing,
    title: updates.title !== undefined ? updates.title : existing.title,
    body: updates.body !== undefined ? updates.body : existing.body,
    pros: updates.pros !== undefined ? updates.pros : existing.pros,
    cons: updates.cons !== undefined ? updates.cons : existing.cons,
    authorName: updates.authorName !== undefined ? updates.authorName : existing.authorName,
    authorAvatar: updates.authorAvatar !== undefined ? updates.authorAvatar : existing.authorAvatar,
    rating: updates.rating !== undefined ? updates.rating : existing.rating,
    pictures: updates.pictures !== undefined ? updates.pictures : existing.pictures,
    productIds: newProductIds,
    productTitles: newProductTitles,
  };

  const updatedReviews = [...db.reviews];
  updatedReviews[reviewIndex] = updatedReview;

  // Reconcile product linkages
  let updatedProducts = [...db.products];
  if (chosenProductId && (!oldProductIds.includes(chosenProductId) || oldProductIds.length > 1)) {
    updatedProducts = updatedProducts.map((p) => {
      if (oldProductIds.includes(p.id) && !newProductIds.includes(p.id)) {
        return { ...p, reviewIds: p.reviewIds.filter((rid) => rid !== reviewId) };
      }
      if (newProductIds.includes(p.id) && !p.reviewIds.includes(reviewId)) {
        return { ...p, reviewIds: [reviewId, ...p.reviewIds] };
      }
      return p;
    });
  } else if (newProductIds.length > 0) {
    updatedProducts = updatedProducts.map((p) => {
      if (newProductIds.includes(p.id) && !p.reviewIds.includes(reviewId)) {
        return { ...p, reviewIds: [reviewId, ...p.reviewIds] };
      }
      return p;
    });
  }

  const updated: DatabaseState = {
    ...db,
    reviews: updatedReviews,
    products: updatedProducts,
  };

  saveLocalDatabase(updated);
  return updated;
}

export function localDeleteReview(db: DatabaseState, reviewId: string): DatabaseState {
  const updatedProducts = db.products.map((p) => ({
    ...p,
    reviewIds: p.reviewIds.filter((rid) => rid !== reviewId),
  }));

  const updated: DatabaseState = {
    ...db,
    reviews: db.reviews.filter((r) => r.id !== reviewId),
    products: updatedProducts,
  };

  saveLocalDatabase(updated);
  return updated;
}
