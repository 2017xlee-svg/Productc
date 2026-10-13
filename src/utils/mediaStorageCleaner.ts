import { DatabaseState, UserReview, Attachment } from '../types';
import { deleteMediaBlob, getAllMediaRecords } from '../lib/indexedDbMedia';
import { revokeActiveObjectUrl } from './imageCompressor';

/**
 * Extracts all media/attachment IDs referenced inside a review (pictures array and HTML body).
 */
export function extractMediaIdsFromReview(review: UserReview): string[] {
  const ids = new Set<string>();

  // 1. From pictures array
  if (Array.isArray(review.pictures)) {
    for (const pic of review.pictures) {
      if (pic && pic.id) {
        ids.add(pic.id);
      }
    }
  }

  // 2. From review HTML body
  if (review.body && typeof review.body === 'string') {
    // Match data-attachment-id="att_..."
    const dataAttMatches = review.body.matchAll(/data-attachment-id=["']([^"']+)["']/gi);
    for (const m of dataAttMatches) {
      if (m[1]) ids.add(m[1].trim());
    }

    // Match att_ IDs in src or attributes
    const attIdMatches = review.body.matchAll(/(att_[a-zA-Z0-9_\-]+)/gi);
    for (const m of attIdMatches) {
      if (m[1]) ids.add(m[1].trim());
    }
  }

  return Array.from(ids);
}

/**
 * Gathers all active media/attachment IDs referenced across the entire database
 * (products, specifications, reviews, and HTML bodies).
 */
export function getAllActiveMediaIds(db: DatabaseState): Set<string> {
  const activeIds = new Set<string>();

  // Products
  if (Array.isArray(db.products)) {
    for (const p of db.products) {
      if (Array.isArray(p.pictures)) {
        for (const pic of p.pictures) {
          if (pic && pic.id) activeIds.add(pic.id);
        }
      }
      if (p.overview) {
        const matches = p.overview.matchAll(/(att_[a-zA-Z0-9_\-]+)/gi);
        for (const m of matches) {
          if (m[1]) activeIds.add(m[1]);
        }
      }
    }
  }

  // Specifications
  if (Array.isArray(db.specifications)) {
    for (const s of db.specifications) {
      if (Array.isArray(s.pictures)) {
        for (const pic of s.pictures) {
          if (pic && pic.id) activeIds.add(pic.id);
        }
      }
    }
  }

  // Reviews
  if (Array.isArray(db.reviews)) {
    for (const r of db.reviews) {
      const reviewIds = extractMediaIdsFromReview(r);
      for (const id of reviewIds) {
        activeIds.add(id);
      }
    }
  }

  return activeIds;
}

/**
 * Deletes all IndexedDB image blobs that belong to a deleted review,
 * provided they are not referenced elsewhere in the catalog.
 */
export async function deleteReviewMediaBlobs(
  review: UserReview,
  remainingDb: DatabaseState
): Promise<number> {
  const mediaIds = extractMediaIdsFromReview(review);
  if (mediaIds.length === 0) return 0;

  const activeIds = getAllActiveMediaIds(remainingDb);
  let count = 0;

  for (const id of mediaIds) {
    if (!activeIds.has(id)) {
      try {
        await deleteMediaBlob(id);
        revokeActiveObjectUrl(id);
        count++;
      } catch (err) {
        console.warn(`Could not delete media blob ${id}:`, err);
      }
    }
  }

  return count;
}

/**
 * Garbage collector: Scans all IndexedDB records and removes any orphan media
 * that is no longer referenced anywhere in the current database.
 */
export async function cleanupOrphanMediaBlobs(database: DatabaseState): Promise<number> {
  try {
    const allRecords = await getAllMediaRecords();
    if (allRecords.length === 0) return 0;

    const activeIds = getAllActiveMediaIds(database);
    let cleaned = 0;

    for (const record of allRecords) {
      if (!activeIds.has(record.id)) {
        try {
          await deleteMediaBlob(record.id);
          revokeActiveObjectUrl(record.id);
          cleaned++;
        } catch {
          // ignore
        }
      }
    }

    return cleaned;
  } catch (err) {
    console.warn('Failed to cleanup orphan media blobs:', err);
    return 0;
  }
}
