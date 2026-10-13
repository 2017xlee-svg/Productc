import JSZip from 'jszip';
import { DatabaseState, Attachment } from '../types';
import { getAllMediaRecords, saveMediaBlob, CachedMediaRecord } from './indexedDbMedia';
import { normalizeDatabaseState, saveLocalDatabase } from './localDatabase';
import { registerActiveObjectUrl } from '../utils/imageCompressor';

export interface BackupProgress {
  stage: string;
  percent: number;
  detail: string;
}

export interface BackupManifest {
  version: string;
  exportedAt: string;
  appName: string;
  productCount: number;
  specificationCount: number;
  reviewCount: number;
  mediaFileCount: number;
  totalSizeEstimatedBytes?: number;
}

/**
 * Triggers a file download in the browser.
 */
export async function triggerFileDownload(blob: Blob, fileName: string): Promise<{ savedToNativePath?: string }> {
  // Standard web browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);

  return {};
}

/**
 * Creates and downloads a complete full backup archive (.ZIP),
 * containing database.json (all products, specs, reviews, tags, users)
 * and all high-resolution pictures and review photos from IndexedDB.
 */
export async function createFullBackupArchive(
  database: DatabaseState,
  onProgress?: (p: BackupProgress) => void
): Promise<{ blob: Blob; fileName: string; manifest: BackupManifest }> {
  const normalized = normalizeDatabaseState(database);
  const zip = new JSZip();

  onProgress?.({ stage: 'Collecting Media', percent: 10, detail: 'Gathering cached photos and attachments from local storage...' });

  // 1. Retrieve all stored media records from IndexedDB
  const mediaRecords: CachedMediaRecord[] = await getAllMediaRecords();
  const mediaMap = new Map<string, Blob>();
  mediaRecords.forEach((rec) => {
    if (rec.blob) {
      mediaMap.set(rec.id, rec.blob);
    }
  });

  // 2. Also check any base64 data URLs, blob URLs, and inline images in products, specs, or reviews
  const allAttachments: { att: Attachment; context: string }[] = [];
  normalized.products.forEach((p) => p.pictures?.forEach((att) => allAttachments.push({ att, context: p.name })));
  normalized.specifications.forEach((s) => s.pictures?.forEach((att) => allAttachments.push({ att, context: s.specName })));
  normalized.reviews.forEach((r) => {
    r.pictures?.forEach((att) => allAttachments.push({ att, context: `Review by ${r.authorName}` }));

    // Extract any inline <img> tags in review.body
    if (r.body && r.body.includes('<img')) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(r.body, 'text/html');
        const imgs = Array.from(doc.querySelectorAll('img'));
        imgs.forEach((img, idx) => {
          const src = img.getAttribute('src') || '';
          const attId = img.getAttribute('data-attachment-id') || `rev_inline_${r.id}_${idx}`;
          const alt = img.getAttribute('alt') || 'Review image';
          if (src && !allAttachments.some((a) => a.att.id === attId || a.att.url === src)) {
            allAttachments.push({
              att: {
                id: attId,
                name: alt,
                url: src,
                dataUrl: src.startsWith('data:') ? src : undefined,
              },
              context: `Review by ${r.authorName}`,
            });
          }
        });
      } catch {
        // ignore parse error
      }
    }
  });

  let processedCount = 0;
  const totalAtts = allAttachments.length;

  for (const { att } of allAttachments) {
    const candidateId = att.id || `media_${processedCount}`;
    if (!mediaMap.has(candidateId)) {
      const srcUrl = att.dataUrl || att.url || '';
      if (srcUrl.startsWith('data:') || srcUrl.startsWith('blob:')) {
        try {
          const res = await fetch(srcUrl);
          const blob = await res.blob();
          mediaMap.set(candidateId, blob);
        } catch {
          // fallback if fetch fails on dataUrl
          if (srcUrl.startsWith('data:')) {
            try {
              const parts = srcUrl.split(',');
              const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
              const bstr = atob(parts[1]);
              let n = bstr.length;
              const u8arr = new Uint8Array(n);
              while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
              }
              const blob = new Blob([u8arr], { type: mime });
              mediaMap.set(candidateId, blob);
            } catch {
              // ignore
            }
          }
        }
      }
    }
    processedCount++;
    if (totalAtts > 0) {
      const pct = 10 + Math.round((processedCount / totalAtts) * 40);
      onProgress?.({ stage: 'Packaging Media', percent: pct, detail: `Archiving attachment ${processedCount} of ${totalAtts}...` });
    }
  }

  // 3. Add all images into an `images/` folder inside the ZIP
  const imgFolder = zip.folder('images');
  let mediaIndex = 0;
  for (const [id, blob] of mediaMap.entries()) {
    let extension = 'jpg';
    if (blob.type.includes('png')) extension = 'png';
    else if (blob.type.includes('webp')) extension = 'webp';
    else if (blob.type.includes('gif')) extension = 'gif';
    else if (blob.type.includes('pdf')) extension = 'pdf';

    imgFolder?.file(`${id}.${extension}`, blob);
    mediaIndex++;
  }

  // 4. Create backup manifest
  const manifest: BackupManifest = {
    version: '3.0.0-localapp',
    exportedAt: new Date().toISOString(),
    appName: 'ProductCompare Hub',
    productCount: normalized.products.length,
    specificationCount: normalized.specifications.length,
    reviewCount: normalized.reviews.length,
    mediaFileCount: mediaMap.size,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 5. Add full database JSON
  zip.file('database.json', JSON.stringify(normalized, null, 2));

  // 6. Add a helpful README text file
  const readmeContent = `ProductCompare Hub - Full Offline Backup
===================================================
Exported: ${manifest.exportedAt}
Products: ${manifest.productCount}
Specifications: ${manifest.specificationCount}
Reviews: ${manifest.reviewCount}
Media Files: ${manifest.mediaFileCount}

This archive contains your complete standalone catalog, specifications,
reviews, and all photos/attachments.

To restore this backup:
1. Open ProductCompare Hub.
2. Open the Data & Backup Hub (cloud/storage icon in header).
3. Select "Restore Archive (.ZIP)" and choose this file.
All products, specs, reviews, and high-resolution photos will be restored!
`;
  zip.file('README.txt', readmeContent);

  onProgress?.({ stage: 'Compressing', percent: 80, detail: 'Generating high-compression ZIP package...' });

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.({
        stage: 'Compressing',
        percent: 80 + Math.round(metadata.percent * 0.18),
        detail: `Packaging ${metadata.currentFile || 'files'} (${Math.round(metadata.percent)}%)...`,
      });
    }
  );

  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const fileName = `productcompare_full_backup_${dateStr}_${timeStr}.zip`;

  onProgress?.({ stage: 'Complete', percent: 100, detail: 'Backup archive created successfully!' });

  return { blob: zipBlob, fileName, manifest };
}

/**
 * Exports a lightweight JSON string of the database for fast downloads.
 * Guaranteed to be pure URL and text metadata with zero base64 payload.
 */
export function exportDatabaseJsonBlob(database: DatabaseState): { blob: Blob; fileName: string } {
  const normalized = normalizeDatabaseState(database);
  const jsonText = JSON.stringify(normalized, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json' });
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const fileName = `productcompare_database_${dateStr}_${timeStr}.json`;
  return { blob, fileName };
}

/**
 * Restores a full backup from a .zip or .json file.
 */
export async function restoreBackupFile(
  file: File,
  onProgress?: (p: BackupProgress) => void
): Promise<{ database: DatabaseState; mediaCount: number; message: string }> {
  const fileNameLower = file.name.toLowerCase();

  // Handle ZIP Archive
  if (fileNameLower.endsWith('.zip')) {
    onProgress?.({ stage: 'Reading ZIP', percent: 10, detail: 'Extracting backup archive...' });
    const zip = await JSZip.loadAsync(file);

    // Look for database.json
    const dbFile = zip.file('database.json');
    if (!dbFile) {
      throw new Error('Invalid backup archive: missing "database.json" inside ZIP.');
    }

    onProgress?.({ stage: 'Parsing Catalog', percent: 30, detail: 'Reading database records...' });
    const dbContent = await dbFile.async('text');
    let parsedDb: any;
    try {
      parsedDb = JSON.parse(dbContent);
    } catch {
      throw new Error('Corrupt database.json file inside ZIP archive.');
    }

    const normalized = normalizeDatabaseState(parsedDb);

    // Extract all images in `images/`
    onProgress?.({ stage: 'Restoring Photos', percent: 50, detail: 'Restoring photos and media files...' });
    let restoredMediaCount = 0;
    const imageFiles = Object.keys(zip.files).filter((path) => path.startsWith('images/') && !zip.files[path].dir);

    for (let i = 0; i < imageFiles.length; i++) {
      const imgPath = imageFiles[i];
      const entry = zip.files[imgPath];
      const fileBaseName = imgPath.replace(/^images\//, '');
      const dotIndex = fileBaseName.lastIndexOf('.');
      const attId = dotIndex !== -1 ? fileBaseName.substring(0, dotIndex) : fileBaseName;
      const ext = dotIndex !== -1 ? fileBaseName.substring(dotIndex + 1).toLowerCase() : 'jpg';

      let mimetype = 'image/jpeg';
      if (ext === 'png') mimetype = 'image/png';
      else if (ext === 'webp') mimetype = 'image/webp';
      else if (ext === 'gif') mimetype = 'image/gif';
      else if (ext === 'pdf') mimetype = 'application/pdf';

      try {
        const blob = await entry.async('blob');
        const typedBlob = new Blob([blob], { type: mimetype });
        await saveMediaBlob(attId, typedBlob, fileBaseName, mimetype);

        // Register active object URL in memory
        const objUrl = URL.createObjectURL(typedBlob);
        registerActiveObjectUrl(attId, objUrl);
        restoredMediaCount++;
      } catch (err) {
        console.warn(`Could not restore media ${imgPath}:`, err);
      }

      if (imageFiles.length > 0) {
        const pct = 50 + Math.round(((i + 1) / imageFiles.length) * 45);
        onProgress?.({
          stage: 'Restoring Photos',
          percent: pct,
          detail: `Restored ${i + 1} of ${imageFiles.length} photos...`,
        });
      }
    }

    // Save restored state
    saveLocalDatabase(normalized);

    onProgress?.({ stage: 'Complete', percent: 100, detail: 'Restore complete!' });

    return {
      database: normalized,
      mediaCount: restoredMediaCount,
      message: `Restored ${normalized.products.length} products, ${normalized.specifications.length} specs, ${normalized.reviews.length} reviews, and ${restoredMediaCount} photos.`,
    };
  }

  // Handle JSON File
  if (fileNameLower.endsWith('.json')) {
    onProgress?.({ stage: 'Reading JSON', percent: 40, detail: 'Parsing JSON database...' });
    const text = await file.text();
    const parsed = JSON.parse(text);
    const normalized = normalizeDatabaseState(parsed);

    saveLocalDatabase(normalized);

    onProgress?.({ stage: 'Complete', percent: 100, detail: 'Database restored successfully!' });

    return {
      database: normalized,
      mediaCount: 0,
      message: `Restored ${normalized.products.length} products, ${normalized.specifications.length} specs, and ${normalized.reviews.length} reviews from JSON.`,
    };
  }

  throw new Error('Unsupported backup file format. Please upload a .zip or .json file.');
}
